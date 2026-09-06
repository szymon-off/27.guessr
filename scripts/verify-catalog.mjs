#!/usr/bin/env node
/**
 * Sanity-checks src/data/catalog.json and confirms Apple's preview URLs still
 * resolve. Run after `npm run catalog`, or occasionally to catch a track that
 * was pulled from the store.
 *
 * Usage: npm run catalog:verify [-- --all]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const FILE = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/catalog.json');
const CHECK_ALL = process.argv.includes('--all');
const SAMPLE = 8;

const catalog = JSON.parse(await readFile(FILE, 'utf8'));
const problems = [];

if (catalog.length < 40) problems.push(`only ${catalog.length} tracks, expected 40+`);

const seenKeys = new Set();
const seenIds = new Set();
for (const s of catalog) {
  if (seenKeys.has(s.sortKey)) problems.push(`duplicate sortKey: ${s.sortKey}`);
  if (seenIds.has(s.id)) problems.push(`duplicate id: ${s.id}`);
  seenKeys.add(s.sortKey);
  seenIds.add(s.id);
  for (const field of ['id', 'title', 'sortKey', 'artist', 'previewUrl']) {
    if (!s[field]) problems.push(`${s.title || s.id}: missing ${field}`);
  }
}

const toCheck = CHECK_ALL
  ? catalog
  : catalog.filter((_, i) => i % Math.ceil(catalog.length / SAMPLE) === 0);

console.log(`Checking ${toCheck.length} of ${catalog.length} preview URLs...`);
const results = await Promise.all(
  toCheck.map(async (s) => {
    try {
      const res = await fetch(s.previewUrl, { method: 'HEAD' });
      return { s, ok: res.ok, status: res.status };
    } catch (err) {
      return { s, ok: false, status: err.message };
    }
  }),
);
for (const { s, ok, status } of results) {
  if (!ok) problems.push(`preview ${status} for "${s.title}" (${s.id})`);
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`OK — ${catalog.length} tracks, all sampled previews reachable.`);
