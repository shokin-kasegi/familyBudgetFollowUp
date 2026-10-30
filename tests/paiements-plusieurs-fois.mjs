/* Tests des paiements en plusieurs fois — Playwright (Chromium), sans dépendance à installer.
   Usage : node tests/paiements-plusieurs-fois.mjs [--shots dossier]
   - le formulaire demande le montant total dès que « en plusieurs fois » est coché ;
   - la mensualité suivante est prévue au montant de la dernière validée, sans
     compter tant qu'elle n'est pas validée (à la main ou par l'import) ;
   - un dépassement du total bloque la validation et demande de vérifier ;
   - le paiement se clôture quand le total est atteint ;
   - une mensualité non validée n'est jamais validée d'office : elle est reportée ;
   - onglet Échéancier : abonnements et paiements en plusieurs fois ;
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
  const ppfDeps = async lib => (await mesDeps()).filter(d=>d.libelle===lib);
  const texte = () => page.evaluate(()=>document.getElementById('view').innerText);

  console.log('\n— Formulaire : montant total demandé');
  await ouvrir('2026-10-15', '#depenses/2026-10');
  await aller('#dashboard/2026-10');
  const resteAvant = (await dash()).reste;
  await page.click('[data-action="add-depense"]');
  ok(await page.isHidden('#f_montantTotal'), 'montant total masqué tant que « en plusieurs fois » n’est pas coché');
  await page.fill('#f_date', '2026-10-10');
  await page.fill('#f_libelle', 'Canapé');
  await page.fill('#f_montant', '300');
  await page.check('#f_plusieursFois');
  ok(await page.isVisible('#f_montantTotal'), 'montant total demandé une fois la case cochée');
  ok(await page.isHidden('#f_abonnement'), 'la case Abonnement disparaît (un seul mode à la fois)');
  await page.click('#modal-form button[type=submit]');
  await page.waitForTimeout(300);
  ok(await page.isVisible('#modal-form') && (await ppfDeps('Canapé')).length===0, 'sans montant total, rien n’est enregistré');
  await page.fill('#f_montantTotal', '250');
  await page.click('#modal-form button[type=submit]');
  await page.waitForTimeout(300);
  ok(await page.isVisible('#modal-form') && /dépasse le montant total/.test(await page.evaluate(()=>document.getElementById('modal-form').innerText)), 'mensualité plus grande que le total : vérification demandée');
  await page.fill('#f_montantTotal', '1000');
  await page.click('#modal-form button[type=submit]');
  await page.waitForTimeout(400);
  let ppfId;
  {
    const deps = await ppfDeps('Canapé');
    const v = deps.find(d=>!d.prevu), p = deps.find(d=>d.prevu);
    ppfId = v?.ppfId;
    ok(v && v.ppfId && v.ppfTotal===1000 && !v.aboId, `première mensualité enregistrée avec le total (${JSON.stringify(v)})`);
    ok(p && p.ppfId===ppfId && p.date==='2026-11-10' && p.montant===300, `mensualité suivante prévue le 10 novembre, même montant (${JSON.stringify(p)})`);
    ok(Math.abs((await dash()).reste - (resteAvant - 300)) < 0.005, 'octobre : seule la mensualité validée compte');
  }

  console.log('\n— La prévision ne compte pas');
  await aller('#dashboard/2026-11');
  {
    const d = await dash();
    ok(d.postes.length===0, `novembre : rien dans les graphiques (${JSON.stringify(d.postes)})`);
    const notes = await page.$$eval('.hero-note', n=>n.map(x=>x.innerText).join(' | '));
    ok(/1 mensualité prévue/.test(notes), `novembre : la mensualité prévue est signalée à part (« ${notes} »)`);
  }
  await aller('#depenses/2026-11');
  {
    const txt = await texte();
    ok(/Mensualités prévues/.test(txt) && /Canapé/.test(txt), 'onglet Dépenses : carte « Mensualités prévues »');
    const total = await page.evaluate(()=>num(document.querySelector('[data-tween="dep:total"]').dataset.v));
    ok(total===0, `onglet Dépenses : total de novembre hors prévision (${total})`);
  }

  console.log('\n— Onglet Échéancier');
  await ouvrir('2026-11-05', '#echeancier');
  {
    const nav = await page.$$eval('#sidebar .nav-item', b=>b.map(x=>x.innerText.trim()));
    ok(nav.includes('Échéancier'), `onglet Échéancier dans la navigation (${nav})`);
    const txt = await texte();
    ok(/Paiements en plusieurs fois/.test(txt) && /Abonnements/.test(txt), 'abonnements et paiements en plusieurs fois réunis');
    const row = await page.$eval(`.ppf-row[data-ppf="${ppfId}"]`, r=>r.innerText);
    ok(/1 mensualité/.test(row) && /reste\s*700,00/.test(row) && /300,00/.test(row), `Canapé : avancement, reste et prochaine mensualité (${row.replace(/\n/g,' / ')})`);
    await shot('echeancier');
  }

  console.log('\n— Validation à la main : montant différent, dépassement');
  await page.click(`.ppf-row[data-ppf="${ppfId}"] [data-action="ppf-valider"]`);
  await page.fill('#f_montant', '800');
  await page.click('#modal-form button[type=submit]');
  await page.waitForTimeout(300);
  ok(await page.isVisible('#modal-form') && /vérifie les montants/.test(await page.evaluate(()=>document.getElementById('modal-form').innerText)), 'dépassement du total : vérification demandée');
  ok((await ppfDeps('Canapé')).filter(d=>!d.prevu).length===1, 'rien n’est validé tant que les montants ne sont pas vérifiés');
  await page.fill('#f_montant', '350');
  await page.fill('#f_date', '2026-11-10');
  await page.click('#modal-form button[type=submit]');
  await page.waitForTimeout(400);
  {
    const deps = await ppfDeps('Canapé');
    ok(deps.filter(d=>!d.prevu).length===2, 'deuxième mensualité validée');
    const p = deps.find(d=>d.prevu);
    ok(p && p.date==='2026-12-10' && p.montant===350, `la suivante reprend le montant de la dernière validée : 350 € (${JSON.stringify(p)})`);
  }

  console.log('\n— Abonnement visible dans l’échéancier');
  await page.click('[data-action="add-depense"]');
  await page.fill('#f_date', '2026-11-03');
  await page.fill('#f_libelle', 'Spotify');
  await page.fill('#f_montant', '10.99');
  await page.check('#f_abonnement');
  ok(await page.isHidden('#f_plusieursFois'), 'abonnement coché : la case « en plusieurs fois » disparaît');
  await page.click('#modal-form button[type=submit]');
  await page.waitForTimeout(400);
  ok(/Spotify/.test(await page.$eval('#ech-abo', h=>h.closest('section').innerText)), 'l’abonnement apparaît dans l’échéancier');

  console.log('\n— Import : mensualité attendue, dépassement, nouveau paiement');
  await ouvrir('2026-12-12', '#releve');
  const CSV = ['Date;Libellé;Montant',
    '10/12/2026;PRLV SEPA CANAPE;-400,00',
    '11/12/2026;CB FNAC PARIS;-100,00'].join('\n');
  await page.setInputFiles('#releve-file', {name:'releve.csv', mimeType:'text/csv', buffer:Buffer.from(CSV)});
  await page.waitForSelector('.rl-row');
  await page.waitForTimeout(250);
  const ligne = async re => (await page.$$eval('.rl-row', rs=>rs.map(r=>({id:r.dataset.rlRow, brut:r.querySelector('.rl-brut').innerText, lib:r.querySelector('[data-rl-champ="libelle"]').value, ppf:r.querySelector('.rl-ppf')?.getAttribute('aria-pressed'), total:r.querySelector('[data-rl-champ="ppfTotal"]')?.value, raison:r.querySelector('.rl-raison')?.innerText||'', pill:r.querySelector('.rl-meta .pill').innerText})))).find(l=>re.test(l.brut));
  {
    const can = await ligne(/CANAPE/);
    ok(can && can.lib==='Canapé' && can.ppf==='true' && can.total==='1000,00', `ligne Canapé reconnue comme mensualité attendue (${JSON.stringify(can)})`);
    ok(/dépasse le total/.test(can.raison) && can.pill!=='Reconnue', 'dépassement signalé, la ligne n’est pas marquée sûre');
    await page.click(`.rl-row[data-rl-row="${can.id}"] [data-action="releve-valider"]`);
    await page.waitForTimeout(350);
    const apres = await ligne(/CANAPE/);
    ok(apres && /vérifie les montants/.test(apres.raison), `validation refusée, vérification demandée (${apres?.raison})`);
    ok((await ppfDeps('Canapé')).filter(d=>!d.prevu).length===2, 'rien n’est validé tant que le montant dépasse');
    await page.fill(`.rl-row[data-rl-row="${can.id}"] [data-rl-champ="montant"]`, '350');
    await page.press(`.rl-row[data-rl-row="${can.id}"] [data-rl-champ="montant"]`, 'Tab');
    await page.click(`.rl-row[data-rl-row="${can.id}"] [data-action="releve-valider"]`);
    await page.waitForTimeout(400);
    const deps = await ppfDeps('Canapé');
    ok(deps.filter(d=>!d.prevu).length===3 && !deps.some(d=>d.prevu), `total atteint : paiement clôturé, plus rien de prévu (${deps.length})`);
    const alertes = (await store()).abonnementsAlertes.filter(a=>a.type==='ppf-termine');
    ok(alertes.length===1, 'clôture signalée dans les notifications');

    const fnac = await ligne(/FNAC/);
    ok(fnac && fnac.ppf==='false', 'ligne Fnac : pas en plusieurs fois par défaut');
    await page.click(`.rl-row[data-rl-row="${fnac.id}"] [data-action="releve-ppf"]`);
    await page.waitForTimeout(250);
    ok(await page.evaluate(id=>document.activeElement?.dataset.rlChamp==='ppfTotal' && document.activeElement.dataset.rlId===id, fnac.id), 'en plusieurs fois : le champ du montant total prend le focus');
    await page.click(`.rl-row[data-rl-row="${fnac.id}"] [data-action="releve-valider"]`);
    await page.waitForTimeout(300);
    ok(/montant total/.test((await ligne(/FNAC/)).raison) && (await mesDeps()).every(d=>!/fnac/i.test(d.libelle)), 'sans montant total, la ligne reste à compléter');
    await shot('import-ppf');
    await page.fill(`.rl-row[data-rl-row="${fnac.id}"] [data-rl-champ="ppfTotal"]`, '400');
    await page.press(`.rl-row[data-rl-row="${fnac.id}"] [data-rl-champ="ppfTotal"]`, 'Enter');
    await page.waitForTimeout(400);
    const f = (await mesDeps()).filter(d=>/fnac/i.test(d.libelle));
    ok(f.length===2 && f.some(d=>!d.prevu && d.ppfTotal===400 && d.source==='releve') && f.some(d=>d.prevu && d.date==='2027-01-11' && d.montant===100), `Fnac : paiement créé à l’import, mensualité prévue le 11 janvier (${JSON.stringify(f)})`);
  }

  console.log('\n— Jamais validée d’office');
  await ouvrir('2027-02-02', '#echeancier');
  {
    const f = (await mesDeps()).filter(d=>/fnac/i.test(d.libelle));
    ok(f.filter(d=>!d.prevu).length===1, 'la mensualité de janvier n’a pas été validée toute seule');
    const p = f.find(d=>d.prevu);
    ok(p && p.date==='2027-02-11', `elle est reportée au mois courant, pas retirée (${JSON.stringify(p)})`);
    ok((await store()).abonnementsAlertes.some(a=>a.type==='ppf-retard'), 'retard signalé dans les notifications');
    const txt = await texte();
    ok(/Terminés/.test(txt) && /Canapé/.test(txt), 'le Canapé apparaît dans « Terminés »');
  }
  await ouvrir('2027-02-02', '#echeancier');
  ok((await store()).abonnementsAlertes.filter(a=>a.type==='ppf-retard').length===1, 'un rechargement ne duplique pas l’alerte');

  console.log('\n— Modifier une mensualité validée');
  {
    const v = (await mesDeps()).find(d=>/fnac/i.test(d.libelle) && !d.prevu);
    await aller('#depenses/2026-12');
    await page.click(`[data-action="edit-depense"][data-id="${v.id}"]`);
    ok(await page.isChecked('#f_plusieursFois') && Number(await page.inputValue('#f_montantTotal'))===400, 'modification : case cochée et total repris');
    await page.fill('#f_montant', '500');
    await page.click('#modal-form button[type=submit]');
    await page.waitForTimeout(300);
    ok(await page.isVisible('#modal-form'), 'mensualité au-delà du total : vérification demandée');
    await page.fill('#f_montant', '150');
    await page.click('#modal-form button[type=submit]');
    await page.waitForTimeout(400);
    const p = (await mesDeps()).find(d=>/fnac/i.test(d.libelle) && d.prevu);
    ok(p && p.montant===150, `la mensualité prévue suit la dernière validée (${p?.montant})`);
  }

  console.log('\n— Arrêter');
  await aller('#echeancier');
  {
    const f = (await mesDeps()).find(d=>/fnac/i.test(d.libelle) && !d.prevu);
    await page.click(`.ppf-row[data-ppf="${f.ppfId}"] [data-action="ppf-arreter"]`);
    await page.click('#del-yes');
    await page.waitForTimeout(400);
    ok(!(await mesDeps()).some(d=>/fnac/i.test(d.libelle) && d.prevu), 'arrêté : plus de mensualité prévue');
    await ouvrir('2027-02-03', '#echeancier');
    ok(!(await mesDeps()).some(d=>/fnac/i.test(d.libelle) && d.prevu), 'et aucune n’est réannoncée au rechargement');
  }

  console.log('\n— 390 px');
  await page.setViewportSize({width:390, height:844});
  await aller('#echeancier');
  {
    const over = await page.evaluate(()=>document.documentElement.scrollWidth - window.innerWidth);
    ok(over<=1, `pas de défilement horizontal (${over})`);
    await shot('echeancier-390');
  }

  ok(errors.length===0, `erreurs console\n    ${errors.join('\n    ')}`);
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} vérifications réussies, ${failures} en échec.`);
process.exit(failures ? 1 : 0);
