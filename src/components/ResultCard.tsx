import { useState } from 'react';
import { ExternalLink, RotateCcw, Share2 } from 'lucide-react';
import type { Song } from '../data/catalog';
import type { Guess } from '../game/rules';
import { buildShareText, shareResult } from '../storage/share';
import type { Mode } from '../game/useGame';

interface Props {
  song: Song;
  guesses: Guess[];
  won: boolean;
  mode: Mode;
  day: number;
  onAgain: () => void;
}

export function ResultCard({ song, guesses, won, mode, day, onAgain }: Props) {
  const [shareLabel, setShareLabel] = useState('Udostępnij');

  const share = async () => {
    const outcome = await shareResult(buildShareText(day, guesses, won));
    setShareLabel(
      outcome === 'failed' ? 'Nie udało się' : outcome === 'shared' ? 'Wysłano!' : 'Skopiowano!',
    );
    setTimeout(() => setShareLabel('Udostępnij'), 2200);
  };

  return (
    <section className={`result-card${won ? ' result-card--won' : ''}`} aria-live="polite">
      <span className="result-headline">
        {won ? `Trafione w ${guesses.length}/6` : 'Nie tym razem'}
      </span>

      {song.artworkUrl && (
        <img className="result-art" src={song.artworkUrl} alt={`Okładka: ${song.album}`} />
      )}

      <div>
        <h2 className="result-title">{song.title}</h2>
        <div className="result-artist">{song.artist}</div>
      </div>
      <div className="result-meta">
        {song.album}
        {song.year ? ` · ${song.year}` : ''}
      </div>

      <div className="result-actions">
        {mode === 'daily' ? (
          <button type="button" className="result-btn result-btn--primary" onClick={share}>
            <Share2 className="icon-sm" aria-hidden="true" />
            {shareLabel}
          </button>
        ) : (
          <button type="button" className="result-btn result-btn--primary" onClick={onAgain}>
            <RotateCcw className="icon-sm" aria-hidden="true" />
            Następny utwór
          </button>
        )}
        {song.appleUrl && (
          <a
            className="result-btn"
            href={song.appleUrl}
            target="_blank"
            rel="noreferrer noopener"
          >
            <ExternalLink className="icon-sm" aria-hidden="true" />
            Posłuchaj
          </a>
        )}
      </div>
    </section>
  );
}
