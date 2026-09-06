/**
 * Drives the built app in Chromium: plays a snippet, burns a wrong guess,
 * finds the right answer, and screenshots every theme at phone and desktop
 * widths. Run against `npm run preview` (or dev).
 *
 *   node scripts/smoke.mjs http://localhost:4173
 */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:4173';
const SHOTS = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

const catalog = JSON.parse(
  readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8'),
);

/**
 * Use the browser this machine already has rather than downloading one. The
 * directory carries a build number that changes between images, so it is
 * discovered instead of hard-coded; falling through to Playwright's own
 * default keeps the script working on a normal dev machine.
 */
function findChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  for (const entry of readdirSync(root)) {
    if (!entry.startsWith('chromium-')) continue;
    const bin = join(root, entry, 'chrome-linux', 'chrome');
    if (existsSync(bin)) return bin;
  }
  return undefined;
}

// Sandboxes that route egress through a proxy need it passed explicitly —
// Chromium ignores HTTPS_PROXY. Harmless when the variable is unset.
const proxyUrl = process.env.HTTPS_PROXY ?? process.env.https_proxy;

const browser = await chromium.launch({
  executablePath: findChromium(),
  args: ['--autoplay-policy=no-user-gesture-required', '--no-sandbox'],
  ...(proxyUrl
    ? { proxy: { server: proxyUrl, bypass: 'localhost,127.0.0.1' } }
    : {}),
});

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
};

const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

/**
 * Apple's preview CDN is reachable by curl here but its streaming connection
 * gets dropped by the sandbox relay, so playback is stubbed with a locally
 * generated tone. The app still goes through its real code path — fetch, Web
 * Audio graph, the rAF timer that cuts the snippet off — just against bytes
 * that arrive reliably. Pass --live to hit the real CDN instead.
 */
const LIVE_AUDIO = process.argv.includes('--live');
if (!LIVE_AUDIO) {
  const wav = makeTone(20, 220);
  await context.route('**://*.itunes.apple.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'audio/wav', body: wav }),
  );
}

/** A plain 16-bit PCM WAV — no encoder needed, and Chromium plays it. */
function makeTone(seconds, hz, rate = 22050) {
  const samples = seconds * rate;
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * 12000), 44 + i * 2);
  }
  return buf;
}

const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(String(e)));

async function open(target, url = BASE) {
  await target.goto(url, { waitUntil: 'domcontentloaded' });
  // The audio element streams a 30 s preview from Apple's CDN, so the page
  // never reaches networkidle — wait for the shell to render instead.
  await target.waitForSelector('.play-btn', { timeout: 15_000 });
}

await open(page);

// A previous run may have left another palette in localStorage; pin the
// default so win-night.png is actually the night theme.
await page.evaluate(() => localStorage.setItem('27guessr:v1:theme', '"night"'));
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.play-btn');

/* ---- the answer for today, derived the same way the app derives it ------- */
const answer = await page.evaluate(() => {
  // The app persists the round; read the song id it chose rather than
  // re-implementing the schedule here.
  const key = Object.keys(localStorage).find((k) => k.startsWith('27guessr:v1:progress:daily:'));
  return key ? JSON.parse(localStorage.getItem(key)).songId : null;
});
if (!answer) fail('no daily round was persisted');
const song = catalog.find((s) => s.id === answer);
console.log(`Day's song: ${song?.title} — ${song?.artist}`);

/* ---- playback ------------------------------------------------------------ */
// The <audio> element is constructed in JS and never appended, so it can't be
// queried from the DOM. The reliable signal that play() resolved is the button
// flipping into its playing state.
await page.getByRole('button', { name: /Odtwórz/ }).click();
const playing = await page
  .locator('.play-btn--playing')
  .waitFor({ state: 'visible', timeout: 8000 })
  .then(() => true)
  .catch(() => false);

const playError = await page.locator('.player-error').textContent().catch(() => null);
if (playing) {
  console.log('playback started (button entered playing state)');
  // The 0.1 s snippet stops itself; the button must come back on its own.
  const stopped = await page
    .locator('.play-btn--playing')
    .waitFor({ state: 'detached', timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  console.log(stopped ? 'snippet auto-stopped at the step limit' : 'WARN: snippet did not stop');
} else if (playError) {
  // Expected in a sandbox with no route to Apple's CDN — the game logic below
  // is still exercised, so this is reported rather than failed.
  console.log(`WARN: audio unavailable in this environment (${playError.trim()})`);
} else {
  fail('play button did nothing and reported no error');
}

/* ---- a wrong guess unlocks the next step -------------------------------- */
const wrong = catalog.find((s) => s.id !== answer && s.album !== song?.album);
const input = page.getByRole('combobox');
await input.fill(wrong.title);
await page.getByRole('option').first().click();
await page.getByRole('button', { name: 'Zgadnij' }).click();

const rows = page.locator('.guess-row--wrong');
if ((await rows.count()) !== 1) fail('wrong guess did not produce a red row');
const secondStep = await page.locator('.timeline-seg--unlocked').count();
if (secondStep !== 2) fail(`expected 2 unlocked segments after a miss, got ${secondStep}`);
console.log('wrong guess registered, step unlocked');

/* ---- skip --------------------------------------------------------------- */
const skipLabel = await page.getByRole('button', { name: /Pomiń/ }).textContent();
console.log(`skip button reads: ${skipLabel.trim()}`);
await page.getByRole('button', { name: /Pomiń/ }).click();
if ((await page.locator('.guess-row--skipped').count()) !== 1) fail('skip did not register');

/* ---- the right answer wins ---------------------------------------------- */
await input.fill(song.title);
await page.getByRole('option').first().click();
await page.getByRole('button', { name: 'Zgadnij' }).click();

const result = page.locator('.result-card--won');
if (!(await result.isVisible())) fail('win card did not appear');
const headline = await page.locator('.result-headline').textContent();
console.log(`result: ${headline.trim()}`);
await page.screenshot({ path: `${SHOTS}win-night.png`, fullPage: true });

/* ---- modals ------------------------------------------------------------- */
await page.getByRole('button', { name: 'Statystyki' }).click();
if (!(await page.getByRole('dialog').isVisible())) fail('stats modal did not open');
await page.screenshot({ path: `${SHOTS}stats.png` });
await page.keyboard.press('Escape');

await page.getByRole('button', { name: 'Jak grać' }).click();
await page.screenshot({ path: `${SHOTS}howto.png` });
await page.keyboard.press('Escape');

/* ---- fresh round per theme and width ------------------------------------ */
for (const [name, label] of [['night', 'Nocny'], ['light', 'Jasny'], ['abyss', 'Otchłań']]) {
  for (const [tag, width, height] of [['desktop', 1280, 900], ['mobile', 390, 844]]) {
    const p = await context.newPage();
    await p.setViewportSize({ width, height });
    await open(p);
    await p.evaluate(() => {
      // Start each shot on a clean, unplayed round.
      for (const k of Object.keys(localStorage)) {
        if (k.includes(':progress:')) localStorage.removeItem(k);
      }
    });
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.play-btn');
    await p.getByRole('button', { name: label }).click();
    await p.waitForTimeout(300);
    await p.screenshot({ path: `${SHOTS}${name}-${tag}.png`, fullPage: tag === 'mobile' });
    await p.close();
  }
}

if (consoleErrors.length > 0) {
  console.error(`\n${consoleErrors.length} console error(s):`);
  for (const e of consoleErrors.slice(0, 8)) console.error(`  ${e}`);
}

await browser.close();
console.log(process.exitCode ? '\nSMOKE FAILED' : '\nSmoke passed.');
