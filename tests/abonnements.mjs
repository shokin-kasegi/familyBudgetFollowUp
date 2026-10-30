/* Tests des abonnements — Playwright (Chromium), sans dépendance à installer.
   Usage : node tests/abonnements.mjs [--shots dossier]
   - une dépense marquée abonnement annonce le même prélèvement le mois d'après,
     sans le compter (reste à vivre, graphiques) tant qu'il n'est pas validé ;
   - nouveau prix annoncé, puis signalé dans les notifications ;
   - import d'un relevé : la ligne correspondante valide le prélèvement attendu
     (et note le changement de prix), une autre ligne peut être marquée abonnement ;
   - le 1er du mois suivant, une prévision non validée est retirée avec la série ;
   - graphiques par catégorie (une case et une couleur par catégorie) ;
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
const num = s => Number(String(s).replace(/[\s  €]/g,'').replace('−','-').replace(',','.'));

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

// Le jour « courant » est figé : chaque étape avance dans le temps.
async function ouvrir(jour, hash){
  await page.clock.setFixedTime(new Date(jour+'T10:00:00'));
  await page.goto(BASE + '/index.html' + hash);
  await page.waitForSelector('#view > *', {timeout:10000});
  await page.waitForTimeout(300);
}
async function aller(hash){ await page.evaluate(h=>{ location.hash = h; }, hash); await page.waitForTimeout(350); }
const store = () => page.evaluate(()=>JSON.parse(localStorage.getItem('budget_store')));
const mesDeps = async () => (await store()).depenses.filter(d=>d.ownerId==='u-me' && d.modePaiement==='Unique'); // sans les abonnements de l'ancien modèle
const dash = () => page.evaluate(()=>({
  reste: num(document.querySelector('[data-dash="reste"]')?.innerText),
  postes: [...document.querySelectorAll('.poste')].map(p=>({lbl:p.querySelector('.lbl').innerText.trim(), val:num(p.querySelector('.val').innerText), color:p.querySelector('.dot').style.background})),
  note: document.querySelector('.hero-note')?.innerText || '',
}));
await page.addInitScript(()=>{ window.num = s => Number(String(s||'').replace(/[\s  €]/g,'').replace('−','-').replace(',','.')); });
const shot = async name => { if(SHOTS) await page.screenshot({path:path.join(SHOTS, name+'.png'), fullPage:true}); };

try{
  console.log('\n— Graphiques par catégorie');
  await ouvrir('2026-10-15', '#dashboard/2026-09');
  {
    const d = await dash();
    ok(d.postes.map(p=>p.lbl).join('|')==='Alimentation|Sorties|Transport|Cadeaux', `septembre : une case par catégorie, de la plus grosse à la plus petite (${d.postes.map(p=>p.lbl)})`);
    ok(new Set(d.postes.map(p=>p.color)).size===d.postes.length, 'septembre : une couleur par catégorie');
    const segs = await page.$$eval('.flow .seg:not([data-k="reste"])', s=>s.length);
    ok(segs===4, `barre du revenu : un segment par catégorie (${segs})`);
    const legende = await page.$$eval('.ychart .legend > span', s=>s.map(x=>x.innerText.trim()));
    ok(legende.includes('Alimentation') && legende.includes('Revenu'), `graphique annuel : légende par catégorie (${legende})`);
    const rects = await page.$$eval('.ychart-host rect.b title', t=>t.map(x=>x.textContent));
    ok(rects.some(t=>/^Transport : /.test(t)), 'graphique annuel : colonnes empilées par catégorie');
    ok(!(await page.evaluate(()=>/Où part l’argent/.test(document.getElementById('view').innerText))), '« Où part l’argent » n’apparaît plus');
    await shot('dashboard-categories');
  }

  console.log('\n— Dépense marquée abonnement');
  await ouvrir('2026-10-15', '#depenses/2026-10');
  await aller('#dashboard/2026-10');
  const resteAvant = (await dash()).reste;
  await page.click('[data-action="add-depense"]');
  await page.fill('#f_date', '2026-10-05');
  await page.fill('#f_libelle', 'Netflix');
  await page.fill('#f_montant', '13.49');
  await page.check('#f_abonnement');
  await page.click('#modal-form button[type=submit]');
  await page.waitForTimeout(400);
  {
    const deps = await mesDeps();
    const net = deps.filter(d=>d.libelle==='Netflix');
    const valide = net.find(d=>!d.prevu), prev = net.find(d=>d.prevu);
    ok(valide && valide.aboId, 'la dépense est enregistrée comme abonnement');
    ok(prev && prev.date==='2026-11-05' && prev.aboId===valide?.aboId && prev.montant===13.49, `prélèvement prévu le 5 novembre (${JSON.stringify(prev)})`);
    ok(Math.abs((await dash()).reste - (resteAvant - 13.49)) < 0.005, 'octobre : la dépense validée compte');
  }
  await aller('#dashboard/2026-11');
  {
    const d = await dash();
    ok(d.postes.length===0, `novembre : la prévision n’entre pas dans les graphiques (${JSON.stringify(d.postes)})`);
    ok(/1 abonnement prévu/.test(d.note), `novembre : le prélèvement prévu est signalé à part (« ${d.note} »)`);
    const rects = await page.$$eval('.ychart-host g.col[data-k="2026-11"] rect.b', r=>r.length);
    ok(rects===0, 'graphique annuel : rien en novembre');
  }
  await aller('#depenses/2026-11');
  {
    const txt = await page.evaluate(()=>document.getElementById('view').innerText);
    ok(/Abonnements prévus/.test(txt) && /Netflix/.test(txt), 'onglet Dépenses : carte « Abonnements prévus »');
    const total = await page.evaluate(()=>num(document.querySelector('[data-tween="dep:total"]').dataset.v));
    ok(total===0, `onglet Dépenses : total de novembre hors prévision (${total})`);
    await shot('depenses-prevus');
  }

  console.log('\n— Nouveau prix');
  await page.click('[data-action="abo-prix"]');
  await page.fill('#f_montant', '15.99');
  await page.click('#modal-form button[type=submit]');
  await page.waitForTimeout(350);
  {
    const prev = (await mesDeps()).find(d=>d.prevu && d.libelle==='Netflix');
    ok(prev.montant===15.99, 'le prélèvement prévu prend le nouveau prix');
    const alertes = (await store()).abonnementsAlertes.filter(a=>!a.vue);
    ok(alertes.length===1 && alertes[0].type==='prix' && alertes[0].ancien===13.49 && alertes[0].nouveau===15.99, `changement de prix noté (${JSON.stringify(alertes)})`);
    await page.evaluate(()=>toggleNotifPanel(true));
    await page.waitForTimeout(200);
    const notif = await page.evaluate(()=>document.getElementById('notif-panel').innerText);
    ok(/Changement de prix/.test(notif) && /Netflix/.test(notif), 'notifications : changement de prix affiché');
    await page.click('#notif-panel [data-action="abo-alerte-vue"]');
    await page.waitForTimeout(250);
    ok((await store()).abonnementsAlertes.every(a=>a.vue), 'notification marquée comme lue');
    await page.evaluate(()=>toggleNotifPanel(false));
  }

  console.log('\n— Import : validation du prélèvement attendu');
  await ouvrir('2026-11-10', '#releve');
  const CSV = ['Date;Libellé;Montant',
    '05/11/2026;PRLV SEPA NETFLIX.COM;-17,99',
    '07/11/2026;PRLV SEPA SPOTIFY AB;-10,99',
    '08/11/2026;CB CARREFOUR MARKET;-40,00'].join('\n');
  await page.setInputFiles('#releve-file', {name:'releve.csv', mimeType:'text/csv', buffer:Buffer.from(CSV)});
  await page.waitForSelector('.rl-row');
  await page.waitForTimeout(250);
  {
    const lignes = await page.$$eval('.rl-row', rs=>rs.map(r=>({id:r.dataset.rlRow, lib:r.querySelector('[data-rl-champ="libelle"]').value, abo:r.querySelector('.rl-abo')?.getAttribute('aria-pressed'), raison:r.querySelector('.rl-raison')?.innerText||''})));
    const net = lignes.find(l=>/NETFLIX/i.test(l.lib) || l.lib==='Netflix');
    ok(net && net.lib==='Netflix' && net.abo==='true' && /Abonnement attendu/.test(net.raison) && /nouveau prix/.test(net.raison), `ligne Netflix reconnue comme le prélèvement attendu (${JSON.stringify(net)})`);
    const spo = lignes.find(l=>/spotify/i.test(l.lib));
    ok(spo && spo.abo==='false', 'ligne Spotify : pas un abonnement par défaut');
    await page.click(`.rl-row[data-rl-row="${spo.id}"] [data-action="releve-abo"]`);
    await page.waitForTimeout(200);
    ok(await page.$eval(`.rl-row[data-rl-row="${spo.id}"] .rl-abo`, b=>b.getAttribute('aria-pressed'))==='true', 'ligne Spotify marquée abonnement depuis l’import');
    await shot('import-abonnement');
    await page.click('[data-action="releve-valider-tout"]');
    await page.waitForTimeout(400);
  }
  {
    const deps = await mesDeps();
    const net = deps.filter(d=>d.libelle==='Netflix');
    ok(net.length===3, `Netflix : octobre, novembre validé, décembre prévu (${net.length})`);
    const nov = net.find(d=>d.date==='2026-11-05');
    ok(nov && !nov.prevu && nov.montant===17.99 && nov.source==='releve', `novembre validé par l’import, au montant du relevé (${JSON.stringify(nov)})`);
    const dec = net.find(d=>d.prevu);
    ok(dec && dec.date==='2026-12-05' && dec.montant===17.99, `décembre prévu au nouveau prix (${JSON.stringify(dec)})`);
    const spo = deps.filter(d=>/spotify/i.test(d.libelle));
    ok(spo.length===2 && spo.some(d=>d.prevu && d.date==='2026-12-07') && spo.some(d=>!d.prevu && d.aboId), `Spotify : abonnement créé à l’import, prévu le 7 décembre (${JSON.stringify(spo)})`);
    const alertes = (await store()).abonnementsAlertes.filter(a=>!a.vue);
    ok(alertes.some(a=>a.type==='prix' && a.ancien===15.99 && a.nouveau===17.99), 'import : changement de prix signalé');
    ok(deps.filter(d=>d.libelle==='Netflix' && d.date==='2026-11-05').length===1, 'pas de doublon : la prévision est devenue la dépense');
  }
  await aller('#dashboard/2026-11');
  {
    const d = await dash();
    ok(Math.abs(d.postes.reduce((s,p)=>s+p.val,0) - (17.99+10.99+40)) < 0.005, `novembre : les prélèvements validés comptent (${JSON.stringify(d.postes)})`);
  }

  console.log('\n— Retrait automatique le 1er du mois suivant');
  await ouvrir('2026-12-31', '#depenses/2026-12');
  ok((await mesDeps()).filter(d=>d.prevu).length===2, 'le 31 décembre, les prévisions de décembre sont encore là');
  await ouvrir('2027-01-01', '#depenses/2026-12');
  {
    const deps = await mesDeps();
    ok(deps.filter(d=>d.prevu).length===0, 'le 1er janvier, les prévisions non validées sont retirées');
    ok(deps.filter(d=>d.libelle==='Netflix' && !d.prevu).length===2, 'les prélèvements validés restent');
    const txt = await page.evaluate(()=>document.getElementById('view').innerText);
    ok(!/Abonnements prévus/.test(txt), 'plus de carte « Abonnements prévus » en décembre');
    const alertes = (await store()).abonnementsAlertes.filter(a=>a.type==='retire');
    ok(alertes.length===2, `deux abonnements retirés signalés (${alertes.length})`);
    const badge = await page.evaluate(()=>document.querySelector('.notif-badge')?.textContent || '');
    ok(/\d/.test(badge), `badge de notifications affiché (« ${badge} »)`);
  }
  await ouvrir('2027-01-01', '#depenses/2026-12');
  ok((await store()).abonnementsAlertes.filter(a=>a.type==='retire').length===2, 'un rechargement ne duplique pas les alertes');

  console.log('\n— Arrêter et décocher');
  await ouvrir('2027-01-10', '#depenses/2027-01');
  await page.click('[data-action="add-depense"]');
  await page.fill('#f_date', '2027-01-03');
  await page.fill('#f_libelle', 'Forfait mobile');
  await page.fill('#f_montant', '19.99');
  await page.check('#f_abonnement');
  await page.click('#modal-form button[type=submit]');
  await page.waitForTimeout(350);
  ok((await mesDeps()).some(d=>d.prevu && d.libelle==='Forfait mobile' && d.date==='2027-02-03'), 'forfait : prévu le 3 février');
  const idForfait = (await mesDeps()).find(d=>!d.prevu && d.libelle==='Forfait mobile').id;
  await page.click(`[data-action="edit-depense"][data-id="${idForfait}"]`);
  ok(await page.isChecked('#f_abonnement'), 'modification : la case Abonnement est cochée');
  await page.uncheck('#f_abonnement');
  await page.click('#modal-form button[type=submit]');
  await page.waitForTimeout(350);
  ok(!(await mesDeps()).some(d=>d.prevu && d.libelle==='Forfait mobile'), 'décocher Abonnement retire le prélèvement prévu');

  ok(errors.length===0, `erreurs console\n    ${errors.join('\n    ')}`);
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} vérifications réussies, ${failures} en échec.`);
process.exit(failures ? 1 : 0);
