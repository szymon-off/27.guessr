/**
 * Thin, failure-tolerant localStorage wrapper. Private-mode Safari and
 * cookie-blocking setups throw on access, and the game must stay playable
 * without persistence, so every read and write is guarded.
 */
const NS = '27guessr:v1';

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${NS}:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(`${NS}:${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable or full — the round still plays, it just won't resume */
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(`${NS}:${key}`);
  } catch {
    /* nothing to do */
  }
}
