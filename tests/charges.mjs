/* Tests des charges — Playwright (Chromium), sans dépendance à installer.
   Usage : node tests/charges.mjs [--shots dossier]
   - le formulaire demande la périodicité dès que « Charge » est coché ;
   - l'échéance suivante est prévue une période plus tard, sans compter tant
     qu'elle n'est pas validée (à la main ou par l'import) ;
   - une échéance non validée n'est jamais retirée : elle est reportée ;
   - import : échéance attendue reconnue, nouvelle charge avec sa périodicité ;
   - périodicité modifiable, charge arrêtée ;
   - onglet Échéancier : coût des charges ramené au mois ;
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

// Enregistre la modale et attend qu'elle soit fermée (la sauvegarde est terminée).
async function soumettre(){
  await page.click('#modal-form button[type=submit]');
  await page.waitForSelector('#modal-root .modal-overlay', {state:'detached', timeout:5000});
  await page.waitForTimeout(150);
}
try{
  const deps = async lib => (await mesDeps()).filter(d=>d.libelle===lib);
  const texte = () => page.evaluate(()=>document.getElementById('view').innerText);

  console.log('\n— Formulaire : case « Charge » et périodicité');
  await ouvrir('2026-10-15', '#dashboard/2026-10');
  const resteAvant = (await dash()).reste;
  await page.click('[data-action="add-depense"]');
  ok(await page.isHidden('#f_chgPeriode'), 'périodicité masquée tant que « Charge » n’est pas coché');
  await page.fill('#f_date', '2026-10-05');
  await page.fill('#f_libelle', 'Loyer');
  await page.fill('#f_montant', '800');
  await page.check('#f_charge');
  ok(await page.isVisible('#f_chgPeriode'), 'périodicité demandée une fois la case cochée');
  ok(await page.isHidden('#f_abonnement') && await page.isHidden('#f_plusieursFois'), 'les cases Abonnement et En plusieurs fois disparaissent (un seul mode à la fois)');
  await soumettre();
  let loyerId;
  {
    const l = await deps('Loyer');
    const v = l.find(d=>!d.prevu), p = l.find(d=>d.prevu);
    loyerId = v?.chgId;
    ok(v && v.chgId && v.chgPeriode===1 && !v.aboId && !v.ppfId, `loyer enregistré comme charge mensuelle (${JSON.stringify(v)})`);
    ok(p && p.chgId===loyerId && p.date==='2026-11-05' && p.montant===800, `échéance suivante prévue le 5 novembre (${JSON.stringify(p)})`);
    ok(Math.abs((await dash()).reste - (resteAvant - 800)) < 0.005, 'octobre : seule l’échéance validée compte');
  }
  await page.click('[data-action="add-depense"]');
  await page.fill('#f_date', '2026-10-12');
  await page.fill('#f_libelle', 'Assurance habitation');
  await page.fill('#f_montant', '240');
  await page.check('#f_charge');
  ok(await page.isVisible('#f_chgSerie'), 'une charge existe : on peut choisir à laquelle rattacher la dépense');
  await page.selectOption('#f_chgPeriode', '12');
  await soumettre();
  {
    const a = await deps('Assurance habitation');
    ok(a.some(d=>!d.prevu && d.chgPeriode===12) && a.some(d=>d.prevu && d.date==='2027-10-12' && d.chgPeriode===12), `assurance annuelle : prochaine échéance dans un an (${JSON.stringify(a.map(d=>[d.date,!!d.prevu]))})`);
  }

  console.log('\n— La prévision ne compte pas');
  await aller('#dashboard/2026-11');
  {
    const d = await dash();
    ok(d.postes.length===0, `novembre : rien dans les graphiques (${JSON.stringify(d.postes)})`);
    const notes = await page.$$eval('.hero-note', n=>n.map(x=>x.innerText).join(' | '));
    ok(/1 charge prévue/.test(notes), `novembre : la charge prévue est signalée à part (« ${notes} »)`);
  }
  await aller('#depenses/2026-11');
  {
    const txt = await texte();
    ok(/Charges prévues/.test(txt) && /Loyer/.test(txt), 'onglet Dépenses : carte « Charges prévues »');
    const total = await page.evaluate(()=>num(document.querySelector('[data-tween="dep:total"]').dataset.v));
    ok(total===0, `onglet Dépenses : total de novembre hors prévision (${total})`);
  }

  console.log('\n— Onglet Échéancier');
  await ouvrir('2026-11-03', '#echeancier');
  {
    const sec = await page.$eval('#ech-chg', h=>h.closest('section').innerText);
    ok(/Loyer/.test(sec) && /Assurance habitation/.test(sec) && /Annuelle/.test(sec) && /par an/.test(sec), `charges listées avec leur périodicité (${sec.replace(/\n/g,' / ')})`);
    ok(/820,00\s*€\s*par mois/.test(sec), 'coût ramené au mois : 800 € + 240 € / 12');
    const finding = await page.$eval('.finding', f=>f.innerText);
    ok(/2 charges/.test(finding), `phrase d’en-tête (« ${finding} »)`);
    await shot('echeancier-charges');
  }

  console.log('\n— Validation, nouveau montant');
  await page.click(`[data-chg="${loyerId}"] [data-action="chg-valider"]`);
  await page.fill('#f_montant', '820');
  await soumettre();
  {
    const l = await deps('Loyer');
    ok(l.filter(d=>!d.prevu).length===2 && l.some(d=>d.prevu && d.date==='2026-12-05' && d.montant===820), `novembre validé à 820 €, décembre prévu à 820 € (${JSON.stringify(l.map(d=>[d.date,d.montant,!!d.prevu]))})`);
  }
  await page.click(`[data-chg="${loyerId}"] [data-action="chg-montant"]`);
  await page.fill('#f_montant', '830');
  await soumettre();
  ok((await deps('Loyer')).some(d=>d.prevu && d.montant===830), 'nouveau montant pris par l’échéance prévue');

  console.log('\n— Non validée : reportée, jamais retirée');
  await ouvrir('2027-01-03', '#echeancier');
  {
    const l = await deps('Loyer');
    const p = l.filter(d=>d.prevu);
    ok(p.length===1 && p[0].date==='2027-01-05' && p[0].montant===830, `décembre non validé : l’échéance passe en janvier (${JSON.stringify(p)})`);
    ok(l.filter(d=>!d.prevu).length===2, 'aucune échéance n’est validée d’office');
    const al = (await store()).abonnementsAlertes.filter(a=>a.type==='chg-retard');
    ok(al.length===1 && al[0].mois==='2026-12', `retard signalé dans les notifications (${JSON.stringify(al)})`);
  }

  console.log('\n— Import : nouvelle charge bimestrielle, puis échéance attendue');
  await aller('#releve');
  await page.setInputFiles('#releve-file', {name:'releve-janvier.csv', mimeType:'text/csv', buffer:Buffer.from(['Date;Libellé;Montant', '15/01/2027;PRLV SEPA EDF CLIENTS;-64,00', '05/01/2027;VIR LOYER;-830,00'].join('\n'))});
  await page.waitForSelector('.rl-row');
  await page.waitForTimeout(250);
  const ligne = async re => (await page.$$eval('.rl-row', rs=>rs.map(r=>({id:r.dataset.rlRow, brut:r.querySelector('.rl-brut').innerText, lib:r.querySelector('[data-rl-champ="libelle"]').value, chg:r.querySelector('.rl-chg')?.getAttribute('aria-pressed'), type:r.querySelector('[data-rl-champ="type"]')?.value, raison:r.querySelector('.rl-raison')?.innerText||''})))).find(l=>re.test(l.brut));
  {
    const loy = await ligne(/LOYER/);
    ok(loy && loy.lib==='Loyer' && loy.chg==='true' && /Charge attendue : Loyer/.test(loy.raison), `ligne du loyer reconnue comme l’échéance attendue (${JSON.stringify(loy)})`);
    const edf = await ligne(/EDF/);
    ok(edf && edf.chg==='false', 'ligne EDF : pas une charge par défaut');
    const row = `.rl-row[data-rl-row="${edf.id}"]`;
    await page.click(`${row} [data-action="releve-chg"]`);
    await page.waitForTimeout(250);
    ok(!!(await page.$(`${row} .rl-chgPeriode`)) && !!(await page.$(`${row} .rl-chgSerie`)), 'charge cochée : choix de la charge et de la périodicité');
    await page.click(`${row} .rl-chgPeriode [data-cat-toggle]`);
    await page.click(`${row} .rl-chgPeriode [data-rl-pick="2"]`);
    await page.waitForTimeout(150);
    await shot('import-charge');
    await page.click('[data-action="releve-valider-tout"]');
    await page.waitForTimeout(500);
    const l = await deps('Loyer');
    ok(l.filter(d=>!d.prevu).length===3 && l.some(d=>!d.prevu && d.date==='2027-01-05' && d.source==='releve') && l.some(d=>d.prevu && d.date==='2027-02-05'), `loyer : janvier validé par l’import, février prévu (${JSON.stringify(l.map(d=>[d.date,!!d.prevu]))})`);
    const e = (await mesDeps()).filter(d=>/edf/i.test(d.libelle));
    ok(e.some(d=>!d.prevu && d.chgPeriode===2 && d.source==='releve') && e.some(d=>d.prevu && d.date==='2027-03-15' && d.montant===64), `EDF : charge bimestrielle créée à l’import, mars prévu (${JSON.stringify(e.map(d=>[d.date,d.montant,d.chgPeriode,!!d.prevu]))})`);
  }
  await ouvrir('2027-03-20', '#releve');
  if(await page.$('[data-action="releve-fermer"]')){ await page.click('[data-action="releve-fermer"]'); await page.waitForTimeout(250); if(await page.$('#del-yes')) await page.click('#del-yes'); await page.waitForTimeout(250); }
  await page.setInputFiles('#releve-file', {name:'releve-mars.csv', mimeType:'text/csv', buffer:Buffer.from(['Date;Libellé;Montant', '16/03/2027;PRLV SEPA EDF CLIENTS;-71,50'].join('\n'))});
  await page.waitForSelector('.rl-row');
  await page.waitForTimeout(250);
  {
    const edf = await ligne(/EDF/);
    ok(edf && edf.chg==='true' && /Charge attendue/.test(edf.raison) && /nouveau montant/.test(edf.raison), `EDF : échéance attendue reconnue, nouveau montant noté (${JSON.stringify(edf)})`);
    await page.click(`.rl-row[data-rl-row="${edf.id}"] [data-action="releve-valider"]`);
    await page.waitForTimeout(400);
    const e = (await mesDeps()).filter(d=>/edf/i.test(d.libelle));
    ok(e.filter(d=>!d.prevu).length===2 && e.some(d=>d.prevu && d.date==='2027-05-16' && d.montant===71.5) && e.length===3, `EDF : mars validé, mai prévu au nouveau montant (${JSON.stringify(e.map(d=>[d.date,d.montant,!!d.prevu]))})`);
  }

  console.log('\n— Modifier la périodicité, ne plus être une charge');
  await aller('#depenses/2027-03');
  {
    const id = (await mesDeps()).find(d=>/edf/i.test(d.libelle) && !d.prevu && d.date==='2027-03-16').id;
    await page.click(`[data-action="edit-depense"][data-id="${id}"]`);
    ok(await page.isChecked('#f_charge') && await page.$eval('#f_chgPeriode', s=>s.value)==='2', 'la modale reprend la charge et sa périodicité');
    await page.selectOption('#f_chgPeriode', '3');
    await soumettre();
    const e = (await mesDeps()).filter(d=>/edf/i.test(d.libelle));
    ok(e.every(d=>d.chgPeriode===3) && e.some(d=>d.prevu && d.date==='2027-06-16'), `trimestrielle : échéance recalée en juin (${JSON.stringify(e.map(d=>[d.date,d.chgPeriode,!!d.prevu]))})`);
    await page.click(`[data-action="edit-depense"][data-id="${id}"]`);
    await page.uncheck('#f_charge');
    await soumettre();
    const e2 = (await mesDeps()).filter(d=>/edf/i.test(d.libelle));
    ok(!e2.some(d=>d.prevu) && e2.length===2, 'case décochée : plus d’échéance prévue, les paiements restent');
  }

  console.log('\n— Arrêter une charge');
  await aller('#echeancier');
  await page.click(`[data-chg="${loyerId}"] [data-action="chg-arreter"]`);
  await page.click('#del-yes');
  await page.waitForTimeout(300);
  {
    const l = await deps('Loyer');
    ok(!l.some(d=>d.prevu) && l.length===3, `loyer arrêté : plus rien de prévu, les validées restent (${l.length})`);
    ok(/Assurance habitation/.test(await page.$eval('#ech-chg', h=>h.closest('section').innerText)), 'l’autre charge reste en cours');
  }

  console.log('\n— 390 px');
  await page.setViewportSize({width:390, height:844});
  await aller('#echeancier');
  {
    const over = await page.evaluate(()=>document.documentElement.scrollWidth - window.innerWidth);
    ok(over<=1, `pas de défilement horizontal (${over})`);
    await shot('echeancier-charges-390');
  }

  ok(errors.length===0, `erreurs console\n    ${errors.join('\n    ')}`);
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} vérifications réussies, ${failures} en échec.`);
process.exit(failures ? 1 : 0);
