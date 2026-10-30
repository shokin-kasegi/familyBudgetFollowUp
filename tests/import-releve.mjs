/* Tests de l'import de relevé — Playwright (Chromium), sans dépendance à installer.
   Usage : node tests/import-releve.mjs [--shots dossier]
   - lecture des valeurs (montants, dates, clés de commerçant) et des formats
     CSV (avec lignes d'en-tête de banque), OFX, QIF et texte collé à colonnes ;
   - parcours complet : import d'un CSV, doublon reconnu, correction d'une
     catégorie, validation, puis deuxième et troisième relevés où Solde
     reconnaît le format et les commerçants appris ;
   - pas de défilement horizontal à 390 px, pas d'erreur console. */
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
  amt: r.querySelector('.rl-amt').innerText,
})));

// Relevés de test : préambule de banque, Latin-1, Débit / Crédit séparés.
const CSV1 = [
  'Relevé de compte;;;;',
  'Compte courant n° 12345678901;;;;',
  'Solde au 30/09/2026;1 520,40;;;',
  ';;;;',
  'Date;Libellé;Débit euros;Crédit euros;',
  '02/09/2026;"CB CARREFOUR MARKET 01/09";54,20;;',
  '03/09/2026;"PRLV SEPA EDF SA ECH/030926";89,00;;',
  '05/09/2026;"VIR SEPA RECU /DE ACME SARL /MOTIF SALAIRE";;2 300,00;',
  '07/09/2026;"CB CARREFOUR 06/09";286,40;;',
  '10/09/2026;"CB BOULANGERIE DUPONT 09/09";4,30;;',
  '12/09/2026;"CB SNCF INTERNET 11/09";86,00;;',
  '15/09/2026;"RETRAIT DAB 14/09 PARIS";40,00;;',
].join('\r\n');
const CSV2 = [
  'Relevé de compte;;;;',
  'Compte courant n° 12345678901;;;;',
  ';;;;',
  'Date;Libellé;Débit euros;Crédit euros;',
  '01/10/2026;"CB CARREFOUR MARKET 30/09";61,75;;',
  '04/10/2026;"CB BOULANGERIE DUPONT 03/10";3,90;;',
  '08/10/2026;"CB CARREFOUR CITY 07/10";12,10;;',
  '16/10/2026;"RETRAIT DAB 15/10 LYON";60,00;;',
  '20/10/2026;"CB SNCF INTERNET 19/10";42,00;;',
].join('\r\n');
const CSV3 = [
  'Date;Libellé;Débit euros;Crédit euros;',
  '02/11/2026;"CB CARREFOUR MARKET 01/11";48,00;;',
  '05/11/2026;"CB BOULANGERIE DUPONT 04/11";5,10;;',
  '09/11/2026;"CB LIBRAIRIE GIBERT 08/11";23,00;;',
].join('\r\n');

