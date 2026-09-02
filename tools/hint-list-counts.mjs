#!/usr/bin/env node
/**
 * ПОДСКАЗКА, НЕ ГЕЙТ. Всегда завершается кодом 0.
 *
 * Ищет числовые обещания в тексте — «пять пунктов», «шесть этапов» — и сравнивает
 * с длиной ближайшего списка или таблицы. Так нашлось расхождение: прямой ответ
 * говорил «по пяти стадиям», а блок под ним — «Шесть шагов публикует каждый
 * интегратор». Для машины это два противоречащих перечисления одного процесса,
 * причём в разметку FAQPage уходит именно прямой ответ.
 *
 * Почему не в приёмке: из семи найденных пар две — законные. «Три сценария
 * освещения или пятнадцать» — риторическое противопоставление, а не обещание
 * списка; «три позиции» бывают перечислены прямо в абзаце, и таблица рядом про
 * другое. Двадцать девять процентов ложных срабатываний в блокирующем гейте
 * заставят править хорошие тексты, чтобы он замолчал.
 *
 * Запускать руками после правки ответов со списками:
 *   node tools/hint-list-counts.mjs
 */
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/* ESM не читает NODE_PATH — тот же приём, что в tools/accept.mjs. */
async function loadChromium() {
  const candidates = ['playwright', ...(process.env.NODE_PATH || '').split(':')
    .filter(Boolean).map((d) => `${d}/playwright/index.mjs`)
    .filter((f) => existsSync(f) || existsSync(f.replace('/index.mjs', '')))];
  for (const c of candidates) {
    try { return (await import(c.startsWith('/') ? pathToFileURL(c).href : c)).chromium; } catch (e) {}
  }
  console.error('playwright не найден. Укажите NODE_PATH к глобальным модулям.');
  process.exit(0);   // подсказка не должна ронять ничей конвейер
}
const chromium = await loadChromium();
const f='file:///home/user/SmartHomeSystems/tz-site/prototype/mimismart-v5.html';
const WORD={'два':2,'две':2,'три':3,'четыре':4,'пять':5,'шесть':6,'семь':7,'восемь':8,'девять':9,'десять':10,
 'двух':2,'трёх':3,'трех':3,'четырёх':4,'четырех':4,'пяти':5,'шести':6,'семи':7};
const NOUNS='пункт|вопрос|позици|этап|строк|шаг|причин|признак|способ|вариант|сценари|документ|поле|ситуац|услови|правил';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage(); await p.goto(f); await p.waitForTimeout(600);
const routes=await p.evaluate(()=>[...document.querySelectorAll('a[href^="#/answers/"]')].map(a=>a.getAttribute('href')));
const uniq=[...new Set(routes)];
const hits=[];
for(const h of uniq){
  await p.goto(f+h); await p.waitForTimeout(35);
  const r=await p.evaluate((cfg)=>{
    const {WORD,NOUNS}=cfg;
    const v=[...document.querySelectorAll('section.page')].find(s=>getComputedStyle(s).display!=='none');
    if(!v) return [];
    const out=[];
    const re=new RegExp('('+Object.keys(WORD).join('|')+')\\s+(?:[а-яё]+\\s+){0,2}('+NOUNS+')[а-яё]*','gi');
    const blocks=[...v.querySelectorAll('p,h4')];
    for(const el of blocks){
      const t=el.innerText;
      for(const m of t.matchAll(re)){
        const want=WORD[m[1].toLowerCase()];
        // ближайший список или таблица после этого абзаца
        let n=el.nextElementSibling, cnt=null, kind='';
        for(let k=0;k<3&&n;k++,n=n.nextElementSibling){
          const ol=n.matches('ol,ul')?n:n.querySelector&&n.querySelector('ol,ul');
          const tb=n.matches('table')?n:n.querySelector&&n.querySelector('table');
          if(ol){cnt=ol.querySelectorAll(':scope>li').length;kind='список';break}
          if(tb){cnt=tb.querySelectorAll('tbody tr').length;kind='таблица';break}
        }
        if(cnt!==null) out.push({фраза:m[0],обещано:want,фактически:cnt,вид:kind,ok:cnt===want});
      }
    }
    return out;
  },{WORD,NOUNS});
  for(const x of r) hits.push({page:h,...x});
}
hits.slice(0,8).forEach(x=>console.log(`  ✓ ${x.фраза} → ${x.фактически} в ${x.вид}`));
console.log(`страниц ответов: ${uniq.length} | сопоставлено пар: ${hits.length}, из них расходятся: ${hits.filter(x=>!x.ok).length}`);
hits.filter(x=>!x.ok).forEach(x=>console.log(`  ${x.page.slice(9,44).padEnd(38)} «${x.фраза}» → обещано ${x.обещано}, в ${x.вид} ${x.фактически}`));
await b.close();
