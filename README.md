# 27.GUESSR

Zgadnij utwór **27.Fuckdemons** w sześciu próbach. Każda pomyłka odblokowuje
więcej muzyki — od 0,1 s do 16 s.

Gra w stylu Heardle, inspirowana [33hit.pl](https://www.33hit.pl/), w niebieskiej
odsłonie.

![27.GUESSR](public/og-image.png)

## Jak grać

| | |
| --- | --- |
| **Dzień** | Jeden utwór dla wszystkich, ten sam do północy (czasu polskiego). Archiwum sięga dnia #1. |
| **Trening** | Losowy utwór, ile razy chcesz. Nie liczy się do statystyk. |

Sześć prób. Trafienie kończy rundę, pomyłka lub pominięcie odsłania kolejny
fragment: **0,1 s → 0,5 s → 2 s → 4 s → 8 s → 16 s**.

Kolory wierszy:

- 🟩 trafiony utwór
- 🟦 ten sam album lub EP, ale inny utwór
- 🟥 pudło
- ⬛ próba pominięta

Motywy: **Nocny**, **Jasny**, **Otchłań**. Spacja odtwarza i zatrzymuje fragment.

## Uruchomienie

```bash
npm install
npm run dev        # http://localhost:5173
```

| Skrypt | Co robi |
| --- | --- |
| `npm run dev` | serwer deweloperski |
| `npm run build` | typecheck + produkcyjny build do `dist/` |
| `npm run preview` | podgląd zbudowanej wersji |
| `npm test` | testy wyznaczania utworu dnia |
| `npm run catalog` | przebudowuje `src/data/catalog.json` z API Apple Music |
| `npm run catalog:verify` | sprawdza katalog i dostępność fragmentów (`-- --all` sprawdza wszystkie) |

## Jak to działa

**Stos:** Vite + React + TypeScript. Bez backendu, bez kont, bez ciasteczek —
statyczne pliki i `localStorage`.

**Skąd muzyka.** `src/data/catalog.json` powstaje ze skryptu
`scripts/build-catalog.mjs`, który odpytuje publiczne API Apple Music
(iTunes Lookup) o wykonawcę `1491607120`. W repozytorium leżą wyłącznie
metadane i publiczne adresy 30-sekundowych fragmentów — **żadne audio ani teksty
nie są tu kopiowane ani rozpowszechniane**. Fragmenty odtwarzane są prosto z CDN
Apple, który wysyła `access-control-allow-origin: *`, dzięki czemu Web Audio może
je analizować i rysować falę bez żadnego pośrednika.

Katalog to **64 unikalne utwory** — 29 solowych i 35 gościnnych (Popkiller Młode
Wilki, Hotel Maffija, CBW, esceh, Petito i inni). Utwory z udziałem gości
pokazują pełną listę wykonawców w podpowiedziach i w wyniku.

**Utwór dnia.** `src/game/daily.ts` liczy numer dnia względem `2026-01-01` w
strefie `Europe/Warsaw`, a potem tasuje katalog ziarnowanym Fisher–Yates
(xmur3 + mulberry32). Każde przejście przez katalog to osobna permutacja, więc
utwór nie powtórzy się przez 64 dni, a wynik jest identyczny na każdym
urządzeniu bez żadnego serwera. `tests/daily.test.mjs` pilnuje obu tych
własności — zmiana ziarna psuje test, zamiast po cichu przetasować wszystkim
archiwum.

**Logo.** `scripts/make-logo.py` (Pillow) zamienia źródłową grafikę
`public/logo-27-original.png` na biały znak z przezroczystym tłem plus favicon i
kartę OG. Motyw jasny odwraca go na czarny filtrem CSS (`--logo-filter`).
Skrypt jest potrzebny tylko do regeneracji — gotowe pliki są w repo.

## Testy

```bash
npm test                                   # logika utworu dnia
npm run catalog:verify                     # katalog + fragmenty audio
npm run build && npm run preview           # a w drugim terminalu:
node scripts/smoke.mjs http://localhost:4173
```

Smoke test wymaga przeglądarki Playwrighta (`npx playwright install chromium`);
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install` pomija pobieranie, jeśli go nie
potrzebujesz.

`scripts/smoke.mjs` przechodzi w Chromium pełną rundę — odtwarza fragment,
oddaje błędny strzał, pomija próbę, trafia — i zapisuje zrzuty wszystkich
motywów do `screenshots/`. Domyślnie podstawia lokalnie wygenerowany dźwięk;
`--live` odtwarza prawdziwe fragmenty z Apple.

## Wdrożenie

Build jest w pełni statyczny, z relatywnym `base`, więc działa pod dowolną
ścieżką. `.github/workflows/deploy.yml` publikuje go na GitHub Pages przy każdym
pushu na `main`; ten sam katalog `dist/` wrzucisz też na Netlify, Vercel czy
własny serwer.

## Zastrzeżenie

Nieoficjalny projekt fanowski, bez związku z 27.Fuckdemons, jego wytwórnią,
Apple ani z 33HIT. Fragmenty audio i okładki pochodzą z publicznego API Apple
Music i pozostają własnością ich właścicieli.
