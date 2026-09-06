import { CATALOG, type Song } from '../data/catalog';

/** Day #1 of 27.GUESSR. The archive never goes further back than this. */
export const EPOCH = '2026-01-01';
const DAY_MS = 86_400_000;
const TIMEZONE = 'Europe/Warsaw';

const plDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * The civil date in Poland as YYYY-MM-DD, so the puzzle rolls over at Polish
 * midnight no matter where the player is.
 */
export function warsawDate(at: Date = new Date()): string {
  return plDate.format(at);
}

/** Whole days between two YYYY-MM-DD dates, counted at UTC noon to dodge DST. */
function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

export function dateToDay(date: string): number {
  return daysBetween(EPOCH, date);
}

export function dayToDate(day: number): string {
  return new Date(Date.parse(`${EPOCH}T12:00:00Z`) + day * DAY_MS).toISOString().slice(0, 10);
}

export function todayDay(at: Date = new Date()): number {
  return dateToDay(warsawDate(at));
}

/* ---- deterministic shuffling -------------------------------------------- */

/** xmur3 string hash — turns a seed string into a 32-bit state. */
function xmur3(str: string): () => number {
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

/** mulberry32 PRNG — small, fast, good enough for shuffling a playlist. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], seed: string): T[] {
  const rand = mulberry32(xmur3(seed)());
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const cycleCache = new Map<number, Song[]>();

/**
 * The playlist for one pass through the catalog. Each cycle is its own
 * permutation, so every song appears exactly once per `CATALOG.length` days
 * and the order changes when the cycle rolls over.
 */
function cyclePlaylist(cycle: number): Song[] {
  let list = cycleCache.get(cycle);
  if (!list) {
    list = shuffled(CATALOG, `27guessr:cycle:${cycle}`);
    cycleCache.set(cycle, list);
  }
  return list;
}

/**
 * The song for a given day. Pure and reproducible on any device — no server,
 * no stored schedule.
 */
export function songForDay(day: number): Song {
  const n = CATALOG.length;
  // Floor division so negative days (before the epoch) still land in range.
  const cycle = Math.floor(day / n);
  const index = ((day % n) + n) % n;
  return cyclePlaylist(cycle)[index];
}

/** A random song for practice mode, avoiding the ids passed in where possible. */
export function randomSong(exclude: readonly string[] = []): Song {
  const pool = CATALOG.filter((s) => !exclude.includes(s.id));
  const from = pool.length > 0 ? pool : CATALOG;
  return from[Math.floor(Math.random() * from.length)];
}

const plLong = new Intl.DateTimeFormat('pl-PL', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** "5 września 2026" */
export function formatDay(day: number): string {
  return plLong.format(new Date(`${dayToDate(day)}T12:00:00Z`));
}
