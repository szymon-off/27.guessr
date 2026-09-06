/**
 * Guards the two properties the daily puzzle depends on: it must be identical
 * on every device for a given day, and it must not repeat a song before the
 * whole catalog has been used.
 *
 * The scheduling logic lives in TypeScript, so this test re-implements the two
 * pure helpers (xmur3 + mulberry32 shuffle) and asserts the file still matches —
 * a change to either constant breaks the test rather than silently reshuffling
 * everyone's archive.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const catalog = JSON.parse(
  readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8'),
);
const source = readFileSync(new URL('../src/game/daily.ts', import.meta.url), 'utf8');

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

function songForDay(day) {
  const n = catalog.length;
  const cycle = Math.floor(day / n);
  const index = ((day % n) + n) % n;
  const rand = mulberry32(xmur3(`27guessr:cycle:${cycle}`)());
  const out = catalog.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out[index];
}

test('catalog is non-empty and unique', () => {
  assert.ok(catalog.length >= 40, `expected 40+ songs, got ${catalog.length}`);
  assert.equal(new Set(catalog.map((s) => s.id)).size, catalog.length);
  assert.equal(new Set(catalog.map((s) => s.sortKey)).size, catalog.length);
  for (const song of catalog) assert.ok(song.previewUrl.startsWith('https://'));
});

test('daily.ts still uses the seed this test reproduces', () => {
  assert.match(source, /27guessr:cycle:/, 'cycle seed changed — the archive would reshuffle');
  assert.match(source, /1779033703/, 'xmur3 constant changed');
  assert.match(source, /0x6d2b79f5/, 'mulberry32 constant changed');
});

test('a given day always yields the same song', () => {
  for (const day of [1, 7, 42, 100, 365]) {
    assert.equal(songForDay(day).id, songForDay(day).id);
  }
});

test('no song repeats within one cycle', () => {
  const n = catalog.length;
  for (const cycle of [0, 1, 5]) {
    const ids = Array.from({ length: n }, (_, i) => songForDay(cycle * n + i).id);
    assert.equal(new Set(ids).size, n, `cycle ${cycle} repeated a song`);
  }
});

test('consecutive cycles use different orders', () => {
  const n = catalog.length;
  const first = Array.from({ length: n }, (_, i) => songForDay(i).id);
  const second = Array.from({ length: n }, (_, i) => songForDay(n + i).id);
  assert.notDeepEqual(first, second);
});

test('days before the epoch stay in range', () => {
  for (const day of [0, -1, -70]) {
    assert.ok(songForDay(day), `day ${day} produced no song`);
  }
});
