/* Tests du point unique d'écriture de l'import de relevé — Playwright (Chromium).
   Usage : node tests/releve-doublons.mjs
   - toute ligne validée est écrite avec l'empreinte de l'opération bancaire ;
   - deux opérations identiques du même relevé restent deux lignes ;
   - le même relevé réimporté n'écrit rien deux fois, même si l'utilisateur
     force les lignes (il passe outre « Déjà saisie »), même après rechargement
     ou depuis une session ouverte avant l'empreinte ;
   - une opération supprimée peut être réimportée. */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsIdx = process.argv.indexOf('--shots');
let I2;
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

async function openApp(browser, {width, height}){
  const ctx = await browser.newContext({viewport:{width, height}});
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
  await page.goto(BASE + '/index.html#releve');
  await page.waitForSelector('#view > *', {timeout:10000});
  await page.waitForTimeout(300);
  return {ctx, page, errors};
}
// Un fichier de relevé en mémoire, comme si l'utilisateur l'avait choisi.
async function importer(page, name, text, encoding){
  await page.setInputFiles('#releve-file', {name, mimeType:'text/csv', buffer: Buffer.from(text, encoding||'utf8')});
  await page.waitForSelector('.rl-row', {timeout:5000});
  await page.waitForTimeout(250);
}
const lignes = page => page.evaluate(()=>[...document.querySelectorAll('.rl-row')].map(r=>({
  id: r.dataset.rlRow,
  lib: r.querySelector('[data-rl-champ="libelle"]').value,
  type: r.querySelector('[data-rl-champ="type"]').value,
  cat: r.querySelector('[data-rl-champ="categorie"]')?.value ?? null,
  badge: r.querySelector('.pill').innerText,
  raison: r.querySelector('.rl-raison')?.innerText ?? '',
  amt: r.querySelector('.rl-signe').innerText + r.querySelector('[data-rl-champ="montant"]').value,
})));


const RELEVE = fs.readFileSync(path.join(ROOT, 'tests/fixtures/releves/debit-credit-preambule-cp1252.csv'));
const importes = page => page.evaluate(()=>{
  const me = currentUser().id;
  return state.depenses.concat(state.revenusExceptionnels).filter(x=>x.ownerId===me && x.source==='releve' && !x.prevu)
    .map(x=>({lib:x.libelle, date:x.date, montant:x.montant, e:x.releveEmpreinte}));
});
// L'utilisateur force chaque ligne en dépense ou en rentrée (il passe outre « Déjà saisie »).
const toutForcer = page => page.evaluate(()=>{ releveSession.lignes.forEach(l=>{ if(l.etat==='attente'){ l.v.type = l.montant<0 ? 'depense' : 'revenu'; l.suivi = false; } }); });
const recharger = async page => { await page.reload(); await page.waitForSelector('#view > *'); await page.waitForTimeout(300); };

const browser = await chromium.launch();
try{
  console.log('\n— Premier import : chaque opération écrite une fois, avec son empreinte');
  const {ctx, page, errors} = await openApp(browser, {width:1440, height:900});
  const avant = (await importes(page)).length;
  await page.setInputFiles('#releve-file', {name:'releve.csv', mimeType:'text/csv', buffer: RELEVE});
  await page.waitForSelector('.rl-row', {timeout:5000});
  ok(await page.$$eval('.rl-row', r=>r.length)===7, 'relevé : 7 lignes');
  await toutForcer(page);
  await page.evaluate(async()=>{ await releveValider(releveSession.lignes.map(l=>l.id)); });
  let I = await importes(page);
  ok(I.length-avant===7, `7 opérations écrites (dont les deux boulangeries identiques du même jour) : ${I.length-avant}`);
  ok(I.filter(x=>x.montant===4.3 && x.date==='2026-09-09').length===2, 'deux achats identiques le même jour : deux dépenses');
  const nouvelles = I.slice(avant);
  ok(nouvelles.every(x=>x.e) && new Set(nouvelles.map(x=>x.e)).size===7, `chaque ligne écrite porte une empreinte distincte : ${JSON.stringify(nouvelles.map(x=>x.e))}`);

  console.log('\n— Même relevé réimporté : rien n’est écrit deux fois');
  await page.click('[data-action="releve-fermer"]');
  await page.waitForTimeout(250);
  await page.setInputFiles('#releve-file', {name:'releve.csv', mimeType:'text/csv', buffer: RELEVE});
  await page.waitForSelector('.rl-row', {timeout:5000});
  await toutForcer(page);
  await page.click('[data-action="releve-valider-tout"]');
  await page.waitForTimeout(400);
  ok((await importes(page)).length===I.length, `aucune ligne ajoutée au deuxième import (${(await importes(page)).length-I.length} de trop)`);
  const toast = await page.evaluate(()=>document.getElementById('toast').innerText);
  ok(/déjà importées/.test(toast), `le message le dit : « ${toast} »`);
  const etat = await page.evaluate(()=>releveSession ? releveSession.lignes.map(l=>[l.etat, l.raison]) : null);
  ok(!etat || etat.every(([e, r])=>e==='ignoree' && /Déjà importée/.test(r)), `lignes rangées en « Ne pas importer » avec la raison : ${JSON.stringify(etat)}`);
  const regles = await page.evaluate(()=>releveModele(false).regles);
  ok(Object.values(regles).every(r=>r.type!=='ignorer'), 'un doublon n’apprend pas « ignorer » pour le commerçant');

  console.log('\n— Après rechargement et sur une ancienne session sans empreinte');
  await recharger(page);
  ok((await importes(page)).every(x=>x.e), 'l’empreinte est gardée dans les données enregistrées');
  await page.evaluate(async t=>{ await releveDemarrer('Ancienne session', releveAnalyserTexte(t, releveModele(false))); releveSession.lignes.forEach(l=>{ delete l.empreinte; }); releveSauverSession(); },
    new TextDecoder('windows-1252').decode(RELEVE));
  await recharger(page);
  await toutForcer(page);
  await page.evaluate(async()=>{ await releveValider(releveSession.lignes.map(l=>l.id)); });
  ok((await importes(page)).length===I.length, 'ancienne session : l’empreinte est recalculée, les doublons sont refusés');

  console.log('\n— Une opération supprimée peut être réimportée');
  const supprimee = await page.evaluate(()=>{ const me = currentUser().id; const i = state.depenses.findIndex(d=>d.ownerId===me && d.source==='releve' && d.montant===60); const d = state.depenses.splice(i,1)[0]; return d.libelle; });
  await page.evaluate(async t=>{ await releveDemarrer('Encore', releveAnalyserTexte(t, releveModele(false))); }, new TextDecoder('windows-1252').decode(RELEVE));
  await toutForcer(page);
  await page.evaluate(async()=>{ await releveValider(releveSession.lignes.map(l=>l.id)); });
  I2 = await importes(page);
  ok(I2.length===I.length && I2.some(x=>x.montant===60), `seule « ${supprimee} » est réécrite`);
  ok(errors.length===0, `erreurs console : ${errors.join(' | ')}`);
  await ctx.close();
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} vérifications réussies, ${failures} en échec.`);
process.exit(failures ? 1 : 0);
