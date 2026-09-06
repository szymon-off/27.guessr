import raw from './catalog.json';

export interface Song {
  /** Apple Music track id — stable across catalog rebuilds. */
  id: string;
  /** Display title, with Apple's title-casing corrected where needed. */
  title: string;
  /** Diacritic-folded, punctuation-free key used for matching and dedupe. */
  sortKey: string;
  /** Full credit line, e.g. "27.Fuckdemons & Petito". */
  artist: string;
  isCollab: boolean;
  album: string;
  year: number | null;
  releaseDate: string;
  artworkUrl: string | null;
  previewUrl: string;
  durationMs: number | null;
  appleUrl: string | null;
}

export const CATALOG = raw as Song[];

/** Fold a user-typed string the same way build-catalog.mjs folds titles. */
export function fold(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '');
}

/** Precomputed haystacks so autocomplete never re-folds the catalog per keystroke. */
const INDEX = CATALOG.map((song) => ({
  song,
  title: fold(song.title),
  artist: fold(song.artist),
  album: fold(song.album),
}));

/** Substring search over title, credit line and album. Diacritic-insensitive. */
export function searchSongs(query: string, limit = 8): Song[] {
  const q = fold(query);
  if (!q) return [];
  const starts: Song[] = [];
  const contains: Song[] = [];
  for (const entry of INDEX) {
    if (entry.title.startsWith(q)) starts.push(entry.song);
    else if (entry.title.includes(q) || entry.artist.includes(q) || entry.album.includes(q)) {
      contains.push(entry.song);
    }
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

export function songById(id: string): Song | undefined {
  return CATALOG.find((s) => s.id === id);
}
