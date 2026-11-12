// README / onboarding screenshots from fictional data (scenario.mjs) on the Vite dev page.
//   cd webview-ui && npx vite --port 5199 --strictPort   (browserMock serves the assets)
//   node scripts/readme-shots/shoot.mjs [http://localhost:5199/] [only-shot-name]
// Writes docs/images/*.png. Needs Playwright's Chromium (`npx playwright install chromium`).
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import * as S from './scenario.mjs';

const URL = process.argv[2] ?? 'http://localhost:5199/';
const ONLY = process.argv[3];
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../docs/images');

/** A page in `lang`/`theme` with tour and install popups out of the way. */
async function open(browser, { lang = 'ko', theme = 'dark', w = 1920, h = 1080 } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.addInitScript(
    ([l, th]) => {
      localStorage.setItem('pixel-office.tour.v1', '1');
      localStorage.setItem('pixel-office.installDismissed', '1');
      localStorage.setItem('pixel-office.seenVersion', '9.9.9');
      localStorage.setItem('pixel-office.lang', l);
      localStorage.setItem('pixel-office.theme', th);
    },
    [lang, theme],
  );
  page.lang = lang;
  const ready = page.waitForEvent('console', (m) => m.text().includes('Messages dispatched'));
  await page.goto(URL);
  await ready;
  // Dev mode has no server socket: hide its "connecting…" badge.
  await page.addStyleTag({ content: 'div:has(> span.pixel-pulse){display:none!important}' });
  return page;
}

/** Sends ServerMessages, the made-up texts in the page's language. */
const send = (page, msgs) =>
  page.evaluate(
    (ms) => {
      for (const m of ms) window.dispatchEvent(new MessageEvent('message', { data: m }));
    },
    S.inLang(msgs, page.lang),
  );

/** Handshake, then snapshots: `t` 0 is the baseline, `t` 1 fires the one-shot effects. */
async function stage(page, view, { effects = true } = {}) {
  await send(page, S.handshake(view));
  await send(page, [S.snapshot(view, 0)]);
  await page.waitForTimeout(2500); // avatars spawn, agents walk to their seats
  await send(page, [S.snapshot(view, 0)]);
  await page.waitForTimeout(2500);
  if (effects) {
    await send(page, [S.snapshot(view, 1)]);
    await page.waitForTimeout(450); // effects mid-flight
  }
}

/** Screen rect around these elements (union), padded; null when none is on screen. */
async function around(page, selectors, pad = { x: 50, top: 30, bottom: 16 }) {
  const r = await page.evaluate((sels) => {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const sel of sels)
      for (const el of document.querySelectorAll(sel)) {
        const b = el.getBoundingClientRect();
        const off = b.right < 0 || b.bottom < 0 || b.left > innerWidth || b.top > innerHeight;
        if (!b.width || off) continue;
        x0 = Math.min(x0, b.left);
        y0 = Math.min(y0, b.top);
        x1 = Math.max(x1, b.right);
        y1 = Math.max(y1, b.bottom);
      }
    return x0 === Infinity ? null : { x0, y0, x1, y1 };
  }, selectors);
  if (!r) return null;
  const vw = page.viewportSize();
  const x = Math.max(0, Math.floor(r.x0 - pad.x));
  const y = Math.max(0, Math.floor(r.y0 - pad.top));
  return {
    x,
    y,
    width: Math.min(vw.width - x, Math.ceil(r.x1 - r.x0 + pad.x * 2)),
    height: Math.min(vw.height - y, Math.ceil(r.y1 - r.y0 + pad.top + pad.bottom)),
  };
}

const tag = (id) => `[data-agent-key="p-self:${id}"]`;
const bubble = (id) => `[data-activity="p-self:${id}"]`;

async function clip(page, name, lang, selectors, pad) {
  const box = await around(page, selectors, pad);
  if (!box || box.width <= 0 || box.height <= 0)
    return console.warn('nothing to shoot for', name, selectors);
  await page.screenshot({ path: path.join(OUT, `${name}-${lang}.png`), clip: box });
}

/** A fixed box centred over an element and reaching up from its bottom (character + effects). */
async function clipAbove(page, name, lang, sel, w, h) {
  const b = await page.locator(sel).first().boundingBox();
  const x = Math.max(0, Math.round(b.x + b.width / 2 - w / 2));
  const y = Math.max(0, Math.round(b.y + b.height + 12 - h));
  await page.screenshot({
    path: path.join(OUT, `${name}-${lang}.png`),
    clip: { x, y, width: w, height: h },
  });
}

