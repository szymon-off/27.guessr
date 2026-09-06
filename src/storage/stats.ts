import { MAX_ATTEMPTS } from '../game/rules';
import { readJson, writeJson } from './store';

export interface Stats {
  played: number;
  won: number;
  currentStreak: number;
  maxStreak: number;
  /** Wins bucketed by attempt number, index 0 = solved on the first guess. */
  distribution: number[];
  /** Day index of the most recent daily result, for streak continuity. */
  lastDay: number | null;
}

export const EMPTY_STATS: Stats = {
  played: 0,
  won: 0,
  currentStreak: 0,
  maxStreak: 0,
  distribution: Array(MAX_ATTEMPTS).fill(0),
  lastDay: null,
};

export function loadStats(): Stats {
  const stored = readJson<Partial<Stats>>('stats', {});
  return {
    ...EMPTY_STATS,
    ...stored,
    // Guard against a distribution written by an older MAX_ATTEMPTS.
    distribution: Array.from(
      { length: MAX_ATTEMPTS },
      (_, i) => stored.distribution?.[i] ?? 0,
    ),
  };
}

/**
 * Folds one finished daily round into the stats. A streak survives only if the
 * previous recorded win was the day before; anything else restarts it.
 */
export function recordResult(stats: Stats, day: number, won: boolean, attempts: number): Stats {
  if (stats.lastDay === day) return stats; // already counted — don't double-count a replay

  const continues = stats.lastDay !== null && day - stats.lastDay === 1;
  const currentStreak = won ? (continues ? stats.currentStreak : 0) + 1 : 0;
  const distribution = stats.distribution.slice();
  if (won) distribution[attempts - 1] += 1;

  const next: Stats = {
    played: stats.played + 1,
    won: stats.won + (won ? 1 : 0),
    currentStreak,
    maxStreak: Math.max(stats.maxStreak, currentStreak),
    distribution,
    lastDay: day,
  };
  writeJson('stats', next);
  return next;
}

export function winRate(stats: Stats): number {
  return stats.played === 0 ? 0 : Math.round((stats.won / stats.played) * 100);
}
