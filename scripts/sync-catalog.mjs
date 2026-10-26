#!/usr/bin/env node
/**
 * Keeps src/data/catalog.json and src/data/schedule.json current — the work
 * behind .github/workflows/sync-catalog.yml, also usable by hand.
 *
 * It refetches the catalog from Apple and then decides whether anything is
 * worth a pull request, because a blind refetch is mostly noise: Apple rotates
 * the preview URLs on a dozen tracks every few weeks and the old ones keep
 * working. So it only proposes a change for:
 *
 *   - a new song (its preview must already play, otherwise it waits a run),
 *   - a preview link that actually stopped working,
 *   - a title / credit / album / release-date change on an existing song,
 *   - a schedule that is running low on days.
 *
 * Everything else is thrown away, including cosmetic churn on existing tracks.
 *
 * Guard rails:
 *   - A song Apple stopped listing is kept while its preview still plays. If
 *     the preview is dead too, nothing is proposed and a human is asked to look,
 *     since that song may already sit on a played day.
 *   - The schedule is locked FREEZE_AHEAD_DAYS ahead, and after rescheduling
 *     every locked day is proven identical to what was there before. The
 *     archive must never move, even if the PR waits days for a merge.
 *
 *   npm run sync                      # edits src/data, prints what it did
 *   npm run sync -- --report out.md   # also writes the PR / issue body
 *
 * Inside GitHub Actions it also sets the step outputs `action`
 * (none | propose | attention) and `title`.
 */
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { dayToDate, todayDay } from './build-schedule.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG_FILE = resolve(HERE, '../src/data/catalog.json');
const SCHEDULE_FILE = resolve(HERE, '../src/data/schedule.json');

/**
 * Top the schedule up once less than this much is left. The generator tops up
 * to 540 days, and the tests only turn red below 180, so this leaves the repo
 * months to merge the PR.
 */
export const MIN_RUNWAY_DAYS = 365;

/**
 * The sync runs weekly and its PR may sit open for days, so the schedule is
 * frozen this far ahead rather than just through tomorrow. A PR stays safe to
 * merge until the frozen window runs out, i.e. for about a week. A new song
 * therefore first plays roughly nine days out.
 */
export const FREEZE_AHEAD_DAYS = 9;

/** Fields a player can notice. Artwork, durations and links are cosmetic. */
const MEANINGFUL = ['title', 'artist', 'album', 'isCollab', 'year', 'releaseDate'];

const VARIANT_WORDS =
  /\b(remix|instrumental|live|acoustic|sped up|slowed|reverb|version|edit|cover|demo|skit|intro|outro)\b/i;

