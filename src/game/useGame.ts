import { useCallback, useEffect, useMemo, useReducer } from 'react';
import { songById, type Song } from '../data/catalog';
import { randomSong, songForDay } from './daily';
import { MAX_ATTEMPTS, evaluateGuess, type GameStatus, type Guess } from './rules';
import { loadProgress, markDayPlayed, saveProgress } from '../storage/progress';
import { loadStats, recordResult, type Stats } from '../storage/stats';

export type Mode = 'daily' | 'practice';

interface State {
  song: Song;
  guesses: Guess[];
  status: GameStatus;
  stats: Stats;
}

type Action =
  | { type: 'start'; song: Song; guesses: Guess[]; status: GameStatus }
  | { type: 'guess'; song: Song }
  | { type: 'skip' }
  | { type: 'stats'; stats: Stats };

function nextStatus(guesses: Guess[]): GameStatus {
  if (guesses.at(-1)?.result === 'correct') return 'won';
  return guesses.length >= MAX_ATTEMPTS ? 'lost' : 'playing';
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'start':
      return { ...state, song: action.song, guesses: action.guesses, status: action.status };
    case 'stats':
      return { ...state, stats: action.stats };
    case 'guess': {
      if (state.status !== 'playing') return state;
      const guesses = [
        ...state.guesses,
        {
          songId: action.song.id,
          label: action.song.title,
          result: evaluateGuess(action.song, state.song),
        },
      ];
      return { ...state, guesses, status: nextStatus(guesses) };
    }
    case 'skip': {
      if (state.status !== 'playing') return state;
      const guesses: Guess[] = [
        ...state.guesses,
        { songId: null, label: 'Pominięto', result: 'skipped' },
      ];
      return { ...state, guesses, status: nextStatus(guesses) };
    }
  }
}

/** Restores a saved round, or opens a fresh one for this mode and day. */
function initialise(mode: Mode, day: number): Omit<State, 'stats'> {
  const saved = loadProgress(mode, day);
  const savedSong = saved && songById(saved.songId);
  if (saved && savedSong) {
    return { song: savedSong, guesses: saved.guesses, status: saved.status };
  }
  const song = mode === 'daily' ? songForDay(day) : randomSong();
  return { song, guesses: [], status: 'playing' };
}

export interface Game extends State {
  /** How many seconds of audio are unlocked: one step per attempt spent. */
  step: number;
  submit: (song: Song) => void;
  skip: () => void;
  /** Practice only — deal a new song. */
  again: () => void;
}

export function useGame(mode: Mode, day: number): Game {
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    ...initialise(mode, day),
    stats: loadStats(),
  }));

  // Swapping mode or archive day loads that round's own saved progress.
  useEffect(() => {
    dispatch({ type: 'start', ...initialise(mode, day) });
  }, [mode, day]);

  // Persist after every change so a refresh mid-round resumes where it left off.
  useEffect(() => {
    saveProgress(mode, day, {
      songId: state.song.id,
      guesses: state.guesses,
      status: state.status,
    });
  }, [mode, day, state.song.id, state.guesses, state.status]);

  // A finished daily round counts once, towards streaks and the histogram.
  const finishedAttempts = state.status === 'playing' ? 0 : state.guesses.length;
  useEffect(() => {
    if (mode !== 'daily' || finishedAttempts === 0) return;
    markDayPlayed(day);
    const stored = loadStats();
    // recordResult is a no-op when this day is already the last one counted.
    const updated = recordResult(stored, day, state.status === 'won', finishedAttempts);
    dispatch({ type: 'stats', stats: updated });
    // state.status is stable while finishedAttempts is non-zero, so this runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, day, finishedAttempts]);

  const again = useCallback(() => {
    dispatch({ type: 'start', song: randomSong([state.song.id]), guesses: [], status: 'playing' });
  }, [state.song.id]);

  const submit = useCallback((song: Song) => dispatch({ type: 'guess', song }), []);
  const skip = useCallback(() => dispatch({ type: 'skip' }), []);

  const step = useMemo(
    () => Math.min(state.guesses.length, MAX_ATTEMPTS - 1),
    [state.guesses.length],
  );

  return { ...state, step, submit, skip, again };
}
