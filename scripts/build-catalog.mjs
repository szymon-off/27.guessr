#!/usr/bin/env node
/**
 * Builds src/data/catalog.json from the public Apple Music (iTunes) lookup API.
 *
 * The output is committed so the game needs no network at build or run time.
 * Only metadata and Apple's public 30-second preview URLs are stored — no audio
 * is copied or redistributed. Preview URLs on audio-ssl.itunes.apple.com are
 * stable and CORS-open (access-control-allow-origin: *), which is what lets the
 * app decode them through Web Audio for the waveform.
 *
 * Usage: npm run catalog
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const ARTIST_ID = 1491607120; // 27.Fuckdemons on Apple Music
const ARTIST_NAME = '27.Fuckdemons';
const STOREFRONT = 'PL';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/catalog.json');

/**
 * Apple title-cases a lot of Polish titles that the artist releases in lower or
 * upper case. Keyed by the normalized sort key so casing fixes survive a refetch.
 * Extend freely — anything not listed here keeps Apple's spelling.
 */
const TITLE_OVERRIDES = {
  pierwszyraznaprawde: 'Pierwszy raz naprawdę',
  rozpacz: 'ROZPACZ',
  bunt: 'BUNT',
  czas: 'CZAS',
  jaznie: 'JAŹNIE',
  zespolcotarda: 'ZESPÓŁ COTARDA',
  psychologika: 'PSYCHOLOGIKA',
  niedostepny: 'NIEDOSTĘPNY',
  przedlustrem: 'PRZED LUSTREM',
  juznieumiem: 'JUŻ NIE UMIEM',
  jeslizmieniesie: 'JEŚLI ZMIENIĘ SIĘ',
  powolizjadazlo: 'POWOLI ZJADA ZŁO',
  niewidzisz: 'NIE WIDZISZ',
  jakdawniej: 'JAK DAWNIEJ',
  niewroce: 'nie wrócę',
  niechcecieznac: 'NIE CHCĘ CIĘ ZNAĆ',
  liceumsala27: 'LICEUM (SALA 27)',
  majus: 'MAJUŚ',
  wciazpamietamotobie: 'wciąż pamiętam o tobie.',
  awatar2: 'AWATAR 2',
  jeslipynepodprad: 'jeśli płynę pod prąd',
  jeslichceszmnie: 'JEŚLI CHCESZ MNIE',
  mama: 'MAMA',
  logo: 'Logo',
  mojerelacje: 'Moje Relacje',
  dosonca: 'Do słońca',
  jestesjakja: 'jesteś jak ja',
  samznowu: 'Sam (znowu)',
  uratujmnie: 'uratuj mnie.',
  zalujzeniemozebycciedzistu: 'żałuj że nie może być cię dziś tu.',
  wpluckach: 'W PŁUCKACH',
  gdziejestes: 'Gdzie jesteś?',
  podkapturem: 'Pod Kapturem',
  umiera: 'umiera',
  muszeszybkozarobic: 'muszę szybko zarobić',
};

/** Fold Polish diacritics and punctuation into a stable comparison key. */
export function sortKey(title) {
  return title
    .toLowerCase()
    .replace(/\((?:feat|ft|prod|with)\.?[^)]*\)/g, ' ')
    .replace(/\s*-\s*(single|ep)$/i, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, '');
}

/** Drop the trailing "(feat. …)" Apple appends to collab track names. */
function cleanTitle(title) {
  return title.replace(/\s*\((?:feat|ft|with)\.?[^)]*\)\s*$/i, '').trim();
}

/** Apple serves 100x100bb by default; the same path yields any size. */
function artworkAt(url, size) {
  return url ? url.replace(/\/\d+x\d+bb\.(jpg|png)$/, `/${size}x${size}bb.$1`) : null;
}

async function main() {
  const url =
    `https://itunes.apple.com/lookup?id=${ARTIST_ID}&entity=song&limit=200&country=${STOREFRONT}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Apple lookup failed: ${res.status} ${res.statusText}`);
  const { results } = await res.json();

  const tracks = results.filter((r) => r.wrapperType === 'track' && r.previewUrl);
  if (tracks.length === 0) throw new Error('Apple returned no playable tracks');

  // Oldest release wins, and where a track exists under both a solo and a collab
  // credit (same song on a single and on a compilation) the solo credit wins.
  tracks.sort((a, b) => {
    const byDate = (a.releaseDate ?? '').localeCompare(b.releaseDate ?? '');
    if (byDate !== 0) return byDate;
    const soloA = a.artistName === ARTIST_NAME ? 0 : 1;
    const soloB = b.artistName === ARTIST_NAME ? 0 : 1;
    return soloA - soloB;
  });

  const byKey = new Map();
  for (const t of tracks) {
    const key = sortKey(t.trackName);
    if (!key || byKey.has(key)) continue;
    const title = TITLE_OVERRIDES[key] ?? cleanTitle(t.trackName);
    byKey.set(key, {
      id: String(t.trackId),
      title,
      sortKey: key,
      artist: t.artistName,
      isCollab: t.artistName !== ARTIST_NAME,
      album: (t.collectionName ?? '').replace(/\s*-\s*(Single|EP)$/i, '').trim(),
      year: Number((t.releaseDate ?? '').slice(0, 4)) || null,
      releaseDate: (t.releaseDate ?? '').slice(0, 10),
      artworkUrl: artworkAt(t.artworkUrl100, 500),
      previewUrl: t.previewUrl,
      durationMs: t.trackTimeMillis ?? null,
      appleUrl: t.trackViewUrl ?? null,
    });
  }

  const catalog = [...byKey.values()].sort(
    (a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.id.localeCompare(b.id),
  );

  await writeFile(OUT, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');

  const collabs = catalog.filter((s) => s.isCollab).length;
  console.log(`Wrote ${catalog.length} tracks to ${OUT}`);
  console.log(`  solo: ${catalog.length - collabs}   collab: ${collabs}`);
  console.log(`  span: ${catalog[0].releaseDate} → ${catalog.at(-1).releaseDate}`);
  console.log('\nNow run `npm run schedule` so new songs get days assigned.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
