import type { Song } from '../data/catalog';

/**
 * Seconds of audio unlocked at each attempt. Mirrors the timeline markers of
 * the original game: the first snippet is a 0.1 s blip, the last is 16 s.
 */
export const STEPS = [0.1, 0.5, 2, 4, 8, 16] as const;

/**
 * Relative widths of the six timeline segments. Roughly proportional to how
 * much audio each attempt adds, but the first two steps are given more than
 * their share (0.1 s is 0.6% of the bar) so the early segments and their
 * labels stay legible. Same ratios the original game uses.
 */
export const SEGMENT_WEIGHTS = [2, 4, 10, 14, 25, 45] as const;

/**
 * Where each step boundary sits along the bar, as a percentage. Derived from
 * the weights so markers always line up with the segment edges.
 */
export const STEP_OFFSETS: number[] = (() => {
  const total = SEGMENT_WEIGHTS.reduce((sum, w) => sum + w, 0);
  let running = 0;
  return SEGMENT_WEIGHTS.map((w) => {
    running += w;
    return (running / total) * 100;
  });
})();
export const MAX_ATTEMPTS = STEPS.length;
export const FULL_LENGTH = STEPS[STEPS.length - 1];

export type GuessResult = 'correct' | 'album' | 'wrong' | 'skipped';

export interface Guess {
  /** Song id, or null when the attempt was a skip. */
  songId: string | null;
  /** Snapshot of the title so old rounds render even if the catalog changes. */
  label: string;
  result: GuessResult;
}

export type GameStatus = 'playing' | 'won' | 'lost';

/**
 * How much extra audio the next attempt unlocks — the "+0.4s" on the skip
 * button at the start of a round, "+1.5s" after that, and so on.
 */
export function skipGain(step: number): number {
  const next = STEPS[Math.min(step + 1, STEPS.length - 1)];
  return Number((next - STEPS[Math.min(step, STEPS.length - 1)]).toFixed(1));
}

/**
 * A guess is right when it names the same track, near ("album") when it names a
 * different track from the same release, and wrong otherwise. The near state is
 * the amber row of the original — a nudge that you are in the right record.
 */
export function evaluateGuess(guess: Song, answer: Song): GuessResult {
  if (guess.id === answer.id || guess.sortKey === answer.sortKey) return 'correct';
  if (guess.album && answer.album && guess.album === answer.album) return 'album';
  return 'wrong';
}

/** Formats a step length the way the timeline labels it: 0.1s, 2s, 16s. */
export function formatSeconds(seconds: number): string {
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
}