const byRelease = (a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.id.localeCompare(b.id);

/* ---- comparing catalogs -------------------------------------------------- */

export function diffCatalogs(before, after) {
  const prev = new Map(before.map((s) => [s.id, s]));
  const next = new Map(after.map((s) => [s.id, s]));
  const added = after.filter((s) => !prev.has(s.id));
  const removed = before.filter((s) => !next.has(s.id));
  const changed = [];
  const rotated = [];
  for (const song of after) {
    const old = prev.get(song.id);
    if (!old) continue;
    const fields = MEANINGFUL.filter((f) => old[f] !== song[f]);
    if (fields.length > 0) changed.push({ before: old, after: song, fields });
    if (old.previewUrl !== song.previewUrl) rotated.push({ before: old, after: song });
  }
  return { added, removed, changed, rotated };
}

/**
 * Advisory only: songs a maintainer may not want as a puzzle. The game has
 * remixes on purpose, so these never block anything.
 */
export function reviewHints(song, catalog) {
  const hints = [];
  if (VARIANT_WORDS.test(song.title)) hints.push('title looks like a variant (remix, live, …)');
  const base = catalog.find(
    (o) => o.id !== song.id && o.sortKey.length >= 4 && song.sortKey.startsWith(o.sortKey),
  );
  if (base) hints.push(`similar to existing “${base.title}”`);
  return hints;
}

export async function isReachable(url, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(url, { method: 'HEAD', signal: AbortSignal.timeout(15_000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Decides what a fresh Apple response means for the committed catalog.
 * `reachable(url)` is injected so tests need no network.
 *
 * Returns { action, catalog, ... } where action is
 *   'none'      — nothing worth a PR; `catalog` equals `before`
 *   'propose'   — `catalog` is the one to commit
 *   'attention' — a song is gone for good; `dead` lists it, nothing to commit
 */
export async function plan(before, after, reachable) {
  const diff = diffCatalogs(before, after);

  // Songs Apple stopped listing. Playable ones stay; ids in the schedule must
  // keep resolving. A dead one needs a human.
  const aliveGone = await Promise.all(diff.removed.map((s) => reachable(s.previewUrl)));
  const dead = diff.removed.filter((_, i) => !aliveGone[i]);
  if (dead.length > 0) return { action: 'attention', catalog: before, dead, diff };
  const kept = diff.removed;

  // A kept song re-listed under a new id would duplicate it; the old id is the
  // one the schedule knows.
  const keptKeys = new Set(kept.map((s) => s.sortKey));
  const relisted = diff.added.filter((s) => keptKeys.has(s.sortKey));
  const fresh = diff.added.filter((s) => !keptKeys.has(s.sortKey));

  const freshOk = await Promise.all(fresh.map((s) => reachable(s.previewUrl)));
  const added = fresh.filter((_, i) => freshOk[i]);
  const waiting = fresh.filter((_, i) => !freshOk[i]);

  // New preview links are adopted only where the old one is dead.
  const oldAlive = await Promise.all(diff.rotated.map((r) => reachable(r.before.previewUrl)));
  const repaired = diff.rotated.filter((_, i) => !oldAlive[i]);
  const repairedIds = new Set(repaired.map((r) => r.after.id));

  const skip = new Set([...waiting, ...relisted].map((s) => s.id));
  const prev = new Map(before.map((s) => [s.id, s]));
  const merged = after
    .filter((s) => !skip.has(s.id))
    .map((s) => {
      const old = prev.get(s.id);
      if (!old) return s;
      const preview = repairedIds.has(s.id) ? s.previewUrl : old.previewUrl;
      const meaningful = MEANINGFUL.some((f) => old[f] !== s[f]);
      return { ...(meaningful ? s : old), previewUrl: preview };
    });
  const catalog = [...merged, ...kept].sort(byRelease);

  const hints = new Map(added.map((s) => [s.id, reviewHints(s, before)]));
  const same = JSON.stringify(catalog) === JSON.stringify(before);
  return {
    action: same ? 'none' : 'propose',
    catalog,
    added,
    repaired,
    changed: diff.changed,
    waiting,
    kept,
    hints,
    diff,
  };
}

/** Days up to `through` must be byte-for-byte what they were. */
export function assertPastFrozen(oldDays, newDays, through) {
  for (const d of oldDays) {
    if (d.day > through) break;
    if (JSON.stringify(d) !== JSON.stringify(newDays[d.day - 1])) {
      throw new Error(`day ${d.day} (${d.date}) changed — refusing to continue`);
    }
  }
}

/* ---- the report ---------------------------------------------------------- */

export function titleFor(r) {
  if (r.added?.length > 0) {
    const names = r.added.map((s) => s.title);
    return `Catalog: ${names.length <= 3 ? names.join(', ') : `${names.length} new songs`}`;
  }
  if (r.repaired?.length > 0) return 'Catalog: refresh dead preview links';
  if (r.changed?.length > 0) return 'Catalog: update song details';
  return 'Schedule: extend the running order';
}

const cell = (text) => String(text).replace(/\|/g, '\\|');
const date = (s) => s.releaseDate || '—';

export function renderReport(r) {
  const out = [];

  if (r.action === 'attention') {
    out.push(
      'Apple no longer lists the songs below, and their preview links are dead too. ' +
        'They may already sit on a played day, so nothing was changed and no PR is opened ' +
        'until someone decides.',
      '',
      ...r.dead.map((s) => `- **${s.title}** — ${s.artist} (${date(s)}, id \`${s.id}\`)`),
      '',
      'To fix: check the track on Apple Music, then either restore a working preview URL in ' +
        '`src/data/catalog.json` by hand or, if it is really gone, run `npm run catalog`, repoint ' +
        'the orphaned days in `src/data/schedule.json`, and merge that yourself.',
      '',
      'This issue closes itself once the sync runs clean again.',
    );
    return out.join('\n');
  }

  if (r.added.length > 0) {
    out.push(
      '### New songs',
      '',
      '| Song | Credit | Released | First plays | Notes |',
      '| --- | --- | --- | --- | --- |',
      ...r.added.map((s) => {
        const first = r.firstPlay.get(s.id);
        const notes = (r.hints.get(s.id) ?? []).join('; ');
        return `| ${cell(s.title)} | ${cell(s.artist)} | ${date(s)} | ${first ?? '—'} | ${cell(notes)} |`;
      }),
      '',
    );
    if ([...r.hints.values()].some((h) => h.length > 0)) {
      out.push(
        'Notes are hints, not blockers — the game already has remixes. If one of these should not ' +
          'be a puzzle, drop it from the catalog before merging.',
        '',
      );
    }
  }
  if (r.repaired.length > 0) {
    out.push(
      '### Preview links replaced',
      '',
      'The old URL stopped responding, so the new one from Apple is used:',
      '',
      ...r.repaired.map((x) => `- ${x.after.title}`),
      '',
    );
  }
  if (r.changed.length > 0) {
    out.push(
      '### Changed details',
      '',
      ...r.changed.flatMap((c) =>
        c.fields.map((f) => `- **${c.after.title}** · ${f}: \`${c.before[f]}\` → \`${c.after[f]}\``),
      ),
      '',
    );
  }
  if (r.waiting.length > 0) {
    out.push(
      '### Waiting',
      '',
      'Listed by Apple but the preview does not play yet; picked up on a later run:',
      '',
      ...r.waiting.map((s) => `- ${s.title}`),
      '',
    );
  }
  if (r.kept.length > 0) {
    out.push(
      '### No longer listed by Apple (kept)',
      '',
      'Their previews still play, so they stay in the game:',
      '',
      ...r.kept.map((s) => `- ${s.title}`),
      '',
    );
  }

  out.push(
    '### Schedule',
    '',
    `- Days 1–${r.frozenThrough} (played, playing, or locked for the week ahead) are verified identical to \`main\`.`,
    `- ${r.scheduleDays} days now, through ${r.scheduleEnd}; ${r.runway} days of runway.`,
    '',
    'Merge within a week. The schedule is locked for the next nine days, so this PR cannot ' +
      'touch a song that has been played by then; a PR left open longer could. The next weekly ' +
      'run rebuilds it from `main` anyway.',
  );
  return out.join('\n');
}

/* ---- CLI ----------------------------------------------------------------- */

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

function runScript(file, args = []) {
  try {
    return execFileSync(process.execPath, [resolve(HERE, file), ...args], { encoding: 'utf8' });
  } catch (err) {
    throw new Error(`${file} failed:\n${err.stderr || err.stdout || err.message}`);
  }
}

async function setOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(values).map(([k, v]) => `${k}=${String(v).replace(/\r?\n/g, ' ')}`);
  await appendFile(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}

async function finish(result, report) {
  const reportPath = arg('report');
  if (reportPath) await writeFile(reportPath, `${report}\n`, 'utf8');
  await setOutputs({ action: result.action, title: result.title ?? '' });
}

async function main() {
  const catalogText = await readFile(CATALOG_FILE, 'utf8');
  const before = JSON.parse(catalogText);
  const scheduleBefore = JSON.parse(await readFile(SCHEDULE_FILE, 'utf8')).days;

  runScript('build-catalog.mjs');
  const after = JSON.parse(await readFile(CATALOG_FILE, 'utf8'));
  // build-catalog writes in place; put the original back until we know better.
  await writeFile(CATALOG_FILE, catalogText, 'utf8');

  const result = await plan(before, after, isReachable);
  const today = todayDay();
  const runway = scheduleBefore.length - today;

  if (result.action === 'attention') {
    console.error(`Attention: ${result.dead.length} song(s) gone from Apple with dead previews:`);
    for (const s of result.dead) console.error(`  - ${s.title} (${s.id})`);
    await finish(result, renderReport(result));
    return;
  }

  const lowRunway = runway < MIN_RUNWAY_DAYS;
  if (result.action === 'none' && !lowRunway) {
    console.log(`Up to date: ${before.length} songs, ${runway} days of runway.`);
    for (const s of result.waiting) console.log(`  waiting for a working preview: ${s.title}`);
    await finish(result, 'Catalog and schedule are up to date.');
    return;
  }

  if (result.action === 'propose') {
    await writeFile(CATALOG_FILE, `${JSON.stringify(result.catalog, null, 2)}\n`, 'utf8');
  }
  const frozenThrough = today + FREEZE_AHEAD_DAYS;
  runScript('build-schedule.mjs', ['--freeze-through', String(frozenThrough)]);

  const schedule = JSON.parse(await readFile(SCHEDULE_FILE, 'utf8')).days;
  assertPastFrozen(scheduleBefore, schedule, frozenThrough);

  const firstPlay = new Map();
  for (const song of result.added ?? []) {
    const hit = schedule.find((d) => d.id === song.id && d.day > frozenThrough);
    if (hit) firstPlay.set(song.id, hit.date);
  }

  const full = {
    ...result,
    action: 'propose',
    added: result.added ?? [],
    repaired: result.repaired ?? [],
    changed: result.changed ?? [],
    waiting: result.waiting ?? [],
    kept: result.kept ?? [],
    hints: result.hints ?? new Map(),
    firstPlay,
    frozenThrough,
    scheduleDays: schedule.length,
    scheduleEnd: dayToDate(schedule.length),
    runway: schedule.length - today,
  };
  full.title = titleFor(full);

  console.log(full.title);
  console.log(`  +${full.added.length} new, ${full.repaired.length} previews replaced, ` +
    `${full.changed.length} changed, schedule ${schedule.length} days`);
  await finish(full, renderReport(full));
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
