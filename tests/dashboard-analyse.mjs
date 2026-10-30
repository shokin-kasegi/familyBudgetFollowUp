/* Tests du double-clic tableau de bord → Analyse par catégorie.
   Usage : node tests/dashboard-analyse.mjs
   (en-tête repris de tests/refonte-v1.mjs) — Tests de la refonte V1 — Playwright (Chromium), sans dépendance à installer.
   Usage : node tests/refonte-v1.mjs [--shots dossier]
   Sert le dépôt en local, injecte tests/fixtures/demo-solde.js dans le
   localStorage, puis vérifie sur chaque vue et à 1440 / 768 / 390 px :
   - aucune erreur JS ni console.assert en échec ;
   - aucun « undefined », « null » ou « NaN » à l'écran ;
   - totaux = somme des lignes affichées (tableau de bord, Revenus, Dépenses,
     Vue annuelle) ;
   - les vues de l'ancien modèle (Échéances, Objectifs, Charges, Compte joint)
     ont disparu, et leurs données sont ignorées ;
   - pas de défilement horizontal de la page à 390 px ;
   - critères du système de design (police unique, pas de flou ni de dégradé
     décoratif hors verre liquide, un seul bouton plein par écran) ;
   - l'île (menu) : ouverture, sélection animée, clavier, et les trois thèmes. */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright est installé globalement (pas de package.json) : require le trouve via NODE_PATH.
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsIdx = process.argv.indexOf('--shots');
const SHOTS = shotsIdx > 0 ? path.resolve(process.argv[shotsIdx+1]) : null;
if(SHOTS) fs.mkdirSync(SHOTS, {recursive:true});

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

// Nombre au format fr-FR (« 1 234,56 € », « −12,00 € ») → Number.
const num = s => { const t = String(s).replace(/[\s  €]/g,'').replace('−','-').replace(',','.'); return Number(t); };

async function openApp(browser, {width, height, hash='#dashboard/2026-09', reducedMotion='no-preference', seed=true}){
  const ctx = await browser.newContext({viewport:{width, height}, reducedMotion});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e=>errors.push('pageerror: '+e.message));
  // Les polices Google peuvent être bloquées (hors ligne, bac à sable) : ce n'est pas une erreur de l'app.
  page.on('console', m=>{ if(/Failed to load resource/.test(m.text())) return; if(m.type()==='error' || m.type()==='assert' || /Assertion failed/.test(m.text())) errors.push(m.type()+': '+m.text()); });
  if(seed) await page.addInitScript(`${fixture};
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
  await page.waitForTimeout(400);
  return {ctx, page, errors};
}
async function gotoView(page, hash){
  await page.evaluate(h=>{ location.hash = h; }, hash);
  await page.waitForTimeout(450);
}
async function visibleText(page){ return page.evaluate(()=>document.getElementById('view').innerText); }


const browser = await chromium.launch();
try {
  const {page, errors} = await openApp(browser, {width:1440, height:900, reducedMotion:'reduce'});
  const postes = await page.$$eval('#view .poste[data-k^="cat:"]', b=>b.map(x=>x.dataset.k.slice(4)));
  ok(postes.length>0, 'des postes au tableau de bord');
  const cat = postes.find(p=>p!=='Autres');
  await page.dblclick(`#view .poste[data-k="cat:${cat}"]`);
  await page.waitForTimeout(600);
  ok(await page.evaluate(()=>location.hash==='#analyse'), `double-clic sur ${cat} → vue Analyse`);
  const txt = await visibleText(page);
  ok(txt.includes(`Catégorie : ${cat}`), 'filtre catégorie affiché');
  const attendu = await page.evaluate(c=>mesSorties().filter(d=>catLabel(d)===c && d.date.startsWith('2026')).length, cat);
  const cats = await page.$$eval('table[data-name="lignes analysées"] tbody tr td:nth-child(2)', t=>t.map(x=>x.innerText.trim()));
  ok(cats.length===attendu && cats.every(c=>c===cat), `toutes les lignes ${cat} de 2026 (${cats.length}/${attendu})`);
  const lignes = await page.$$eval('table[data-name="lignes analysées"] tbody td.num', t=>t.map(x=>Number(x.dataset.v)));
  const tot = await page.$eval('table[data-name="lignes analysées"] tfoot td.num', x=>Number(x.dataset.v));
  const annee = await page.$eval('table[data-name="analyse"] tfoot td.num', x=>Number(x.dataset.v));
  ok(Math.abs(lignes.reduce((s,v)=>s+v,0)-tot)<0.01 && Math.abs(tot-annee)<0.01, `total des lignes = total de l'année (${tot} / ${annee})`);
  await page.click('[data-action="analyse-clear-cat"]');
  await page.waitForTimeout(400);
  ok(!(await page.$('table[data-name="lignes analysées"]')) || !(await visibleText(page)).includes('Catégorie :'), 'retirer le filtre catégorie');

  if(postes.includes('Autres')){
    await gotoView(page, '#dashboard/2026-09');
    await page.dblclick('#view .poste[data-k="cat:Autres"]');
    await page.waitForTimeout(600);
    const autres = await page.$$eval('table[data-name="lignes analysées"] tbody tr td:nth-child(2)', t=>t.map(x=>x.innerText.trim()));
    ok(autres.length>0 && autres.every(c=>!postes.slice(0,-1).includes(c)), `« Autres » : seulement les petites catégories (${new Set(autres).size})`);
  }
  ok(errors.length===0, `erreurs console\n    ${errors.join('\n    ')}`);
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} vérifications réussies, ${failures} en échec.`);
process.exit(failures ? 1 : 0);