const shots = {
  async gallery(browser, lang) {
    // Every close-up on a fresh page: zooming in and back out does not return the camera exactly.
    const fresh = async () => {
      const page = await open(browser, { lang, w: 2560, h: 1440 });
      await stage(page, 'gallery', { effects: false });
      await page.addStyleTag({
        content: '[data-tour="switcher"],[data-tour="people"]{visibility:hidden}',
      });
      return page;
    };
    // Zoom in around an element (the wheel zooms at the pointer).
    const zoomAt = async (page, sel, notches = 6) => {
      const b = await page.locator(sel).first().boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y - 40);
      for (let i = 0; i < notches; i++) {
        await page.mouse.wheel(0, -120);
        await page.waitForTimeout(60);
      }
      await page.mouse.move(5, 700); // no hover bubble
      await page.waitForTimeout(400);
    };
    const big = { x: 90, top: 60, bottom: 20 };
    const plain = [
      ['m1', 'sig-red'],
      ['m1/sub/a', 'sig-gold'],
      ['m2', 'sig-blue'],
      ['m3', 'sig-plain'],
      ['c4', 'sig-codex'],
    ];
    for (const [id, name] of plain) {
      const page = await fresh();
      await zoomAt(page, tag(id));
      await clip(page, name, lang, [tag(id), bubble(id)], big);
      await page.close();
    }
    {
      // My avatar with the red ! of a folded agent waiting for approval.
      const page = await fresh();
      await zoomAt(page, '[data-avatar-tag="self"]');
      await clipAbove(page, 'sig-wait', lang, '[data-avatar-tag="self"]', 360, 300);
      await page.close();
    }
    // One-shot effects: lines added, failure smoke + red PC + big result, finished list.
    for (const [id, name] of [
      ['m1', 'fx-diff'],
      ['m2', 'fx-fail'],
      ['m3', 'fx-done'],
    ]) {
      const page = await fresh();
      await zoomAt(page, tag(id));
      await send(page, [S.snapshot('gallery', 1)]);
      await page.waitForTimeout(550);
      await clipAbove(page, name, lang, tag(id), 520, 420);
      await page.close();
    }
    {
      // Hover bubble: the full card of one agent.
      const page = await fresh();
      await zoomAt(page, tag('m2'), 4);
      const b = await page.locator(tag('m2')).boundingBox();
      await page.mouse.move(b.x + b.width / 2, b.y - 25);
      await page.waitForTimeout(500);
      await clip(page, 'hover', lang, ['[data-tour="hover-bubble"]', tag('m2')], {
        x: 30,
        top: 20,
        bottom: 16,
      });
      await page.close();
    }
  },
  async usage(browser, lang) {
    for (const range of ['30d', 'all']) {
      const page = await open(browser, { lang, w: 2560, h: 1440 });
      await page.evaluate(
        ([r]) => {
          localStorage.setItem('pixel-office.usage.range', r);
          localStorage.setItem('pixel-office.usage.size', JSON.stringify({ w: 980, h: 1190 }));
        },
        [range],
      );
      await stage(page, 'public', { effects: false });
      await page.click('[data-tour="usage-button"]');
      await page.waitForTimeout(300);
      await send(page, [S.snapshot('public', 0), S.usageLoaded(range), S.usageNow()]);
      await page.waitForTimeout(700);
      if (range === '30d') {
        // The office with the panel open, then the panel alone with a day's tooltip.
        await page.screenshot({ path: path.join(OUT, `usage-office-${lang}.png`) });
        const bars = page.locator('[data-usage-panel] svg rect[fill="transparent"]');
        const n = await bars.count();
        await bars.nth(Math.max(0, Math.floor(n / 2) - 4)).hover({ force: true }); // the daily chart's
        await page.waitForTimeout(300);
      }
      await clip(page, `usage-${range}`, lang, ['[data-usage-panel]'], { x: 4, top: 4, bottom: 4 });
      await page.close();
    }
  },
  async office(browser, lang) {
    const page = await open(browser, { lang, w: 2560, h: 1440 });
    await stage(page, 'public');
    await page.screenshot({ path: path.join(OUT, `office-${lang}.png`) });
    await page.close();
  },
};

const browser = await chromium.launch();
for (const [name, fn] of Object.entries(shots)) {
  if (ONLY && ONLY !== name) continue;
  for (const lang of ['ko', 'en']) await fn(browser, lang);
  console.log('shot', name);
}
await browser.close();
