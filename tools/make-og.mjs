#!/usr/bin/env node
/**
 * Карточка для пересылки ссылки (Open Graph, 1200×630).
 *
 * Рисуется теми же токенами, что и сайт, и снимается тем же браузером, что
 * гоняет приёмку: фотографий объектов у нас нет, а подставлять чужую или
 * сгенерированную — значит показывать работу, которой не было.
 *
 * Одна карточка на весь сайт, а не по одной на страницу: сто тридцать семь
 * картинок весили бы больше, чем весь остальной сайт.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* Playwright ищем так же, как приёмка: в этом окружении он стоит глобально,
   и прямой импорт по имени не разрешается. */
async function loadChromium() {
  const candidates = ['playwright', ...(process.env.NODE_PATH || '').split(':')
    .filter(Boolean).map((d) => `${d}/playwright/index.mjs`)
    .filter((f) => existsSync(f) || existsSync(f.replace('/index.mjs', '')))];
  for (const c of candidates) {
    try { return (await import(c.startsWith('/') ? pathToFileURL(c).href : c)).chromium; } catch { /* следующий */ }
  }
  console.error('playwright не найден. Укажите NODE_PATH к глобальным модулям.');
  process.exit(2);
}
const chromium = await loadChromium();

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site/public/og.png');
const PLAN = join(ROOT, 'site/public/plan/plan-night-2e13515c34.png');
const planData = existsSync(PLAN)
  ? `data:image/png;base64,${readFileSync(PLAN).toString('base64')}` : '';

const html = `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;box-sizing:border-box}
  body{width:1200px;height:630px;display:flex;flex-direction:column;justify-content:space-between;
    padding:64px 68px;background:linear-gradient(150deg,#141b2b,#0a0c12 60%);color:#f4f4f4;
    font:400 16px/1.5 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;position:relative;overflow:hidden}
  .plan{position:absolute;right:-90px;top:50%;transform:translateY(-50%);width:760px;
    opacity:.22;filter:brightness(2.4)}
  .brand{font-size:27px;font-weight:700;letter-spacing:-.01em;position:relative}
  .dot{color:#6aa8f5}
  h1{font-size:60px;line-height:1.08;letter-spacing:-.02em;max-width:15ch;position:relative;font-weight:700}
  .facts{display:flex;gap:44px;position:relative}
  .facts b{display:block;font-size:22px;font-weight:700}
  .facts span{color:#a5b0c2;font-size:15px}
</style>
${planData ? `<img class="plan" src="${planData}">` : ''}
<div class="brand"><span class="dot">●</span> MiMiSmart</div>
<h1>Умный дом без облака</h1>
<div class="facts">
  <div><b>с 2004</b><span>инженерный подрядчик</span></div>
  <div><b>свои контроллеры</b><span>разработка и сборка в Москве</span></div>
  <div><b>бессрочная гарантия</b><span>на собственное оборудование</span></div>
</div>`;

const EXEC = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium';
const browser = await chromium.launch(existsSync(EXEC) ? { executablePath: EXEC } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'networkidle' });
const buf = await page.screenshot({ type: 'png' });
await browser.close();
writeFileSync(OUT, buf);
console.log(`site/public/og.png: ${(buf.length / 1024).toFixed(0)} КБ`);
