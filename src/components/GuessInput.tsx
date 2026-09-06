import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, SkipForward, X } from 'lucide-react';
import { searchSongs, type Song } from '../data/catalog';
import { skipGain } from '../game/rules';

interface Props {
  step: number;
  disabled: boolean;
  onGuess: (song: Song) => void;
  onSkip: () => void;
}

/**
 * Title search with a keyboard-navigable suggestion list. A guess only counts
 * when it resolves to a catalog entry, so typos can't silently burn an attempt.
 */
export function GuessInput({ step, disabled, onGuess, onSkip }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Song | null>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => (selected ? [] : searchSongs(query)), [query, selected]);

  // Clear the field when a new round starts.
  useEffect(() => {
    setQuery('');
    setSelected(null);
    setOpen(false);
  }, [disabled]);

  // Clicking outside dismisses the list without clearing what was typed.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const choose = (song: Song) => {
    setSelected(song);
    setQuery(song.title);
    setOpen(false);
  };

  const clear = () => {
    setQuery('');
    setSelected(null);
    setOpen(false);
  };

  const submit = () => {
    // Fall back to the single best match so Enter works without picking a row.
    const song = selected ?? searchSongs(query, 1)[0];
    if (!song) return;
    onGuess(song);
    clear();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (suggestions.length === 0) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => {
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        return (h + delta + suggestions.length) % suggestions.length;
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (open && suggestions[highlight]) choose(suggestions[highlight]);
      else submit();
      return;
    }
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  const canGuess = !disabled && (selected !== null || searchSongs(query, 1).length > 0);

  return (
    <section className="action-section">
      <div className="input-area">
        <div className="search-wrap" ref={wrapRef}>
          <Search className="search-icon" aria-hidden="true" />
          <input
            type="text"
            className="search-input"
            placeholder="Wpisz tytuł utworu 27.Fuckdemons…"
            value={query}
            disabled={disabled}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-controls="guess-suggestions"
            aria-autocomplete="list"
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
              setHighlight(0);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
          />
          {query && !disabled && (
            <button type="button" className="search-clear" onClick={clear} aria-label="Wyczyść">
              <X className="icon-sm" aria-hidden="true" />
            </button>
          )}

          {open && suggestions.length > 0 && (
            <ul className="suggestions" id="guess-suggestions" role="listbox">
              {suggestions.map((song, i) => (
                <li key={song.id} role="option" aria-selected={i === highlight}>
                  <button
                    type="button"
                    className={`suggestion-item${i === highlight ? ' suggestion-item--active' : ''}`}
                    onMouseEnter={() => setHighlight(i)}
                    onClick={() => choose(song)}
                  >
                    <span className="suggestion-title">{song.title}</span>
                    <span className="suggestion-meta">
                      {song.isCollab ? song.artist : song.album}
                      {song.year ? ` · ${song.year}` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="action-btns">
          <button type="button" className="btn-skip" onClick={onSkip} disabled={disabled}>
            <SkipForward className="icon-sm" aria-hidden="true" />
            Pomiń (+{skipGain(step)}s)
          </button>
          <button type="button" className="btn-guess" onClick={submit} disabled={!canGuess}>
            Zgadnij
          </button>
        </div>
      </div>
    </section>
  );
}