const browser = await chromium.launch();
try{
  console.log('\n— Lecture des valeurs et des formats');
  {
    const {ctx, page, errors} = await openApp(browser, {width:1440, height:900});
    const r = await page.evaluate(()=>({
      montants: ['1 234,56','-12,30','12.30-','(45,00)','1,234.56','45,00 €','+8,00','abc','12/10/2026'].map(releveMontant),
      dates: [releveDate('12/10/2026','dmy'), releveDate('2026-10-12','dmy'), releveDate('10/12/26','mdy'), releveDate('12.50','dmy'), releveDate('12/10','dmy',2026), releveDate('3 oct. 2026','dmy')],
      cles: [releveCle('CB CARREFOUR MARKET 01/09'), releveCle('CARTE X1234 12/09 CARREFOUR MARKET'), releveCle('PRLV SEPA EDF SA ECH/030926'), releveCle('RETRAIT DAB 14/09 PARIS')],
      ofx: releveOfx('<OFX><STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261003120000<TRNAMT>-23.40<NAME>LECLERC<MEMO>CB 02/10</STMTTRN><STMTTRN><DTPOSTED>20261005<TRNAMT>150.00<NAME>VIR M DUPONT &amp; FILS</STMTTRN></OFX>'),
      qif: releveQif('!Type:Bank\nD13/10/2026\nT-9.99\nPNETFLIX\n^\nD14/10/2026\nT1,200.00\nPEMPLOYEUR\n^\n'),
      texte: releveAnalyserTexte([
        'Date      Libellé                         Débit       Crédit',
        '03/10     CB CARREFOUR 02/10              45,30',
        '05/10     VIR RECU EMPLOYEUR                          2 100,00',
        '08/10     PRLV FREE MOBILE                19,99',
        '          REF 123456',
        '          SOLDE AU 31/10/2026                         1 500,00',
      ].join('\n'), releveModele(false)).ops,
    }));
    ok(JSON.stringify(r.montants.slice(0,7))===JSON.stringify([1234.56,-12.3,-12.3,-45,1234.56,45,8]) && isNaN(r.montants[7]) && isNaN(r.montants[8]), `montants : ${JSON.stringify(r.montants)}`);
    ok(JSON.stringify(r.dates)===JSON.stringify(['2026-10-12','2026-10-12','2026-10-12',null,'2026-10-12','2026-10-03']), `dates : ${JSON.stringify(r.dates)}`);
    ok(r.cles[0]==='CARREFOUR MARKET' && r.cles[1]==='CARREFOUR MARKET' && r.cles[2]==='EDF' && r.cles[3]==='RETRAIT DAB', `clés de commerçant : ${JSON.stringify(r.cles)}`);
    ok(r.ofx.length===2 && r.ofx[0].date==='2026-10-03' && r.ofx[0].montant===-23.4 && r.ofx[1].libelle==='VIR M DUPONT & FILS' && r.ofx[1].montant===150, `OFX : ${JSON.stringify(r.ofx)}`);
    ok(r.qif.length===2 && r.qif[0].date==='2026-10-13' && r.qif[0].montant===-9.99 && r.qif[1].montant===1200 && r.qif[1].libelle==='EMPLOYEUR', `QIF : ${JSON.stringify(r.qif)}`);
    const t = r.texte;
    ok(t.length===3 && t[0].montant===-45.3 && t[1].montant===2100 && t[2].montant===-19.99 && t[0].date==='2026-10-03' && /FREE MOBILE REF 123456/.test(t[2].libelle) && t[0].libelle==='CB CARREFOUR 02/10',
      `texte collé (colonnes Débit / Crédit, année du solde, libellé sur deux lignes) : ${JSON.stringify(t)}`);
    ok(errors.length===0, `erreurs console : ${errors.join(' | ')}`);
    await ctx.close();
  }

  console.log('\n— Parcours : trois relevés successifs');
  {
    const {ctx, page, errors} = await openApp(browser, {width:1440, height:900});
    ok(await page.isVisible('.rl-drop'), 'zone de dépôt visible');
    await importer(page, 'releve-septembre.csv', CSV1, 'latin1');
    let L = await lignes(page);
    ok(L.length===7, `relevé 1 : 7 opérations attendues, ${L.length} trouvées`);
    const byLib = s => L.find(l=>l.lib.toLowerCase().includes(s));
    ok(byLib('carrefour market')?.type==='depense' && /54,20/.test(byLib('carrefour market').amt), `relevé 1 : Carrefour Market en dépense de 54,20 € (${JSON.stringify(byLib('carrefour market'))})`);
    ok(L.some(l=>l.type==='revenu' && /2\s300,00/.test(l.amt)), 'relevé 1 : le salaire est une rentrée de 2 300,00 €');
    const doublon = L.find(l=>/286,40/.test(l.amt));
    ok(doublon && doublon.type==='ignorer' && /Déjà saisie/.test(doublon.raison), `relevé 1 : courses du 07/09 (déjà saisies) reconnues comme doublon (${JSON.stringify(doublon)})`);
    ok(await page.evaluate(()=>!!document.querySelector('.rl-cols:not([open])')===false), 'relevé 1 : nouveau format — le choix des colonnes est ouvert');
    // L'utilisateur corrige quelques lignes avant de tout valider.
    // Catégorie : même menu que dans les formulaires (bouton, liste, « Autre… »).
    const choisirCat = async (id, value) => {
      await page.click(`.rl-row[data-rl-row="${id}"] .rl-cat [data-cat-toggle]`);
      await page.click(`.rl-row[data-rl-row="${id}"] .cat-select.open [data-cat-select="${value}"]`);
      await page.waitForTimeout(120);
    };
    const setRow = async (needle, champ, value) => {
      const id = (await lignes(page)).find(l=>l.lib.toLowerCase().includes(needle)).id;
      await choisirCat(id, value);
    };
    await setRow('carrefour market', 'categorie', 'Alimentation');
    await setRow('boulangerie', 'categorie', 'Alimentation');
    await setRow('sncf', 'categorie', 'Transport');
    await setRow('edf', 'categorie', 'Maison');
    const salaireId = (await lignes(page)).find(l=>l.type==='revenu').id;
    await page.fill(`[data-rl-id="${salaireId}"][data-rl-champ="libelle"]`, 'Salaire Acme');
    await choisirCat(salaireId, 'Salaire');
    // La liste se modifie depuis la ligne : ajout d'une catégorie (« Autre… »), choisie aussitôt…
    const edfId = (await lignes(page)).find(l=>l.lib.toLowerCase().includes('edf')).id;
    await page.click(`.rl-row[data-rl-row="${edfId}"] .rl-cat [data-cat-toggle]`);
    await page.click(`.rl-row[data-rl-row="${edfId}"] [data-cat-add-toggle]`);
    await page.fill(`.rl-row[data-rl-row="${edfId}"] .cat-add-input`, 'Énergie');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(250);
    ok((await lignes(page)).find(l=>l.id===edfId)?.cat==='Énergie', 'relevé 1 : catégorie ajoutée depuis la ligne et choisie');
    ok(await page.evaluate(()=>myCategories('depenses').some(c=>c.nom==='Énergie')), 'relevé 1 : la catégorie ajoutée rejoint la liste des dépenses');
    // … puis suppression (croix) : la ligne repasse sans catégorie, le menu reste ouvert.
    const idEnergie = await page.evaluate(()=>myCategories('depenses').find(c=>c.nom==='Énergie').id);
    await page.click(`.rl-row[data-rl-row="${edfId}"] .rl-cat [data-cat-toggle]`);
    await page.click(`.rl-row[data-rl-row="${edfId}"] [data-cat-delete="${idEnergie}"]`);
    await page.waitForTimeout(250);
    ok(await page.evaluate(()=>!myCategories('depenses').some(c=>c.nom==='Énergie')), 'relevé 1 : catégorie supprimée depuis la ligne');
    ok((await lignes(page)).find(l=>l.id===edfId)?.cat==='', 'relevé 1 : la ligne repasse sans catégorie');
    ok(await page.evaluate(id=>!!document.querySelector(`.rl-row[data-rl-row="${id}"] .cat-select.open`), edfId), 'relevé 1 : le menu reste ouvert après suppression');
    await page.keyboard.press('Escape');
    await choisirCat(edfId, 'Maison');
    // Type, compte et paiement : même liste déroulante que la catégorie.
    const choisir = async (id, champ, value) => {
      await page.click(`.rl-row[data-rl-row="${id}"] .rl-${champ} [data-cat-toggle]`);
      await page.click(`.rl-row[data-rl-row="${id}"] .rl-${champ} .cat-select.open [data-rl-pick="${value}"]`);
      await page.waitForTimeout(150);
    };
    const boulId = (await lignes(page)).find(l=>l.lib.toLowerCase().includes('boulangerie')).id;
    ok(await page.evaluate(()=>!document.querySelector('.rl-row select')), 'relevé 1 : plus de liste native dans les lignes');
    await choisir(boulId, 'type', 'revenu');
    ok((await lignes(page)).find(l=>l.id===boulId)?.type==='revenu' && !(await page.$(`.rl-row[data-rl-row="${boulId}"] .rl-paie`)), 'relevé 1 : type changé depuis le menu (rentrée, sans paiement)');
    await choisir(boulId, 'type', 'depense');
    await choisirCat(boulId, 'Alimentation');
    // SNCF : compte joint, en 3 fois, avec un commentaire.
    const sncfId = (await lignes(page)).find(l=>l.lib.toLowerCase().includes('sncf')).id;
    await choisir(sncfId, 'compte', 'Compte Joint');
    await choisir(sncfId, 'paiement', 'Echelonne');
    await page.fill(`[data-rl-id="${sncfId}"][data-rl-champ="nbMensualites"]`, '3');
    await page.fill(`[data-rl-id="${sncfId}"][data-rl-champ="notes"]`, 'Billets pour Lyon');
    await page.click(`.rl-row[data-rl-row="${sncfId}"] .rl-date`);
    ok(/au total/.test(await page.innerText(`.rl-row[data-rl-row="${sncfId}"] .rl-nb-total`)), 'relevé 1 : total des mensualités affiché');
    // Le retrait : ne pas importer (bouton ×).
    const retraitId = (await lignes(page)).find(l=>l.lib.toLowerCase().includes('retrait')).id;
    await page.click(`[data-action="releve-ignorer"][data-id="${retraitId}"]`);
    await page.waitForTimeout(250);
    ok((await lignes(page)).length===6, 'relevé 1 : la ligne ignorée disparaît de la liste');
    await page.click('[data-action="releve-valider-tout"]');
    await page.waitForTimeout(400);
    const after1 = await page.evaluate(()=>{
      const me = currentUser().id;
      const deps = state.depenses.filter(d=>d.ownerId===me && d.source==='releve');
      const revs = state.revenusExceptionnels.filter(r=>r.ownerId===me && r.source==='releve');
      const m = state.importApprentissage.find(x=>x.ownerId===me);
      const sncf = deps.find(d=>/sncf/i.test(d.libelle));
      return {sncf, deps: deps.map(d=>[d.libelle,d.categorie,d.montant,d.date,d.modePaiement]), revs: revs.map(r=>[r.libelle,r.categorie,r.montant]), regles: m && m.regles, formats: m && Object.keys(m.formats).length, finding: document.querySelector('.finding').innerText};
    });
    ok(after1.deps.length===4, `relevé 1 : 4 dépenses ajoutées (doublon et retrait exclus), reçu ${JSON.stringify(after1.deps)}`);
    ok(after1.deps.some(d=>d[1]==='Alimentation' && d[2]===54.2 && d[3]==='2026-09-02' && d[4]==='Unique'), 'relevé 1 : dépense Carrefour Market du 02/09 enregistrée en Alimentation');
    const sn = after1.sncf;
    ok(sn && sn.compte==='Compte Joint' && sn.modePaiement==='Echelonne' && sn.nbMensualites===3 && sn.dateDebut && !sn.date && sn.notes==='Billets pour Lyon', `relevé 1 : SNCF en compte joint, en 3 fois, avec commentaire (${JSON.stringify(sn)})`);
    ok(after1.revs.length===1 && after1.revs[0][0]==='Salaire Acme' && after1.revs[0][1]==='Salaire' && after1.revs[0][2]===2300, `relevé 1 : rentrée Salaire Acme, reçu ${JSON.stringify(after1.revs)}`);
    ok(after1.regles && after1.regles['RETRAIT DAB']?.type==='ignorer' && after1.regles['CARREFOUR MARKET']?.categorie==='Alimentation' && !after1.regles['CARREFOUR'], `relevé 1 : règles apprises (doublon non appris) ${JSON.stringify(after1.regles)}`);
    ok(after1.formats===1, 'relevé 1 : format du fichier retenu');
    ok(/Import terminé/.test(after1.finding), `relevé 1 : « Import terminé » attendu, reçu « ${after1.finding} »`);
    if(SHOTS) await page.screenshot({path:path.join(SHOTS,'releve-termine-1440.png'), fullPage:true});

    await page.click('[data-action="releve-fermer"]');
    await page.waitForTimeout(250);
    await importer(page, 'releve-octobre.csv', CSV2, 'latin1');
    L = await lignes(page);
    ok(L.length===5, `relevé 2 : 5 opérations attendues, ${L.length} trouvées`);
    ok(await page.evaluate(()=>!!document.querySelector('.rl-cols:not([open])')), 'relevé 2 : format reconnu — le choix des colonnes reste replié');
    const g = s => L.find(l=>l.lib.toLowerCase().includes(s) || l.raison.toLowerCase().includes(s));
    ok(g('carrefour market')?.cat==='Alimentation' && g('carrefour market')?.badge==='Apprise', `relevé 2 : Carrefour Market reconnu en Alimentation (${JSON.stringify(g('carrefour market'))})`);
    ok(g('boulangerie')?.cat==='Alimentation', 'relevé 2 : boulangerie reconnue en Alimentation');
    ok(g('sncf')?.cat==='Transport', 'relevé 2 : SNCF reconnue en Transport');
    const city = L.find(l=>/12,10/.test(l.amt));
    ok(city && city.cat==='Alimentation' && /Proche de/.test(city.raison), `relevé 2 : Carrefour City (jamais vu) rapproché de Carrefour Market (${JSON.stringify(city)})`);
    const retrait = L.find(l=>/60,00/.test(l.amt));
    ok(retrait && retrait.type==='ignorer', `relevé 2 : le retrait est proposé « Ne pas importer » (${JSON.stringify(retrait)})`);
    if(SHOTS) await page.screenshot({path:path.join(SHOTS,'releve-2-1440.png'), fullPage:true});
    // Validation ligne à ligne, au clavier (Entrée dans le libellé) pour la première.
    const first = L[0].id;
    await page.focus(`[data-rl-id="${first}"][data-rl-champ="libelle"]`);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    ok((await lignes(page)).length===4, 'relevé 2 : Entrée dans le libellé valide la ligne');
    ok(await page.evaluate(()=>document.activeElement?.dataset?.action==='releve-valider'), 'relevé 2 : le focus passe à la ligne suivante');
    await page.click('[data-action="releve-valider-tout"]');
    await page.waitForTimeout(400);
    const acc = await page.evaluate(()=>state.importApprentissage.find(x=>x.ownerId===currentUser().id).historique);
    ok(acc.slice(-5).every(x=>x===1), `relevé 2 : toutes les suggestions étaient justes (${JSON.stringify(acc)})`);

    await page.click('[data-action="releve-fermer"]');
    await page.waitForTimeout(250);
    await importer(page, 'releve-novembre.csv', CSV3);
    L = await lignes(page);
    const surs = L.filter(l=>l.badge==='Reconnue').length;
    ok(surs===2, `relevé 3 : 2 lignes « Reconnue » (vues deux fois), reçu ${surs} — ${JSON.stringify(L)}`);
    const btn = await page.$('[data-action="releve-valider-surs"]');
    ok(btn && /Valider les 2 reconnues/.test(await btn.innerText()), 'relevé 3 : bouton « Valider les 2 reconnues »');
    await btn.click();
    await page.waitForTimeout(400);
    L = await lignes(page);
    ok(L.length===1 && /librairie/i.test(L[0].lib), `relevé 3 : reste la librairie, jamais vue (${JSON.stringify(L)})`);
    // Rechargement : l'import en cours est conservé.
    await page.reload();
    await page.waitForSelector('.rl-row', {timeout:5000});
    ok((await lignes(page)).length===1, 'relevé 3 : la ligne restante est toujours là après rechargement');
    // Oublier une règle.
    await page.click('[data-action="releve-oublier"][data-cle="SNCF INTERNET"]');
    await page.waitForTimeout(250);
    ok(await page.evaluate(()=>!state.importApprentissage.find(x=>x.ownerId===currentUser().id).regles['SNCF INTERNET']), 'règle « SNCF INTERNET » oubliée');
    const primaries = await page.evaluate(()=>[...document.querySelectorAll('#view .btn-primary')].filter(b=>b.offsetParent).length);
    ok(primaries<=1, `un seul bouton plein (${primaries})`);
    ok(errors.length===0, `erreurs console : ${errors.join(' | ')}`);
    await ctx.close();
  }

  console.log('\n— 390 px');
  {
    const {ctx, page, errors} = await openApp(browser, {width:390, height:844});
    await importer(page, 'releve.csv', CSV1, 'latin1');
    const overflow = await page.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(overflow<=1, `import @390 : la page défile horizontalement (${overflow}px)`);
    const txt = await page.evaluate(()=>document.getElementById('view').innerText);
    ok(!/\bundefined\b|\bNaN\b|\bnull\b/.test(txt), 'import @390 : « undefined/null/NaN » affiché');
    if(SHOTS) await page.screenshot({path:path.join(SHOTS,'releve-390.png'), fullPage:true});
    ok(errors.length===0, `erreurs console : ${errors.join(' | ')}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} vérifications réussies, ${failures} en échec.`);
process.exit(failures ? 1 : 0);
