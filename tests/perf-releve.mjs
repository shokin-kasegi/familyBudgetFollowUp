/* Performance de l'import de relevé — Playwright (Chromium).
   Usage : node tests/perf-releve.mjs
   Importe un relevé annuel de 1970 lignes et mesure le temps d'import,
   d'une validation, d'un changement de champ, et la fluidité du défilement. */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = http.createServer((req,res)=>{
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url,'http://x').pathname));
  if(!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript'});
  fs.createReadStream(p).pipe(res);
});
await new Promise(r=>server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const fixture = fs.readFileSync(path.join(ROOT,'tests/fixtures/demo-solde.js'),'utf8');

const N = 1970;
const COMMERCES = ['CB CARREFOUR MARKET','CB LIDL','PRLV SEPA EDF SA','CB SNCF','CB AMAZON PAYMENTS','CB BOULANGERIE PAUL','CB TOTAL ENERGIES','PRLV FREE MOBILE','CB PHARMACIE CENTRALE','CB DECATHLON','CB FNAC','CB UBER EATS','CB MONOPRIX','CB LEROY MERLIN','CB IKEA'];
const lignesCsv = ['Date;Libellé;Débit euros;Crédit euros;'];
for(let i=0;i<N;i++){
  const d = new Date(2026,0,1+Math.floor(i*365/N));
  const dd = String(d.getDate()).padStart(2,'0'), mm = String(d.getMonth()+1).padStart(2,'0');
  if(i%40===0) lignesCsv.push(`${dd}/${mm}/2026;"VIR SEPA RECU /DE ACME SARL /MOTIF SALAIRE ${i}";;2 300,00;`);
  else lignesCsv.push(`${dd}/${mm}/2026;"${COMMERCES[i%COMMERCES.length]} ${dd}/${mm} REF${i}";${(5+(i*37)%180)},${String(i%100).padStart(2,'0')};;`);
}
const CSV = lignesCsv.join('\n');

const browser = await chromium.launch();
const ctx = await browser.newContext({viewport:{width:1440, height:900}});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e=>errors.push(e.message));
await page.addInitScript(`${fixture};
  if(!sessionStorage.getItem('seeded')){
    localStorage.clear();
    localStorage.setItem('force_reset_version','2');
    localStorage.setItem('budget_auth', JSON.stringify({users:SOLDE_DEMO.users, setupCodeUsed:true}));
    localStorage.setItem('budget_store', JSON.stringify(SOLDE_DEMO.store));
    localStorage.setItem('budget_session_remember', JSON.stringify({userId:SOLDE_DEMO.me, expiresAt:Date.now()+864e5}));
    sessionStorage.setItem('seeded','1');
  }`);
await page.goto(BASE + '/index.html#releve');
await page.waitForSelector('#view > *');
await page.waitForTimeout(300);

const frame = () => page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
let t = Date.now();
await page.setInputFiles('#releve-file', {name:'releve-2026.csv', mimeType:'text/csv', buffer: Buffer.from(CSV)});
await page.waitForSelector('.rl-row', {timeout:60000}); await frame();
const tImport = Date.now()-t;
const nbDom = await page.evaluate(()=>document.querySelectorAll('#view *').length);

t = Date.now();
await page.locator('.rl-row [data-action="releve-valider"]').first().click();
await page.waitForFunction(()=>releveSession.lignes.some(l=>l.etat==='validee'));
await page.waitForTimeout(130); // persist() attend 120 ms avant d'écrire
await frame();
const tValider = Date.now()-t;

t = Date.now();
await page.locator('.rl-row').nth(3).locator('.rl-type [data-cat-toggle]').click();
await page.locator('.rl-row').nth(3).locator('.rl-type [data-rl-pick="revenu"]').click();
await frame();
const tType = Date.now()-t;

// Défilement : images par seconde pendant 2 s de défilement continu.
const mesurerFps = () => page.evaluate(()=>new Promise(res=>{
  let frames = 0; const t0 = performance.now(); window.scrollTo(0,0);
  const step = ()=>{ frames++; window.scrollBy(0, 40); if(performance.now()-t0 < 2000) requestAnimationFrame(step); else res(frames/((performance.now()-t0)/1000)); };
  requestAnimationFrame(step);
}));
const fps = await mesurerFps();
if(process.env.SHOT){ await page.evaluate(()=>scrollTo(0, document.body.scrollHeight)); await frame(); await page.screenshot({path:process.env.SHOT}); }
const lignesAffichees = await page.locator('.rl-row').count();
// « Afficher plus » ajoute une tranche ; « Tout valider » traite aussi les lignes non affichées.
await page.click('[data-action="releve-plus"]'); await frame();
const apresPlus = await page.locator('.rl-row').count();
t = Date.now();
await page.click('[data-action="releve-valider-tout"]');
await page.waitForFunction(()=>releveSession.lignes.every(l=>l.etat!=='attente'));
await page.waitForTimeout(130); await frame();
const tToutValider = Date.now()-t;
const ajoutees = await page.evaluate(()=>state.depenses.filter(d=>d.source==='releve').length + state.revenusExceptionnels.filter(d=>d.source==='releve').length);

const mesures = {tImport, nbDom, lignesAffichees, apresPlus, tValider, tType, tToutValider, ajoutees, fps: Math.round(fps)};
console.log(mesures);
let echecs = 0;
const ok = (c, m) => { if(!c){ echecs++; console.log('  ✗ '+m); } };
ok(lignesAffichees===50 && apresPlus===100, 'affichage par tranches de 50');
ok(nbDom < 20000, 'moins de 20 000 éléments affichés');
ok(tImport < 2000, 'import en moins de 2 s');
ok(tValider < 1500, 'validation d’une ligne en moins de 1,5 s');
ok(tToutValider < 5000, 'tout valider en moins de 5 s');
ok(ajoutees + 0 >= N - 1 - 50, 'toutes les lignes en attente sont traitées par « Tout valider »');
ok(!errors.length, 'pas d’erreur : '+errors.join(' | '));
console.log(echecs ? `${echecs} échec(s)` : 'OK');
await browser.close(); server.close();
process.exit(echecs ? 1 : 0);
