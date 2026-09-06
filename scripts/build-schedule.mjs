#!/usr/bin/env node
/**
 * Generates and extends src/data/schedule.json — the committed list saying
 * which song belongs to which day.
 *
 * Why a file instead of computing it: the schedule used to be derived by
 * shuffling the whole catalog at run time, which meant adding a single new
 * release reshuffled every day, past ones included. Players' archives and
 * shared results silently stopped matching. Writing the schedule down fixes
 * that — days already in the file are never touched, and new songs only reach
 * days that have not been generated yet.
 *
 * The generator is append-only by construction: it copies existing entries
 * verbatim and only ever adds to the end.
 *
 *   npm run schedule                     # extend to the default horizon
 *   npm run schedule -- --through 2030-01-01
 *   npm run schedule -- --days 900
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CATALOG_FILE = resolve(HERE, '../src/data/catalog.json');
const SCHEDULE_FILE = resolve(HERE, '../src/data/schedule.json');

export const EPOCH = '2026-01-01';
const DAY_MS = 86_400_000;

/** Keep at least this much runway ahead of today so the file never runs dry. */
const DEFAULT_RUNWAY_DAYS = 540;

/* ---- dates --------------------------------------------------------------- */

const warsaw = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Warsaw',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Day 1 is the epoch itself, matching src/game/daily.ts. */
export function dateToDay(date) {
  const a = Date.parse(`${EPOCH}T12:00:00Z`);
  const b = Date.parse(`${date}T12:00:00Z`);
  return Math.round((b - a) / DAY_MS) + 1;
}

export function dayToDate(day) {
  return new Date(Date.parse(`${EPOCH}T12:00:00Z`) + (day - 1) * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/* ---- deterministic shuffling --------------------------------------------- */

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(items, seed) {
  const rand = mulberry32(xmur3(seed)());
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* ---- the generator ------------------------------------------------------- */

/**
 * Rebuilds the schedule out to `targetDays`, keeping the first `frozenThrough`
 * days exactly as they are.
 *
 * Frozen means "already played or playing right now". Those must never move:
 * archives and shared results depend on them. Days beyond that point have not
 * been shown to anyone — future days are locked in the UI — so they are free to
 * be re-dealt. That is what lets a new release reach players within days
 * instead of waiting out however far ahead the file happens to run.
 *
 * Songs are dealt from a "bag": each bag is the whole catalog in a seeded
 * random order, and a new bag only opens once the previous one is empty, which
 * gives the no-repeats-until-everyone-has-played property. A song added to the
 * catalog joins whichever bag is open, so it surfaces within one cycle.
 *
 * Pure and side-effect free so the tests can call it directly.
 */
export function extendSchedule(existingDays, catalog, targetDays, frozenThrough = Infinity) {
  if (catalog.length === 0) throw new Error('catalog is empty');

  const frozen = existingDays.filter((d) => d.day <= frozenThrough);
  const days = frozen.slice();
  let bag = days.length > 0 ? days[days.length - 1].bag : 0;

  // What is still unplayed in the currently open bag.
  const usedInBag = new Set(days.filter((d) => d.bag === bag).map((d) => d.id));
  const byId = new Map(catalog.map((s) => [s.id, s]));
  let pending = shuffled(
    catalog.filter((s) => !usedInBag.has(s.id)),
    `27guessr:bag:${bag}`,
  );

  while (days.length < targetDays) {
    if (pending.length === 0) {
      bag += 1;
      pending = shuffled(catalog, `27guessr:bag:${bag}`);
    }
    const song = pending.shift();
    const day = days.length + 1;
    days.push({ day, date: dayToDate(day), bag, id: song.id, title: song.title });
  }

  // Frozen days whose song has left the store cannot be re-dealt; flag them so
  // they can be repointed by hand.
  const orphans = frozen.filter((d) => !byId.has(d.id));
  return { days, orphans, frozenCount: frozen.length };
}

/* ---- CLI ----------------------------------------------------------------- */

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const catalog = JSON.parse(await readFile(CATALOG_FILE, 'utf8'));
  const existing = existsSync(SCHEDULE_FILE)
    ? JSON.parse(await readFile(SCHEDULE_FILE, 'utf8')).days
    : [];

  const today = dateToDay(warsaw.format(new Date()));
  const through = arg('through');
  const explicitDays = arg('days');
  const target = through
    ? dateToDay(through)
    : Number(explicitDays ?? today + DEFAULT_RUNWAY_DAYS);

  if (!Number.isFinite(target) || target < 1) {
    throw new Error(`bad target: ${through ?? explicitDays}`);
  }
  if (target < existing.length) {
    console.log(
      `Schedule already covers ${existing.length} days (past the requested ${target}). ` +
        'Nothing to do — the generator never removes days.',
    );
    return;
  }

  // Freeze the past, today, and one day of margin — so a deploy landing just
  // before Warsaw midnight cannot swap the song out from under a player.
  const freezeThrough = Number(arg('freeze-through') ?? today + 1);

  const { days, orphans, frozenCount } = extendSchedule(
    existing,
    catalog,
    target,
    freezeThrough,
  );

  // Belt and braces: prove nothing already played moved.
  for (let i = 0; i < Math.min(frozenCount, existing.length); i++) {
    if (days[i].id !== existing[i].id || days[i].day !== existing[i].day) {
      throw new Error(`day ${existing[i].day} changed — refusing to write`);
    }
  }

  await writeFile(
    SCHEDULE_FILE,
    `${JSON.stringify(
      {
        epoch: EPOCH,
        note: 'Generated by scripts/build-schedule.mjs. Append-only — never edit or reorder existing days.',
        poolSize: catalog.length,
        days,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const redealt = Math.max(0, Math.min(existing.length, days.length) - frozenCount);
  console.log(
    `Schedule: ${days.length} days (day 1 = ${dayToDate(1)} → day ${days.length} = ${dayToDate(days.length)})`,
  );
  console.log(
    `  froze ${frozenCount} played day(s) through day ${freezeThrough}, ` +
      `re-dealt ${redealt} future day(s), added ${days.length - existing.length}`,
  );
  console.log(`  today is day ${today}; runway ${days.length - today} days`);
  if (orphans.length > 0) {
    console.warn(`  WARNING: ${orphans.length} scheduled day(s) name a song no longer in the catalog:`);
    for (const o of orphans.slice(0, 10)) console.warn(`    day ${o.day}: ${o.title} (${o.id})`);
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
