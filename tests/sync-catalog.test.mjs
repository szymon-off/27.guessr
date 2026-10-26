/**
 * The catalog sync runs unattended every few hours, so the decision of "is this
 * worth a PR" has to be right without a human watching. These tests pin the
 * cases that matter: Apple's routine URL churn must stay quiet, real changes
 * must get through, and nothing may silently drop a song the schedule uses.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  plan,
  diffCatalogs,
  reviewHints,
  assertPastFrozen,
  titleFor,
  renderReport,
} from '../scripts/sync-catalog.mjs';

const song = (id, title, extra = {}) => ({
  id,
  title,
  sortKey: title.toLowerCase().replace(/[^a-z0-9]+/g, ''),
  artist: '27.Fuckdemons',
  isCollab: false,
  album: title,
  year: 2026,
  releaseDate: '2026-01-01',
  artworkUrl: `https://art/${id}`,
  previewUrl: `https://cdn/${id}-old.m4a`,
  durationMs: 1000,
  appleUrl: `https://apple/${id}`,
  ...extra,
});

const A = song('1', 'Alpha');
const B = song('2', 'Bravo', { releaseDate: '2026-02-01' });
const before = [A, B];

/** Every URL answers unless listed. */
const up = (...dead) => async (url) => !dead.includes(url);

/* ---- routine churn stays quiet ------------------------------------------- */

test('rotated preview URLs whose old link still plays are ignored', async () => {
  const after = before.map((s) => ({ ...s, previewUrl: `https://cdn/${s.id}-new.m4a` }));
  const r = await plan(before, after, up());
  assert.equal(r.action, 'none');
  assert.deepEqual(r.catalog, before);
});

test('artwork, duration and link changes alone are cosmetic', async () => {
  const after = before.map((s) => ({ ...s, artworkUrl: 'x', durationMs: 2, appleUrl: 'y' }));
  const r = await plan(before, after, up());
  assert.equal(r.action, 'none');
});

/* ---- real changes get through -------------------------------------------- */

test('a new song with a working preview is proposed, others stay untouched', async () => {
  const C = song('3', 'Charlie', { releaseDate: '2026-03-01' });
  const rotated = before.map((s) => ({ ...s, previewUrl: `https://cdn/${s.id}-new.m4a` }));
  const r = await plan(before, [...rotated, C], up());
  assert.equal(r.action, 'propose');
  assert.deepEqual(r.added.map((s) => s.id), ['3']);
  // Minimal diff: existing songs keep their old, still-working URLs.
  assert.deepEqual(r.catalog.slice(0, 2), before);
  assert.equal(r.catalog[2].id, '3');
});

test('a new song whose preview does not play yet waits for a later run', async () => {
  const C = song('3', 'Charlie');
  const r = await plan(before, [...before, C], up(C.previewUrl));
  assert.equal(r.action, 'none');
  assert.deepEqual(r.waiting.map((s) => s.id), ['3']);
  assert.deepEqual(r.catalog, before);
});

test('a dead preview link is replaced with the fresh one from Apple', async () => {
  const fresh = { ...A, previewUrl: 'https://cdn/1-new.m4a' };
  const r = await plan(before, [fresh, B], up(A.previewUrl));
  assert.equal(r.action, 'propose');
  assert.deepEqual(r.repaired.map((x) => x.after.id), ['1']);
  assert.equal(r.catalog[0].previewUrl, 'https://cdn/1-new.m4a');
  assert.equal(r.catalog[1].previewUrl, B.previewUrl);
});

test('a changed title is picked up', async () => {
  const r = await plan(before, [{ ...A, title: 'ALPHA' }, B], up());
  assert.equal(r.action, 'propose');
  assert.deepEqual(r.changed[0].fields, ['title']);
  assert.equal(r.catalog[0].title, 'ALPHA');
});

/* ---- songs Apple stops listing ------------------------------------------- */

test('a song that vanished but still plays is kept', async () => {
  const r = await plan(before, [A], up());
  assert.equal(r.action, 'none');
  assert.deepEqual(r.catalog, before);
  assert.deepEqual(r.kept.map((s) => s.id), ['2']);
});

test('a song that vanished and no longer plays needs a human', async () => {
  const C = song('3', 'Charlie');
  const r = await plan(before, [A, C], up(B.previewUrl));
  assert.equal(r.action, 'attention');
  assert.deepEqual(r.dead.map((s) => s.id), ['2']);
  assert.deepEqual(r.catalog, before, 'nothing may be proposed alongside');
  assert.match(renderReport(r), /Bravo/);
});

test('a kept song re-listed under a new id does not become a duplicate', async () => {
  const relisted = { ...B, id: '99', previewUrl: 'https://cdn/99.m4a' };
  const r = await plan(before, [A, relisted], up());
  assert.equal(r.action, 'none');
  assert.deepEqual(r.catalog, before);
  assert.equal(new Set(r.catalog.map((s) => s.sortKey)).size, r.catalog.length);
});

/* ---- helpers ------------------------------------------------------------- */

test('diffCatalogs separates additions, removals, edits and rotations', () => {
  const d = diffCatalogs(before, [
    { ...A, album: 'Other', previewUrl: 'https://cdn/new' },
    song('3', 'Charlie'),
  ]);
  assert.deepEqual(d.added.map((s) => s.id), ['3']);
  assert.deepEqual(d.removed.map((s) => s.id), ['2']);
  assert.deepEqual(d.changed.map((c) => c.fields), [['album']]);
  assert.equal(d.rotated.length, 1);
});

test('reviewHints flags remixes and look-alikes of existing songs', () => {
  assert.equal(reviewHints(song('3', 'Delta (remix)'), before).length, 1);
  const hints = reviewHints(song('4', 'Alpha 2'), before);
  assert.ok(hints.some((h) => h.includes('Alpha')));
  assert.deepEqual(reviewHints(song('5', 'Echo'), before), []);
});

test('assertPastFrozen allows future edits and rejects changes to played days', () => {
  const day = (n, id) => ({ day: n, date: `d${n}`, bag: 0, id, title: id });
  const old = [day(1, 'a'), day(2, 'b'), day(3, 'c')];
  assert.doesNotThrow(() => assertPastFrozen(old, [day(1, 'a'), day(2, 'b'), day(3, 'z')], 2));
  assert.throws(() => assertPastFrozen(old, [day(1, 'a'), day(2, 'z'), day(3, 'c')], 2), /day 2/);
});

test('titles stay short however many songs arrive', () => {
  const s = (t) => ({ title: t });
  assert.equal(titleFor({ added: [s('A'), s('B')] }), 'Catalog: A, B');
  assert.equal(titleFor({ added: [s('A'), s('B'), s('C'), s('D')] }), 'Catalog: 4 new songs');
  assert.equal(titleFor({ added: [], repaired: [1] }), 'Catalog: refresh dead preview links');
  assert.equal(titleFor({ added: [], repaired: [], changed: [] }), 'Schedule: extend the running order');
});
