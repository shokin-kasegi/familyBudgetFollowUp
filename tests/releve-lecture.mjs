/* Tests de la lecture d'un relevé — Node seul, sans navigateur ni dépendance.
   Usage : node tests/releve-lecture.mjs
   Charge uniquement le bloc <script id="releve-lecture"> d'index.html dans un
   contexte vide (rien de l'application : ni state, ni document, ni window) ;
   s'il se mettait à dépendre du reste de l'application, ces tests échoueraient.
   Les relevés de tests/fixtures/releves/ sont de vrais formats d'export bancaire,
   anonymisés : préambule avant le tableau, Windows-1252, Débit / Crédit séparés,
   « 1 234,56 » (espace ou espace insécable), montants signés, date de valeur,
   dates ISO, jj/mm/aa, mois/jour américain, colonne de solde, tabulations. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIX = path.join(ROOT, 'tests/fixtures/releves');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const bloc = /<script id="releve-lecture">([\s\S]*?)<\/script>/.exec(html);
if(!bloc){ console.log('✗ bloc <script id="releve-lecture"> introuvable dans index.html'); process.exit(1); }

const ctx = vm.createContext({TextDecoder});
vm.runInContext(bloc[1] + `;this.R = {releveMontant, releveDate, releveOrdre, releveCle, releveDecoder, releveAnalyserTexte};`, ctx);
const R = ctx.R;
const SANS_MODELE = {formats:{}};
const lire = nom => R.releveAnalyserTexte(R.releveDecoder(fs.readFileSync(path.join(FIX, nom))), SANS_MODELE);
// Copie hors du contexte vm, pour comparer en JSON.
const ops = res => JSON.parse(JSON.stringify(res.ops.map(o=>[o.date, o.montant, o.libelle])));

let failures = 0, passes = 0;
const eq = (reel, attendu, msg) => {
  const a = JSON.stringify(reel), b = JSON.stringify(attendu);
  if(a===b) passes++; else { failures++; console.log(`  ✗ ${msg}\n      attendu : ${b}\n      obtenu  : ${a}`); }
};
const somme = l => Math.round(l.reduce((s,o)=>s+o[1],0)*100)/100;

console.log('\n— Montants');
eq(['1 234,56', '1 234,56', '1 234,56', '-12,30', '12.30-', '(45,00)', '1,234.56', "1'234.56", '45,00 €', '+8,00', '-1 089,00', '0,42', '2750.00'].map(R.releveMontant),
  [1234.56, 1234.56, 1234.56, -12.3, -12.3, -45, 1234.56, 1234.56, 45, 8, -1089, 0.42, 2750], 'formats de montant');
eq(['abc', '', '12/10/2026', null].map(x=>Number.isNaN(R.releveMontant(x))), [true, true, true, true], 'pas un montant');

console.log('\n— Dates');
eq([R.releveDate('12/10/2026','dmy'), R.releveDate('2026-10-12','dmy'), R.releveDate('2026-10-12 08:30:00','dmy'), R.releveDate('12/10/26','dmy'),
    R.releveDate('12.10.2026','dmy'), R.releveDate('10/12/2026','mdy'), R.releveDate('3 oct. 2026','dmy'), R.releveDate('12/10','dmy',2026)],
  Array(6).fill('2026-10-12').concat(['2026-10-03', '2026-10-12']), 'formats de date');
eq([R.releveDate('31/02/2026','dmy'), R.releveDate('12.50','dmy'), R.releveDate('12/10','dmy'), R.releveDate('13/13/2026','dmy')], [null, null, null, null], 'dates impossibles ou incomplètes refusées');
eq([R.releveOrdre(['01/09/2026','14/09/2026']), R.releveOrdre(['09/01/2026','09/14/2026']), R.releveOrdre(['01/02/2026'])], ['dmy', 'mdy', 'dmy'], 'ordre jour/mois deviné sur la colonne');

console.log('\n— Relevés anonymisés');
{
  const r = lire('debit-credit-preambule-cp1252.csv');
  eq(r.format, 'csv', 'Débit / Crédit, préambule, Windows-1252 : format');
  eq(ops(r), [
    ['2026-09-01', -32.15, 'PRELEVEMENT ASSURANCE HABITATION ECH/010926'],
    ['2026-09-03', -1234.56, 'PAIEMENT PAR CARTE X1234 SUPERMARCHE 02/09'],
    ['2026-09-05', 2512.4, 'VIREMENT EN VOTRE FAVEUR EMPLOYEUR SAS SALAIRE SEPTEMBRE'],
    ['2026-09-09', -4.3, 'PAIEMENT PAR CARTE X1234 BOULANGERIE 08/09'],
    ['2026-09-09', -4.3, 'PAIEMENT PAR CARTE X1234 BOULANGERIE 08/09'],
    ['2026-09-15', -60, 'RETRAIT AU DISTRIBUTEUR 14/09 VILLE'],
    ['2026-09-28', 23, 'REMBOURSEMENT SECU'],
  ], 'Débit / Crédit : lignes de préambule et « Solde au » écartées, débit négatif, crédit positif, deux achats identiques gardés');
}
{
  const r = lire('montant-signe-date-valeur.csv');
  eq(ops(r), [
    ['2026-10-02', -18.9, 'CB EPICERIE DU COIN 01/10'],
    ['2026-10-04', -1089, 'PRLV SEPA FOURNISSEUR ENERGIE'],
    ['2026-10-06', 312.55, 'VIR SEPA RECU /DE CAF'],
    ['2026-10-13', -7.8, 'CB PHARMACIE CENTRALE'],
    ['2026-10-31', 0.42, 'INTERETS CREDITEURS'],
  ], 'montant signé, BOM UTF-8 : la date d’opération est retenue, pas la date de valeur ; devise ignorée');
}
{
  const r = lire('anglais-iso-point.csv');
  eq(ops(r), [
    ['2026-09-02', -45.2, 'Grocery Store'],
    ['2026-09-05', 2750, 'EMPLOYER LTD'],
    ['2026-09-11', -1099.99, 'Online Shop'],
    ['2026-09-20', -3.5, 'Cafe Bar'],
  ], 'export anglais (virgules, guillemets, ISO, point décimal) : le montant en euros, pas celui en devise');
}
{
  const r = lire('banque-en-ligne-categories-solde.csv');
  eq(ops(r), [
    ['2026-10-28', -58.4, 'CARTE 27/10/26 STATION SERVICE CB*1234'],
    ['2026-10-25', 150, 'VIR INST DE MME MARTIN'],
    ['2026-10-20', -19.99, 'PRLV SEPA OPERATEUR MOBILE'],
    ['2026-10-18', -23, 'CARTE 17/10/26 LIBRAIRIE CB*1234'],
  ], 'banque en ligne (catégories, nom du compte) : ni la catégorie ni le nom du compte dans le libellé');
  eq(JSON.parse(JSON.stringify(r.soldes)), {debut:1491.49, fin:1540.1, dateFin:'2026-10-28', colonne:true}, 'colonne de solde, opérations de la plus récente à la plus ancienne');
  eq(Math.round((r.soldes.debut + somme(ops(r)))*100)/100, r.soldes.fin, 'solde de début + opérations = solde de fin');
}
{
  const r = lire('tabulation-dates-courtes.tsv');
  eq(ops(r), [
    ['2026-11-01', -12.3, 'CB MARCHE 31/10'],
    ['2026-11-03', 40, 'VIR RECU REMBOURSEMENT AMI'],
    ['2026-11-07', -21, 'CB CINEMA'],
  ], 'tabulations, dates jj/mm/aa, signe moins à la fin');
  eq(JSON.parse(JSON.stringify(r.soldes)), {debut:1000, fin:1006.7, dateFin:'2026-11-07', colonne:true}, 'tabulations : soldes lus dans la colonne');
}
{
  const r = lire('americain-mdy-milliers.csv');
  eq(ops(r), [
    ['2026-09-03', -4.75, 'COFFEE SHOP'],
    ['2026-09-14', 3100, 'PAYROLL DEPOSIT'],
    ['2026-09-28', -1450, 'RENT PAYMENT'],
  ], 'format américain : mois/jour reconnu (même au-delà du 12), séparateur de milliers « , »');
}
{
  // Le même relevé lu deux fois donne les mêmes opérations : c'est ce qui permet
  // de reconnaître un relevé déjà importé.
  const a = ops(lire('debit-credit-preambule-cp1252.csv')), b = ops(lire('debit-credit-preambule-cp1252.csv'));
  eq(a, b, 'lecture stable d’un import à l’autre');
}

console.log(`\n${passes} vérifications réussies, ${failures} en échec.`);
process.exit(failures ? 1 : 0);
