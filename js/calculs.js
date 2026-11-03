/* Calculs du budget : entrées, sorties, dépenses à venir, solde du compte, postes. */
import { currentUser } from './auth.js';
import { catLabel } from './categories-couleurs.js';
import { myCategories } from './categories.js';
import { aboPrevisions } from './series/abonnements.js';
import { chgPeriode, chgPrevisions } from './series/charges.js';
import { PPF_EPS, ppfEtat, ppfPrevisions } from './series/ppf.js';
import { mine, state } from './store.js';
import { addMonths, dateDansMois, moisDe, monthKey, r2, sumR2, uid } from './utils.js';

// Date par défaut proposée dans les formulaires de saisie ponctuelle : le jour
// même si on est sur le mois en cours, sinon le 1er du mois actuellement
// consulté — pour éviter d'ajouter silencieusement une entrée à la date du
// jour pendant qu'on navigue sur un autre mois, ce qui la rend invisible.
export function defaultDateForSelectedMonth(){
  const today = new Date();
  const todayISO = today.toISOString().slice(0,10);
  const key = state.selectedMonth;
  if(!key || key===monthKey(today.getFullYear(), today.getMonth()+1)) return todayISO;
  return `${key}-01`;
}

/* ============================== POSTES : une couleur chacun, partout ============================== */
// Pour l'instant, un seul poste : les sorties. Le découpage sera refait avec le nouveau modèle.
const POSTES = [
  {k:'achats', label:'Dépenses', short:'dépenses', color:'var(--c-achats)'},
];
export const POSTE_BY_KEY = Object.fromEntries(POSTES.map(p=>[p.k,p]));
// Couleur d'identité d'une vue : pastille du titre, point de l'onglet actif.
export const VIEW_COLORS = { revenus:'var(--c-reste)', depenses:'var(--c-achats)' };
export function posteDot(k){ return `<span class="dot" style="background:${POSTE_BY_KEY[k].color}" aria-hidden="true"></span>`; }

/* ============================== COMPUTATIONS ============================== */
/* Le budget connaît des entrées (revenus) et des sorties (dépenses), chacune datée
   et payée en une fois. Une sortie marquée abonnement (aboId) annonce la suivante :
   une dépense prévue (prevu) le mois d'après, qui ne compte nulle part tant qu'elle
   n'est pas validée. Les dépenses d'un autre type héritées de l'ancien modèle
   (abonnements, échéanciers, prévisionnelles) restent stockées mais ignorées. */
function estSortie(d){ return (!d.modePaiement || d.modePaiement==='Unique') && !d.prevu; }
function dansLeMois(x, key){ return !!x.date && x.date.slice(0,7)===key; }
export function forOwner(arr, ownerId){ return (arr||[]).filter(e=>e.ownerId===ownerId); }
export function mesSorties(){ return mine(state.depenses).filter(estSortie); }
export function revenusDuMoisListe(key){ return mine(state.revenusExceptionnels).filter(r=>dansLeMois(r, key)); }
// Catégories de revenus mises « hors revenu total » (ex. Remboursement) : leurs
// entrées restent dans le reste à vivre, mais pas dans le revenu affiché, la part
// du revenu engagée ni le repère du revenu des graphiques.
export function categoriesHorsRevenu(){ return new Set(myCategories('revenus').filter(c=>c.horsRevenu).map(c=>c.nom)); }
export function estHorsRevenu(r, hors){ return !!r.categorie && (hors||categoriesHorsRevenu()).has(r.categorie); }
export function depensesDuMois(key){ return mesSorties().filter(d=>dansLeMois(d, key)); }
export function depenseMontantDuMois(dep, key){ return estSortie(dep) && dansLeMois(dep, key) ? (Number(dep.montant)||0) : 0; }

/* ---------- Dépenses à venir ---------- */
/* Les charges, abonnements et mensualités en cours se répètent : chaque série
   prévue (prevu:true) est prolongée sur les mois suivants — chaque mois pour un
   abonnement, selon sa périodicité pour une charge, jusqu'au total pour un
   paiement en plusieurs fois. Seules les échéances datées après aujourd'hui sont
   « à venir » et déduites du reste à vivre : une prévision passée non validée
   (déjà réglée sans être rattachée, ou arrêtée) ne l'est pas. */
