import { MAX_ATTEMPTS, type Guess } from '../game/rules';

const SQUARE: Record<Guess['result'], string> = {
  correct: '🟩',
  album: '🟦',
  wrong: '🟥',
  skipped: '⬛',
};

/**
 * A Wordle-style result block. Unplayed attempts stay blank so the row length
 * always reads as "out of six".
 */
export function buildShareText(day: number, guesses: Guess[], won: boolean): string {
  const squares = Array.from({ length: MAX_ATTEMPTS }, (_, i) =>
    guesses[i] ? SQUARE[guesses[i].result] : '⬜',
  ).join('');
  const score = won ? `${guesses.length}/${MAX_ATTEMPTS}` : `X/${MAX_ATTEMPTS}`;
  return [`27.GUESSR #${day} — ${score}`, squares, siteUrl()].join('\n');
}

function siteUrl(): string {
  if (typeof window === 'undefined') return '27.guessr';
  return `${window.location.origin}${window.location.pathname}`.replace(/\/index\.html$/, '/');
}

/**
 * Share via the OS sheet where available, otherwise the clipboard. Returns how
 * it went so the UI can show "Skopiowano!" only when something really happened.
 */
export async function shareResult(text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (err) {
      // A user-cancelled share sheet is not a failure worth falling back from.
      if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return legacyCopy(text) ? 'copied' : 'failed';
  }
}

/** Clipboard API needs a secure context; this covers plain-http local testing. */
function legacyCopy(text: string): boolean {
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}
