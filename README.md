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
| `npm run schedule` | dopisuje kolejne dni do `src/data/schedule.json` |

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

**Utwór dnia.** Kalendarz leży w repo jako `src/data/schedule.json` — lista
„dzień → utwór", generowana przez `scripts/build-schedule.mjs`.
`src/game/daily.ts` tylko z niej czyta.

To celowo plik, a nie obliczenie. Wcześniej kolejność powstawała przez tasowanie
katalogu w przeglądarce — przez co **jeden nowy singiel przetasowywał wszystkie
dni, łącznie z tymi już rozegranymi**. Archiwum przepisywało sobie historię, a
wyniki przestawały się zgadzać między graczami. Plik to naprawia.

Zasady generatora:

- **Przeszłość jest zamrożona.** Dni do dzisiaj włącznie (plus jeden dzień
  zapasu) nigdy się nie ruszają.
- **Przyszłość można przetasować.** Dni, których nikt jeszcze nie widział — w
  interfejsie są zablokowane — generator rozdaje od nowa, dzięki czemu nowy
  utwór trafia do gry w kilka dni, a nie po wyczerpaniu całego kalendarza.
- **Bez powtórek.** Utwory rozdawane są z „worka": nowy worek otwiera się
  dopiero, gdy poprzedni się skończy, więc żaden utwór nie wróci, zanim zagrają
  wszystkie.

`tests/schedule.test.mjs` pilnuje każdej z tych własności, a osobny test
zaczyna psuć CI, gdy kalendarza zostaje mniej niż 180 dni.

**Logo.** `scripts/make-logo.py` (Pillow) zamienia źródłową grafikę
`public/logo-27-original.png` na biały znak z przezroczystym tłem plus favicon i
kartę OG. Motyw jasny odwraca go na czarny filtrem CSS (`--logo-filter`).
Skrypt jest potrzebny tylko do regeneracji — gotowe pliki są w repo.

## Testy

```bash
npm test                                   # kalendarz: stabilność i zapas
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

## Gdy 27 wypuści nowy utwór

```bash
npm run catalog          # dociąga nowe wydania z Apple Music
npm run schedule         # przydziela im dni (nie rusza dni już rozegranych)
npm test                 # sprawdza, że nic z przeszłości się nie przesunęło
git add src/data && git commit -m "Catalog: <tytuł>"
```

Apple potrafi wystawić ten sam utwór kilka razy (singiel, potem EP, potem
składanka) — deduplikacja zostawia najwcześniejsze wydanie i woli wersję
solową. Zdarza jej się też zmieniać wielkość liter w tytułach; od tego jest
mapa `TITLE_OVERRIDES` na górze `scripts/build-catalog.mjs`.

## Wdrożenie

Build jest w pełni statyczny, z relatywnym `base`, więc działa pod dowolną
ścieżką. `.github/workflows/deploy.yml` publikuje go na GitHub Pages przy każdym
pushu na `main`; ten sam katalog `dist/` wrzucisz też na Netlify, Vercel czy
własny serwer.

## Zastrzeżenie

Nieoficjalny projekt fanowski, bez związku z 27.Fuckdemons, jego wytwórnią,
Apple ani z 33HIT. Fragmenty audio i okładki pochodzą z publicznego API Apple
Music i pozostają własnością ich właścicieli.