export function dateDuJour(){ const n = new Date(); return `${monthKey(n.getFullYear(), n.getMonth()+1)}-${String(n.getDate()).padStart(2,'0')}`; }
function ecartMois(de, a){ const [y1,m1] = de.split('-').map(Number), [y2,m2] = a.split('-').map(Number); return (y2-y1)*12 + (m2-m1); }
function jourDe(date){ return Number(String(date).slice(8,10)); }
// Échéances du mois `key` : [{genre, libelle, categorie, montant, date, aVenir}].
export function echeancesDuMois(key){
  const auj = dateDuJour(), out = [];
  const ajoute = (genre, p, montant) => {
    const date = dateDansMois(key, jourDe(p.date));
    out.push({genre, libelle:p.libelle||'', categorie:p.categorie||'', montant:r2(montant), date, aVenir: date > auj});
  };
  aboPrevisions().forEach(p=>{ if(ecartMois(moisDe(p.date), key) >= 0) ajoute('abo', p, p.montant); });
  chgPrevisions().forEach(p=>{ const k = ecartMois(moisDe(p.date), key); if(k >= 0 && k % chgPeriode(p) === 0) ajoute('chg', p, p.montant); });
  ppfPrevisions().forEach(p=>{
    const k = ecartMois(moisDe(p.date), key); if(k < 0) return;
    const e = ppfEtat(p.ppfId), m = r2(p.montant), deja = r2(k*m);
    if(!(m > 0) || e.total <= 0 || deja >= e.reste - PPF_EPS) return;
    ajoute('ppf', p, Math.min(m, r2(e.reste - deja)));
  });
  return out.sort((a,b)=>a.date.localeCompare(b.date));
}
function aVenirDuMois(key){ return echeancesDuMois(key).filter(e=>e.aVenir); }

/* ---------- Solde du compte ---------- */
/* Le reste à vivre suit le compte : il part de ce qui restait à la fin du mois
   précédent (solde reporté). Ce report se déduit d'un solde connu (ancre), celui
   de fin d'un relevé importé ou saisi à la main : le plus récent sert de
   référence. Solde à la fin d'un jour J = ancre + entrées − sorties − échéances à
   venir entre l'ancre et J (comptées à rebours si J est avant l'ancre). Le mois
   de l'ancre retombe ainsi exactement sur le solde de la banque, sans ligne de
   régularisation qui fausserait revenus et dépenses. */
export function soldesCompte(){ return mine(state.soldesCompte).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x.date||'') && Number.isFinite(Number(x.montant))).sort((a,b)=>a.date.localeCompare(b.date)); }
export function soldeAncre(){ const l = soldesCompte(); return l.length ? l[l.length-1] : null; }
// Retient un solde : remplace celui de même identifiant ou de même date.
export function soldeCompteFixer(date, montant, source, id){
  const me = currentUser(); if(!me) return null;
  if(!Array.isArray(state.soldesCompte)) state.soldesCompte = [];
  const s = mine(state.soldesCompte).find(x=>(id && x.id===id) || x.date===date);
  if(s){ Object.assign(s, {date, montant:r2(montant), source}); return s; }
  const n = {id:uid(), ownerId:me.id, date, montant:r2(montant), source};
  state.soldesCompte.push(n);
  return n;
}
// Mouvement net du compte sur ]de, a] (dates AAAA-MM-JJ ; « a » peut être un 31 fictif pour « fin du mois »).
export function mouvementEntre(de, a){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(a) || a <= de) return 0;
  const dans = x => !!x.date && x.date > de && x.date <= a;
  let net = r2(sumR2(mine(state.revenusExceptionnels).filter(dans), r=>r.montant) - sumR2(mesSorties().filter(dans), d=>d.montant));
  const auj = dateDuJour();
  if(a > auj){
    for(let k = moisDe(de > auj ? de : auj); k <= moisDe(a); k = addMonths(k, 1)) net = r2(net - sumR2(aVenirDuMois(k).filter(dans), e=>e.montant));
  }
  return net;
}
// Solde à la fin du jour `date`, ou null si aucun solde n'est connu.
export function soldeAu(date){
  const a = soldeAncre(); if(!a) return null;
  const m = Number(a.montant);
  return date >= a.date ? r2(m + mouvementEntre(a.date, date)) : r2(m - mouvementEntre(date, a.date));
}
function soldeReporte(key){ return soldeAu(`${addMonths(key,-1)}-31`); }

/* Chaque partie est arrondie au centime avant d'être additionnée : le total et
   le solde correspondent toujours aux montants affichés. Le solde du mois déduit
   les échéances à venir ; le reste à vivre y ajoute le solde reporté. */
export function dashboardData(key, hors){
  hors = hors || categoriesHorsRevenu();
  const rentrees = revenusDuMoisListe(key);
  const entrees = sumR2(rentrees, r=>r.montant);
  const horsRevenu = sumR2(rentrees.filter(r=>estHorsRevenu(r, hors)), r=>r.montant);
  const revenu = r2(entrees - horsRevenu);
  const liste = depensesDuMois(key);
  const achats = sumR2(liste, d=>d.montant);
  const parts = { achats };
  const totalDepenses = achats;
  const echeances = aVenirDuMois(key);
  const aVenir = sumR2(echeances, e=>e.montant);
  // Le reste à vivre compte toutes les entrées, y compris celles hors revenu total.
  const solde = r2(entrees - totalDepenses - aVenir);
  const report = soldeReporte(key);
  const reste = report==null ? solde : r2(report + solde);
  const parCat = new Map();
  liste.forEach(d=>{ const c = catLabel(d); parCat.set(c, r2((parCat.get(c)||0) + r2(d.montant))); });
  return {key, revenu, entrees, horsRevenu, parts, totalDepenses, echeances, aVenir, solde, report, reste, parCat};
}
