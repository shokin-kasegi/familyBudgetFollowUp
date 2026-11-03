/* Tests de l'aiguillage des data-action — Playwright (Chromium), sans dépendance à installer.
   Usage : node tests/aiguillage-actions.mjs
   handleAction passe par des tables { nomAction: fonction } rangées par domaine :
   - chaque data-action écrite dans les sources (index.html, js/) est servie par une table (sauf celles
     traitées ailleurs, listées ici) et chaque entrée pointe vers une fonction ;
   - aucune action n'est déclarée dans deux domaines (erreur console au chargement) ;
   - une action inconnue, ou un nom hérité d'Object (toString), ne fait rien ;
   - quelques actions de domaines différents marchent encore au clic réel, avec l'id
     de la ligne (modification, suppression) ou sans (sections des paramètres). */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exposerModules } from './outils/exposer-modules.mjs';
import { toutesSources } from './outils/sources.mjs';

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
const SRC = toutesSources(); // index.html, css/app.css et js/**/*.js

// data-action traitées avant handleAction (écouteur de clic) ou par l'écouteur de saisie.
const HORS_TABLE = new Set(['close-chat', 'close-notif', 'open-parametres', 'col-filter-search']);

let failures = 0, passes = 0;
const ok = (cond, msg) => { if(cond){ passes++; } else { failures++; console.log('  ✗ '+msg); } };

async function openApp(browser, {width=1440, height=900, hash}){
  const ctx = await browser.newContext({viewport:{width, height}, reducedMotion:'reduce'});
  await exposerModules(ctx);
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
  await page.waitForSelector('#view > *', {timeout:10000}).catch(()=>{}); await page.evaluate(()=>window.__modulesExposes);
  await page.waitForTimeout(300);
  return {ctx, page, errors};
}

const browser = await chromium.launch();
try{
  console.log('— Tables d’actions');
  const {ctx, page, errors} = await openApp(browser, {hash:'#revenus/2026-09'});
  const reg = await page.evaluate(()=>({
    noms: Object.keys(ACTIONS),
    pasFonction: Object.entries(ACTIONS).filter(([,f])=>typeof f!=='function').map(([n])=>n),
    domaines: Object.keys(ACTION_DOMAINES),
    total: Object.values(ACTION_DOMAINES).reduce((n,t)=>n+Object.keys(t).length, 0),
  }));
  ok(reg.noms.length>50, `les tables couvrent les actions (${reg.noms.length})`);
  ok(reg.total===reg.noms.length, `aucune action dans deux domaines (${reg.total} déclarées, ${reg.noms.length} distinctes)`);
  ok(reg.pasFonction.length===0, `chaque entrée est une fonction (${reg.pasFonction.join(', ')})`);
  const ecrites = new Set([...SRC.matchAll(/data-action="([a-z][a-z-]*)"/g)].map(m=>m[1]));
  const orphelines = [...ecrites].filter(a=>!HORS_TABLE.has(a) && !reg.noms.includes(a));
  ok(orphelines.length===0, `chaque data-action écrite a sa fonction (sans : ${orphelines.join(', ')})`);
  const inconnues = await page.evaluate(async ()=>{
    try{ await handleAction('toString'); await handleAction('action-qui-n-existe-pas'); await handleAction('__proto__'); return 'ok'; }
    catch(e){ return e.message; }
  });
  ok(inconnues==='ok', `action inconnue ou héritée d’Object : sans effet (${inconnues})`);

  console.log('— Revenus : modifier et supprimer une ligne (id transmis)');
  const premier = await page.evaluate(()=>{ const r = mine(state.revenusExceptionnels).find(x=>moisDe(x.date)==='2026-09'); return r && {id:r.id, libelle:r.libelle}; });
  ok(!!premier, 'un revenu en septembre 2026 dans la démo');
  await page.click(`[data-action="edit-revexc"][data-id="${premier.id}"]`);
  ok(await page.locator('#modal-title').textContent()==='Modifier le revenu', 'la fenêtre de modification s’ouvre');
  ok(await page.inputValue('#f_libelle')===premier.libelle, 'elle est préremplie avec la bonne ligne');
  await page.fill('#f_libelle', 'Revenu renommé');
  await page.click('#modal-form button[type=submit]');
  await page.waitForTimeout(300);
  ok(await page.evaluate(id=>parId(state.revenusExceptionnels, id).libelle, premier.id)==='Revenu renommé', 'la modification touche la bonne ligne');
  const avant = await page.evaluate(()=>state.revenusExceptionnels.length);
  await page.click(`[data-action="del-revexc"][data-id="${premier.id}"]`);
  await page.click('#del-yes');
  await page.waitForTimeout(300);
  ok(await page.evaluate(id=>!state.revenusExceptionnels.some(x=>x.id===id), premier.id), 'la suppression retire cette ligne');
  ok(await page.evaluate(()=>state.revenusExceptionnels.length)===avant-1, 'et elle seule');

  console.log('— Paramètres : changer de section (data-sec, sans id)');
  await page.evaluate(async ()=>{ await navigateTo('parametres'); });
  await page.waitForTimeout(300);
  const sections = page.locator('[data-action="param-section"]');
  ok(await sections.count()>=2, 'au moins deux sections de paramètres');
  const cible = await sections.nth(1).getAttribute('data-sec');
  await sections.nth(1).click();
  await page.waitForTimeout(300);
  ok(await page.evaluate(()=>paramSection)===cible, `la section « ${cible} » est choisie`);
  ok(await page.locator(`[data-action="param-section"][data-sec="${cible}"]`).getAttribute('aria-current')==='true', 'et marquée comme courante');
  ok(errors.length===0, `aucune erreur JS (${errors.join(' | ')})`);
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} vérifications réussies, ${failures} en échec.`);
process.exit(failures ? 1 : 0);
