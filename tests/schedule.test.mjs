/**
 * The schedule is the game's source of truth for "which song on which day".
 *
 * The property that matters most is stability: adding a new release must never
 * change a day that has already been published, because players' archives and
 * shared results depend on it. That used to be broken — the running order was
 * derived by shuffling the catalog at run time, so one extra song reshuffled
 * every day, past ones included. These tests exist so it cannot regress.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extendSchedule, dateToDay, dayToDate } from '../scripts/build-schedule.mjs';

const read = (name) =>
  JSON.parse(readFileSync(new URL(`../src/data/${name}`, import.meta.url), 'utf8'));

const catalog = read('catalog.json');
const schedule = read('schedule.json');
const days = schedule.days;

/* ---- the committed file -------------------------------------------------- */

test('catalog is non-empty and free of duplicates', () => {
  assert.ok(catalog.length >= 40, `expected 40+ songs, got ${catalog.length}`);
  assert.equal(new Set(catalog.map((s) => s.id)).size, catalog.length);
  assert.equal(new Set(catalog.map((s) => s.sortKey)).size, catalog.length);
  for (const song of catalog) assert.ok(song.previewUrl.startsWith('https://'));
});

test('days are contiguous from 1 and carry the right date', () => {
  assert.ok(days.length > 0, 'schedule is empty — run: npm run schedule');
  days.forEach((entry, i) => {
    assert.equal(entry.day, i + 1, `entry ${i} has day ${entry.day}`);
    assert.equal(entry.date, dayToDate(entry.day), `day ${entry.day} has the wrong date`);
  });
});

test('every scheduled song is in the catalog', () => {
  const ids = new Set(catalog.map((s) => s.id));
  const missing = days.filter((d) => !ids.has(d.id));
  assert.deepEqual(
    missing.map((d) => `day ${d.day}: ${d.title}`),
    [],
    'scheduled songs are no longer in the catalog',
  );
});

test('no song repeats until the whole pool has played', () => {
  const seen = new Map();
  for (const entry of days) {
    const bag = seen.get(entry.bag) ?? new Set();
    assert.ok(
      !bag.has(entry.id),
      `"${entry.title}" repeats inside bag ${entry.bag} (day ${entry.day})`,
    );
    bag.add(entry.id);
    seen.set(entry.bag, bag);
  }
});

test('bags open in order and never reopen', () => {
  let current = days[0].bag;
  for (const entry of days) {
    assert.ok(
      entry.bag === current || entry.bag === current + 1,
      `day ${entry.day} jumped from bag ${current} to ${entry.bag}`,
    );
    current = entry.bag;
  }
});

/* ---- the property the whole file exists for ------------------------------ */

test('a new release does not move any day that has already played', () => {
  // What the generator actually freezes: everything up to today, plus a day of
  // margin. Later days have never been shown to anyone — future days are locked
  // in the UI — so they are allowed to be re-dealt.
  const today = dateToDay(new Date().toISOString().slice(0, 10));
  const freeze = today + 1;
  const grown = [
    ...catalog,
    { id: 'new-single-1', title: 'NOWY SINGIEL', sortKey: 'nowysingiel' },
    { id: 'new-single-2', title: 'DRUGI NOWY', sortKey: 'druginowy' },
  ];
  const { days: after } = extendSchedule(days, grown, days.length, freeze);

  for (const played of days.filter((d) => d.day <= freeze)) {
    assert.deepEqual(
      after[played.day - 1],
      played,
      `day ${played.day} changed after adding a song — archives would break`,
    );
  }
});

test('a new release reaches players within one pool cycle, not at the horizon', () => {
  // The bug this guards: freezing every day already written meant a new single
  // could not play until the schedule ran out — over a year away.
  const today = dateToDay(new Date().toISOString().slice(0, 10));
  const grown = [...catalog, { id: 'new-single-1', title: 'NOWY SINGIEL' }];
  const { days: after } = extendSchedule(days, grown, days.length, today + 1);

  const first = after.find((d) => d.id === 'new-single-1');
  assert.ok(first, 'a newly added song never appeared in the schedule');
  const wait = first.day - today;
  assert.ok(
    wait <= catalog.length + 2,
    `new release would wait ${wait} days (pool is ${catalog.length})`,
  );
});

test('regenerating with an unchanged catalog is a no-op', () => {
  const { days: again } = extendSchedule(days, catalog, days.length);
  assert.deepEqual(again, days);
});

test('a song leaving the catalog is reported, not silently dropped', () => {
  const shrunk = catalog.filter((s) => s.id !== days[0].id);
  const { orphans } = extendSchedule(days, shrunk, days.length, days.length);
  assert.ok(
    orphans.some((o) => o.id === days[0].id),
    'a scheduled song missing from the catalog was not flagged',
  );
});

/* ---- runway -------------------------------------------------------------- */

test('schedule still has at least 180 days of runway', () => {
  const today = dateToDay(new Date().toISOString().slice(0, 10));
  const runway = days.length - today;
  assert.ok(
    runway >= 180,
    `only ${runway} days left (through ${dayToDate(days.length)}) — run: npm run schedule`,
  );
});
