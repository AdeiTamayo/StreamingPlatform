#!/usr/bin/env node
/**
 * Mobile layout check (NOT part of CI). jsdom does no layout, so overlap
 * between the card footer buttons and the text/artwork can only be checked in
 * a real browser.
 *
 * Setup (nothing is added to package.json):
 *   npm i --no-save playwright && npx playwright install chromium
 *
 * Run (the script starts its own Vite dev server on port 5199):
 *   VITE_TMDB_API_KEY=x node scripts/check-mobile-layout.mjs
 *   VITE_TMDB_API_KEY=x node scripts/check-mobile-layout.mjs --shots out/
 *
 * Auth and data are mocked in the browser (no real network):
 *   - a fake Supabase session is seeded in localStorage and the Supabase
 *     endpoints are answered by route handlers;
 *   - api.themoviedb.org and image.tmdb.org are answered with fixtures.
 *
 * /watch-later and /last-seen are seeded through localStorage (697 history
 * items for Last Seen, to also exercise a long grid).
 *
 * For every .media-card it asserts that each footer button:
 *   - does not intersect h3, .media-card-year or .media-card-rating,
 *   - is at least 44px tall and lies inside the card,
 * and that the page has no horizontal overflow. Failures print the card title
 * and width; the exit code is 1 if there is any failure.
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 5199;
const BASE = `http://127.0.0.1:${PORT}`;
const SUPABASE = 'http://127.0.0.1:54321';
const WIDTHS = [360, 393, 430, 600];
const ROUTES = (process.env.LAYOUT_ROUTES ?? '/,/movies,/tv,/watch-later,/last-seen').split(',');
const shotsDir = process.argv.includes('--shots')
  ? process.argv[process.argv.indexOf('--shots') + 1]
  : null;

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

const TITLES = [
  'The Matrix', 'A Very Long Title That Wraps Onto Two Lines Easily',
  'Up', 'Spirited Away', 'The Lord of the Rings: The Return of the King',
  'Heat', 'Alien', 'Parasite', 'Amelie', 'Casablanca', 'Gladiator', 'Se7en',
];
const fixtureItems = TITLES.map((title, i) => ({
  id: 1000 + i,
  title,
  name: title,
  release_date: '1999-03-31',
  first_air_date: '2008-01-20',
  poster_path: `/p${i}.jpg`,
  vote_average: 7.5 + (i % 3) / 10,
  vote_count: 1234,
  media_type: i % 2 ? 'tv' : 'movie',
  genre_ids: [18],
  overview: 'Fixture.',
}));

function seededSession() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return {
    access_token: 'aaa.bbb.ccc',
    refresh_token: 'refresh',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    user: {
      id: '00000000-0000-0000-0000-000000000001',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'layout@example.test',
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}


function seededLibrary() {
  const wl = fixtureItems.slice(0, 8).map((it, i) => ({
    type: i % 2 ? 'tv' : 'movie', id: it.id, title: it.title, year: '1999',
    poster: it.poster_path, addedAt: 1000 + i,
  }));
  const watched = {};
  const index = [];
  for (let i = 0; i < 697; i++) {
    const key = `watched:movie-${5000 + i}`;
    watched[key] = JSON.stringify({
      type: 'movie', id: 5000 + i, title: `Seeded movie ${i}`,
      watchedAt: 1700000000000 + i, meta: { title: `Seeded movie ${i}`, poster: '/p0.jpg' },
    });
    index.push(key);
  }
  return { wl: JSON.stringify(wl), watched, watchedIndex: JSON.stringify(index) };
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Vite dev server did not start');
}

async function mockNetwork(context) {
  await context.route('https://image.tmdb.org/**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: PNG_1X1 }));
  await context.route('https://api.themoviedb.org/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      // One body serves list and detail endpoints alike.
      body: JSON.stringify({
        page: 1, total_pages: 1, total_results: fixtureItems.length,
        results: fixtureItems, ...fixtureItems[0], genres: [],
      }),
    }));
  await context.route('**/api/omdb**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await context.route(`${SUPABASE}/**`, (r) => {
    const url = r.request().url();
    if (url.includes('/auth/v1/user')) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(seededSession().user) });
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

