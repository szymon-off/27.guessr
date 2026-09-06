import type { Guess, GameStatus } from '../game/rules';
import { readJson, writeJson } from './store';

export interface RoundProgress {
  songId: string;
  guesses: Guess[];
  status: GameStatus;
}

/** One slot per daily puzzle; practice rounds share a single slot. */
function key(mode: 'daily' | 'practice', day: number): string {
  return mode === 'daily' ? `progress:daily:${day}` : 'progress:practice';
}

export function loadProgress(mode: 'daily' | 'practice', day: number): RoundProgress | null {
  return readJson<RoundProgress | null>(key(mode, day), null);
}

export function saveProgress(
  mode: 'daily' | 'practice',
  day: number,
  progress: RoundProgress,
): void {
  writeJson(key(mode, day), progress);
}

/** Day indices of finished daily rounds, used to dim archive days already played. */
export function loadPlayedDays(): number[] {
  return readJson<number[]>('played-days', []);
}

export function markDayPlayed(day: number): number[] {
  const days = loadPlayedDays();
  if (days.includes(day)) return days;
  const next = [...days, day].sort((a, b) => a - b);
  writeJson('played-days', next);
  return next;
}
