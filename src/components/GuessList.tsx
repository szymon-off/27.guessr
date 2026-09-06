import { Check, CircleDashed, SkipForward, X } from 'lucide-react';
import { MAX_ATTEMPTS, type Guess } from '../game/rules';

const ICONS = {
  correct: Check,
  album: CircleDashed,
  wrong: X,
  skipped: SkipForward,
} as const;

interface Props {
  guesses: Guess[];
  /** Highlight the row waiting to be filled while the round is live. */
  active: boolean;
}

export function GuessList({ guesses, active }: Props) {
  return (
    <section className="guesses-section" aria-label="Twoje próby">
      {Array.from({ length: MAX_ATTEMPTS }, (_, i) => {
        const guess = guesses[i];
        if (!guess) {
          const isCurrent = active && i === guesses.length;
          return (
            <div
              key={i}
              className={`guess-row ${isCurrent ? 'guess-row--current' : 'guess-row--empty'}`}
            >
              <span className="guess-index">{i + 1}</span>
              <span className="guess-label">{isCurrent ? 'Twoja kolej…' : ''}</span>
            </div>
          );
        }
        const Icon = ICONS[guess.result];
        return (
          <div key={i} className={`guess-row guess-row--${guess.result}`}>
            <Icon className="guess-icon" aria-hidden="true" />
            <span className="guess-label">{guess.label}</span>
            <span className="guess-index">{i + 1}</span>
          </div>
        );
      })}
    </section>
  );
}