/** Runs in the page. Returns a list of failure strings. */
function measure(minHeight) {
  const out = [];
  const R = (el) => {
    const b = el.getBoundingClientRect();
    return { l: b.left, t: b.top, r: b.right, b: b.bottom, h: b.height };
  };
  const hit = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    out.push(`horizontal overflow: scrollWidth ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
  }
  for (const card of document.querySelectorAll('.media-card')) {
    const title = card.querySelector('h3')?.textContent ?? '(loading)';
    const cardRect = R(card);
    const others = ['h3', '.media-card-year', '.media-card-rating']
      .flatMap((sel) => [...card.querySelectorAll(sel)].map((el) => [sel, R(el)]));
    for (const btn of card.querySelectorAll('.media-card-actions button, .media-card-footer button')) {
      const b = R(btn);
      if (b.h < minHeight - 0.5) out.push(`${title}: button ${b.h.toFixed(1)}px tall (< ${minHeight})`);
      if (b.l < cardRect.l - 0.5 || b.r > cardRect.r + 0.5 || b.b > cardRect.b + 0.5) {
        out.push(`${title}: button outside card`);
      }
      for (const [sel, o] of others) {
        if (hit(b, o)) out.push(`${title}: button overlaps ${sel}`);
      }
    }
  }
  return out;
}

const dev = spawn('npx', ['vite', '--port', String(PORT), '--host', '127.0.0.1', '--strictPort'], {
  env: {
    ...process.env,
    VITE_TMDB_API_KEY: process.env.VITE_TMDB_API_KEY ?? 'x',
    VITE_SUPABASE_URL: SUPABASE,
    VITE_SUPABASE_ANON_KEY: 'anon',
  },
  stdio: 'ignore',
});

let failures = 0;
const browser = await chromium.launch();
try {
  await waitForServer();
  if (shotsDir) mkdirSync(shotsDir, { recursive: true });

  const runs = [
    ...WIDTHS.map((w) => ({ w, h: 852, big: false })),
    { w: 393, h: 852, big: true },
  ];
  for (const { w, h, big } of runs) {
    const context = await browser.newContext({
      viewport: { width: w, height: h },
      hasTouch: true,
      isMobile: true,
    });
    await mockNetwork(context);
    await context.addInitScript(({ session, lib }) => {
      // supabase-js storage key: sb-<first label of the host>-auth-token
      localStorage.setItem('sb-127-auth-token', JSON.stringify(session));
      // Seed once per context so reloads do not overwrite in-page changes.
      if (!localStorage.getItem('__layout_seeded')) {
        localStorage.setItem('watchlater', lib.wl);
        for (const [k, v] of Object.entries(lib.watched)) localStorage.setItem(k, v);
        localStorage.setItem('watched_index', lib.watchedIndex);
        localStorage.setItem('__layout_seeded', '1');
      }
    }, { session: seededSession(), lib: seededLibrary() });

    for (const route of ROUTES) {
      const page = await context.newPage();
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      if (big) await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await page.waitForSelector('.media-card-actions, .media-card-footer', { timeout: 15000 }).catch(() => {});
      const cards = await page.locator('.media-card').count();
      const buttons = await page.locator('.media-card-actions button, .media-card-footer button').count();
      const label = `${route} @ ${w}px${big ? ' (text 200%)' : ''}`;
      if (!cards || !buttons) {
        console.log(`FAIL ${label}: ${cards} cards, ${buttons} footer buttons (auth/data mock not working?)`);
        failures++;
      } else {
        const problems = await page.evaluate(measure, 44);
        for (const p of problems) console.log(`FAIL ${label}: ${p}`);
        failures += problems.length;
        if (!problems.length) console.log(`ok   ${label}: ${cards} cards`);
      }
      if (shotsDir && w === 393 && !big) {
        const name = route === '/' ? 'home' : route.slice(1).replace(/\//g, '-');
        await page.screenshot({ path: `${shotsDir}/${name}-393x852.png` });
      }
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
  dev.kill();
}
console.log(failures ? `\n${failures} failure(s)` : '\nall layout checks passed');
process.exit(failures ? 1 : 0);
