// MiMiSmart site snapshot tool.
// Renders the live preview with Chromium and dumps HTML + text + screenshots
// + link map into ./site-snapshot/ for offline analysis.
//
// Prereqs: the environment network policy must allow mimi-ibrh.vercel.app.
// Credentials are read from env (never hardcoded / committed):
//   ADMIN_USER=... ADMIN_PASS=... node tools/scrape-site.mjs
//
// Run:
//   ADMIN_USER=admin123 ADMIN_PASS=admin123 node tools/scrape-site.mjs

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE || 'https://mimi-ibrh.vercel.app';
const OUT = path.resolve('site-snapshot');
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || null;
const USER = process.env.ADMIN_USER || '';
const PASS = process.env.ADMIN_PASS || '';

const ROUTES = [
  '/', '/news', '/detector', '/controller', '/portfolio', '/catalog', '/admin',
];

const slug = (r) => (r === '/' ? 'home' : r.replace(/^\//, '').replace(/\//g, '_'));

async function dumpPage(page, route, dir) {
  const url = BASE + route;
  const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 }).catch((e) => ({ err: e }));
  await page.waitForTimeout(1500);
  const status = res && res.status ? res.status() : 'ERR';
  const name = slug(route);
  const html = await page.content();
  const text = await page.evaluate(() => document.body ? document.body.innerText : '');
  const title = await page.title();
  const links = await page.$$eval('a[href]', (as) => [...new Set(as.map((a) => a.getAttribute('href')))]);
  const imgs = await page.$$eval('img[src]', (xs) => [...new Set(xs.map((x) => x.getAttribute('src')))]);
  await writeFile(path.join(dir, `${name}.html`), html);
  await writeFile(path.join(dir, `${name}.txt`), `URL: ${url}\nSTATUS: ${status}\nTITLE: ${title}\n\n${text}`);
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true }).catch(() => {});
  console.log(`[${status}] ${route}  title="${title}"  links=${links.length} imgs=${imgs.length}`);
  return { route, url, status, title, links, imgs, textLen: text.length };
}

async function tryAdminLogin(page) {
  if (!USER || !PASS) { console.log('(skip admin login: no ADMIN_USER/ADMIN_PASS)'); return false; }
  await page.goto(BASE + '/admin', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1000);
  // best-effort: fill the first text/email + password fields, submit
  const userSel = 'input[type="text"], input[type="email"], input[name*="login" i], input[name*="user" i], input[name*="email" i]';
  const passSel = 'input[type="password"], input[name*="pass" i]';
  try {
    await page.fill(userSel, USER, { timeout: 5000 });
    await page.fill(passSel, PASS, { timeout: 5000 });
    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {}),
      page.keyboard.press('Enter'),
    ]);
    await page.waitForTimeout(1500);
    console.log('admin login attempted, now at:', page.url());
    return true;
  } catch (e) {
    console.log('admin login could not auto-fill:', e.message);
    return false;
  }
}

(async () => {
  await mkdir(OUT, { recursive: true });
  const launchOpts = { executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' };
  if (PROXY) launchOpts.proxy = { server: PROXY };
  const browser = await chromium.launch(launchOpts);
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  });
  const page = await ctx.newPage();

  // public/auth-protected pages first; log in so /admin and gated content render
  await tryAdminLogin(page);

  const summary = [];
  for (const route of ROUTES) {
    summary.push(await dumpPage(page, route, OUT));
  }

  // discover internal links we haven't captured yet
  const seen = new Set(ROUTES);
  const extra = [...new Set(summary.flatMap((s) => s.links))]
    .filter((h) => h && (h.startsWith('/') || h.startsWith(BASE)))
    .map((h) => (h.startsWith(BASE) ? h.slice(BASE.length) : h))
    .filter((h) => h && !h.startsWith('#') && !seen.has(h));
  await writeFile(path.join(OUT, '_link-map.json'), JSON.stringify({ base: BASE, pages: summary, undiscovered: extra }, null, 2));
  console.log('\nUndiscovered internal links:', extra);
  console.log('Snapshot written to', OUT);

  await browser.close();
})();
