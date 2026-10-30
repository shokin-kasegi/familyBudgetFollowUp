/* Tests de la sélection multiple — Playwright (Chromium), sans dépendance à installer.
   Usage : node tests/selection-multiple.mjs
   Sur Dépenses et Revenus (données de démo) :
   - la barre de sélection n'apparaît qu'une fois une ligne cochée ;
   - « Tout sélectionner » (en-tête) coche toutes les lignes affichées ;
   - la suppression groupée demande confirmation puis retire exactement les lignes cochées ;
   - « Annuler » vide la sélection ;
   - sur téléphone (390 px), les cases restent accessibles sans défilement horizontal. */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TYPES = {'.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css'};
const server = http.createServer((req,res)=>{
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url,'http://x').pathname));
  if(!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': TYPES[path.extname(p)]||'application/octet-stream'});
  fs.createReadStream(p).pipe(res);
});
await new Promise(r=>server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const fixture = fs.readFileSync(path.join(ROOT,'tests/fixtures/demo-solde.js'),'utf8');

let failures = 0, passes = 0;
const ok = (cond, msg) => { if(cond){ passes++; } else { failures++; console.log('  ✗ '+msg); } };

async function openApp(browser, {width=1440, height=900, hash}){
  const ctx = await browser.newContext({viewport:{width, height}, reducedMotion:'reduce'});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e=>errors.push('pageerror: '+e.message));
  page.on('console', m=>{ if(/Failed to load resource/.test(m.text())) return; if(m.type()==='error') errors.push(m.text()); });
  await page.addInitScript(`${fixture};
    if(!sessionStorage.getItem('seeded')){
      localStorage.clear();
      localStorage.setItem('force_reset_version','2');
      localStorage.setItem('budget_auth', JSON.stringify({users:SOLDE_DEMO.users, setupCodeUsed:true}));
      localStorage.setItem('budget_store', JSON.stringify(SOLDE_DEMO.store));
      localStorage.setItem('budget_session_remember', JSON.stringify({userId:SOLDE_DEMO.me, expiresAt:Date.now()+864e5}));
      sessionStorage.setItem('seeded','1');
    }`);
  await page.goto(BASE + '/index.html' + hash);
  await page.waitForSelector('#view > *', {timeout:10000}).catch(()=>{});
  await page.waitForTimeout(300);
  return {ctx, page, errors};
}
const stateLen = (page, k) => page.evaluate(k=>state[k].length, k);
const rowBoxes = (page, table) => page.locator(`tbody .bulk-cb[data-bulk="${table}"]`);
const bar = (page, table) => page.locator(`[data-bulk-bar="${table}"]`);

async function checkTable(browser, {hash, table, stateKey}){
  console.log(`— ${table}`);
  const {ctx, page, errors} = await openApp(browser, {hash});
  const n = await rowBoxes(page, table).count();
  ok(n>=2, `${table} : au moins 2 lignes à cocher (trouvé ${n})`);
  ok(await bar(page, table).isHidden(), `${table} : barre masquée sans sélection`);

  await rowBoxes(page, table).nth(0).check();
  await rowBoxes(page, table).nth(1).check();
  ok(await bar(page, table).isVisible(), `${table} : barre visible après sélection`);
  ok(/^2 /.test(await bar(page, table).locator('.bulk-count').textContent()), `${table} : compteur à 2`);
  ok(await page.locator(`thead .bulk-cb[data-bulk="${table}"]`).evaluate(cb=>cb.indeterminate) || n===2, `${table} : case d'en-tête partielle`);

  await bar(page, table).locator('[data-action="bulk-clear"]').click();
  ok(await bar(page, table).isHidden(), `${table} : « Annuler » vide la sélection`);

  // Coche deux lignes, puis supprime : exactement ces lignes partent.
  const ids = [];
  for(const i of [0,1]){ const cb = rowBoxes(page, table).nth(i); ids.push(...(await cb.getAttribute('data-ids')).split(',')); await cb.check(); }
  const before = await stateLen(page, stateKey);
  await bar(page, table).locator('[data-action="bulk-delete"]').click();
  ok(await page.locator('#del-yes').isVisible(), `${table} : confirmation demandée`);
  await page.click('#del-yes');
  await page.waitForTimeout(300);
  const after = await stateLen(page, stateKey);
  ok(after===before-ids.length, `${table} : ${ids.length} lignes supprimées (avant ${before}, après ${after})`);
  const left = await page.evaluate(([k,ids])=>state[k].filter(x=>ids.includes(x.id)).length, [stateKey, ids]);
  ok(left===0, `${table} : les lignes cochées ne sont plus dans les données`);
  ok(await bar(page, table).count()===0 || await bar(page, table).isHidden(), `${table} : barre masquée après suppression`);

  // « Tout sélectionner » dans l'en-tête.
  const head = page.locator(`thead .bulk-cb[data-bulk="${table}"]`);
  if(await head.count()){
    await head.check();
    const m = await rowBoxes(page, table).count();
    const checked = await page.locator(`tbody .bulk-cb[data-bulk="${table}"]:checked`).count();
    ok(checked===m, `${table} : l'en-tête coche toutes les lignes (${checked}/${m})`);
  }
  ok(errors.length===0, `${table} : aucune erreur JS (${errors.join(' | ')})`);
  await ctx.close();
}

const browser = await chromium.launch();
try{
  await checkTable(browser, {hash:'#depenses/2026-09', table:'depenses', stateKey:'depenses'});
  await checkTable(browser, {hash:'#revenus/2026-09', table:'revexc', stateKey:'revenusExceptionnels'});

  console.log('— 390 px');
  const {ctx, page, errors} = await openApp(browser, {width:390, height:844, hash:'#depenses/2026-09'});
  const cb = rowBoxes(page, 'depenses').first();
  ok(await cb.isVisible(), 'téléphone : case visible');
  await cb.check();
  ok(await bar(page, 'depenses').isVisible(), 'téléphone : barre visible');
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth), 'téléphone : pas de défilement horizontal');
  ok(errors.length===0, `téléphone : aucune erreur JS (${errors.join(' | ')})`);
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} vérifications réussies, ${failures} en échec.`);
process.exit(failures ? 1 : 0);
