/* Tests « Basculer une dépense en revenu » — Playwright (Chromium), sans dépendance à installer.
   Usage : node tests/depense-vers-revenu.mjs [--shots dossier]
   - depuis « Modifier la dépense », la saisie devient un revenu pré-rempli, au montant positif ;
   - la dépense disparaît des dépenses, le revenu compte dans le mois ;
   - un montant négatif est remis en positif ;
   - une dépense d'abonnement emporte son prélèvement prévu ;
   - pas d'erreur console. */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const browser = await chromium.launch();
const ctx = await browser.newContext({viewport:{width:1280, height:900}, reducedMotion:'reduce'});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e=>errors.push('pageerror: '+e.message));
page.on('console', m=>{ if(/Failed to load resource/.test(m.text())) return; if(m.type()==='error' || m.type()==='assert') errors.push(m.type()+': '+m.text()); });
await page.addInitScript(`${fixture};
  if(!sessionStorage.getItem('seeded')){
    localStorage.clear();
    localStorage.setItem('force_reset_version','2');
    localStorage.setItem('budget_auth', JSON.stringify({users:SOLDE_DEMO.users, setupCodeUsed:true}));
    localStorage.setItem('budget_store', JSON.stringify(SOLDE_DEMO.store));
    localStorage.setItem('budget_session_remember', JSON.stringify({userId:SOLDE_DEMO.me, expiresAt:Date.now()+400*864e5}));
    sessionStorage.setItem('seeded','1');
  }`);

await page.clock.setFixedTime(new Date('2026-10-15T10:00:00'));
const aller = async hash => { await page.evaluate(h=>{ location.hash = h; }, hash); await page.waitForTimeout(350); };
const store = () => page.evaluate(()=>JSON.parse(localStorage.getItem('budget_store')));
const mesDeps = async () => (await store()).depenses.filter(d=>d.ownerId==='u-me' && d.modePaiement==='Unique');
const mesRevs = async () => (await store()).revenusExceptionnels.filter(r=>r.ownerId==='u-me');
const shot = async name => { if(SHOTS) await page.screenshot({path:path.join(SHOTS, name+'.png'), fullPage:true}); };
async function ajouterDepense(libelle, montant, abonnement){
  await page.click('[data-action="add-depense"]');
  await page.fill('#f_date', '2026-10-05');
  await page.fill('#f_libelle', libelle);
  await page.fill('#f_montant', String(montant));
  if(abonnement) await page.check('#f_abonnement');
  await page.click('#modal-form button[type=submit]');
  await page.waitForTimeout(400);
  return (await mesDeps()).find(d=>d.libelle===libelle && !d.prevu);
}
async function basculer(depId, avantSubmit){
  await page.click(`[data-action="edit-depense"][data-id="${depId}"]`);
  await page.waitForSelector('#dep-vers-revenu');
  await page.click('#dep-vers-revenu');
  await page.waitForTimeout(150);
  if(avantSubmit) await avantSubmit();
  await page.click('#modal-form button[type=submit]');
  await page.waitForTimeout(400);
}

try{
  await page.goto(BASE + '/index.html#depenses/2026-10');
  await page.waitForSelector('#view > *', {timeout:10000});
  await page.waitForTimeout(300);

  console.log('\n— Dépense basculée en revenu');
  const dep = await ajouterDepense('Virement de Paul', 45.5);
  ok(!!dep, 'la dépense est créée');
  const nbRevs = (await mesRevs()).length;
  await basculer(dep.id, async ()=>{
    ok(await page.$eval('#modal-title', h=>h.textContent)==='Basculer en revenu', 'la fenêtre du revenu s’ouvre');
    ok(await page.$eval('#f_libelle', i=>i.value)==='Virement de Paul', 'libellé repris');
    ok(await page.$eval('#f_date', i=>i.value)==='2026-10-05', 'date reprise');
    ok(Number(await page.$eval('#f_montant', i=>i.value))===45.5, 'montant repris, en positif');
    await shot('basculer-revenu');
  });
  {
    ok(!(await mesDeps()).some(d=>d.id===dep.id), 'la dépense est retirée');
    const revs = await mesRevs();
    const rev = revs.find(r=>r.libelle==='Virement de Paul');
    ok(revs.length===nbRevs+1 && rev && rev.montant===45.5 && rev.date==='2026-10-05' && !!rev.categorie, `le revenu est créé (${JSON.stringify(rev)})`);
    await aller('#revenus/2026-10');
    ok(/Virement de Paul/.test(await page.evaluate(()=>document.getElementById('view').innerText)), 'le revenu apparaît dans l’onglet Revenus');
  }

  console.log('\n— Montant négatif remis en positif');
  await aller('#depenses/2026-10');
  const dep2 = await ajouterDepense('Remboursement Amazon', 19.99);
  await basculer(dep2.id, ()=>page.fill('#f_montant', '-19.99'));
  {
    const rev = (await mesRevs()).find(r=>r.libelle==='Remboursement Amazon');
    ok(rev && rev.montant===19.99, `montant enregistré en positif (${rev && rev.montant})`);
  }

  console.log('\n— Dépense d’abonnement');
  await aller('#depenses/2026-10');
  const abo = await ajouterDepense('Cashback mensuel', 5, true);
  ok(abo && abo.aboId && (await mesDeps()).some(d=>d.prevu && d.aboId===abo.aboId), 'abonnement avec prélèvement prévu');
  await basculer(abo.id);
  {
    const deps = await mesDeps();
    ok(!deps.some(d=>d.aboId===abo.aboId), 'la dépense et son prélèvement prévu sont retirés');
    ok((await mesRevs()).some(r=>r.libelle==='Cashback mensuel' && r.montant===5), 'le revenu est créé');
  }

  ok(errors.length===0, `erreurs console\n    ${errors.join('\n    ')}`);
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} vérifications réussies, ${failures} en échec.`);
process.exit(failures ? 1 : 0);
