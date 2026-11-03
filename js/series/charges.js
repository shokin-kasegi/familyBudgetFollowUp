/* Charges du foyer : échéances périodiques, et leurs actions. */
import { render } from '../routeur.js';
import { aboAlerter } from './abonnements.js';
import { arreterSerie, previsionsDe, previsionsDuMoisDe, serieDe, seriesAuChoixDe } from './series.js';
import { chgToast } from './vues-series.js';
import { persist, state } from '../store.js';
import { confirmDelete, markFieldError, openModal, toast } from '../ui/modale.js';
import { addMonths, currentMonthKey, dateDansMois, esc, fmtEUR, moisDe, r2, sumR2, uid } from '../utils.js';

/* ================================ CHARGES ================================ */
/* Même mécanique que les abonnements, pour les dépenses obligatoires du foyer
   (loyer, énergie, assurance, impôts…) : une dépense marquée charge porte un
   identifiant de série (chgId) et une périodicité en mois (chgPeriode : 1, 2, 3,
   6 ou 12). Chaque échéance validée annonce la suivante (prevu:true), une période
   plus tard, au même jour et au montant de la dernière validée. Une prévision ne
   compte nulle part tant qu'elle n'est pas validée, à la main ou à l'import.
   Comme pour un paiement en plusieurs fois, une échéance non validée à la fin de
   son mois n'est pas retirée (la charge reste due) : elle passe au mois courant. */
export const CHG_PERIODES = [
  {value:'1', label:'Tous les mois', par:'par mois', nom:'mensuelle'},
  {value:'2', label:'Tous les 2 mois', par:'tous les 2 mois', nom:'bimestrielle'},
  {value:'3', label:'Tous les 3 mois', par:'par trimestre', nom:'trimestrielle'},
  {value:'6', label:'Tous les 6 mois', par:'par semestre', nom:'semestrielle'},
  {value:'12', label:'Tous les ans', par:'par an', nom:'annuelle'},
];
export function chgPeriode(x){ const n = Number(x && typeof x==='object' ? x.chgPeriode : x) || 1; return CHG_PERIODES.some(p=>Number(p.value)===n) ? n : 1; }
export function chgPeriodeInfo(x){ return CHG_PERIODES.find(p=>Number(p.value)===chgPeriode(x)); }
export function chgSerie(chgId){ return serieDe('chgId', chgId); }
export function chgPrevisions(){ return previsionsDe('chgId'); }
export function chgPrevisionsDuMois(key){ return previsionsDuMoisDe('chgId', key); }
// Coût ramené au mois (une charge annuelle de 600 € pèse 50 € par mois).
export function chgParMois(p){ return r2(r2(p.montant) / chgPeriode(p)); }
// Annonce la prochaine échéance d'une série : une période après `dep` (jamais
// un mois déjà passé : elle serait aussitôt en retard).
function chgPlanifier(dep){
  if(!dep.chgId || chgPrevisions().some(p=>p.chgId===dep.chgId)) return null;
  const periode = chgPeriode(dep);
  let key = addMonths(moisDe(dep.date), periode);
  if(key < currentMonthKey()) key = currentMonthKey();
  const prev = {id:uid(), ownerId:dep.ownerId, chgId:dep.chgId, chgPeriode:periode, libelle:dep.libelle, categorie:dep.categorie||'', montant:r2(dep.montant),
    modePaiement:'Unique', date:dateDansMois(key, Number(String(dep.date).slice(8,10))), notes:'', prevu:true};
  if(dep.cle) prev.cle = dep.cle;
  state.depenses.push(prev);
  return prev;
}
// Marque une dépense comme charge (nouvelle série) et annonce l'échéance suivante.
export function chgDemarrer(dep, periode){
  delete dep.aboId; delete dep.ppfId; delete dep.ppfTotal;
  dep.chgId = dep.chgId || uid();
  dep.chgPeriode = chgPeriode(periode);
  return chgPlanifier(dep);
}
// Charges en cours (une par série, via son échéance prévue), pour choisir à
// laquelle rattacher une dépense : deux charges chez le même fournisseur se
// distinguent par leur nom, leur montant et leur périodicité.
function chgSeriesAuChoix(){ return seriesAuChoixDe('chgId'); }
function chgSerieLabel(p){ return `${p.libelle||'Sans nom'} · ${fmtEUR(p.montant)} ${chgPeriodeInfo(p).par}`; }
export function chgSerieOptions(){
  return [{value:'', label:'Nouvelle charge'}, ...chgSeriesAuChoix().map(p=>({value:p.chgId, label:chgSerieLabel(p)}))];
}
// Rattache une dépense à une charge existante. Si elle tombe le mois de l'échéance
// prévue (ou après), elle la remplace et annonce la suivante ; un paiement plus
// ancien rejoint simplement la série. Elle prend le nom et la périodicité de la charge.
export function chgRattacher(dep, chgId){
  const prev = chgPrevisions().find(p=>p.chgId===chgId);
  const ref = prev || chgSerie(chgId).find(d=>d!==dep) || {};
  delete dep.aboId; delete dep.ppfId; delete dep.ppfTotal;
  if(ref.libelle) dep.libelle = ref.libelle;
  dep.chgId = chgId;
  dep.chgPeriode = chgPeriode(ref.chgPeriode || dep.chgPeriode);
  if(prev && moisDe(prev.date) <= moisDe(dep.date)){
    if(!dep.cle && prev.cle) dep.cle = prev.cle;
    state.depenses = state.depenses.filter(d=>d!==prev);
  }
  return chgPlanifier(dep);
}
// Valide une échéance : elle devient une dépense comme les autres, et annonce la suivante.
export function chgValider(prev, valeurs){
  Object.assign(prev, valeurs);
  prev.montant = r2(prev.montant);
  delete prev.prevu;
  chgPlanifier(prev);
  return prev;
}
export function chgArreter(chgId){ return arreterSerie('chgId', chgId); }
// Nouveau montant annoncé : l'échéance en attente (et donc les suivantes) le prend.
function chgChangerMontant(prev, montant){ prev.montant = r2(montant); }
// Nouvelle périodicité : toute la série la prend, et l'échéance prévue est
// recalculée depuis la dernière validée.
export function chgChangerPeriode(chgId, periode){
  const n = chgPeriode(periode);
  const serie = chgSerie(chgId);
  if(!serie.length || serie.every(d=>chgPeriode(d)===n)) return false;
  serie.forEach(d=>{ d.chgPeriode = n; });
  const versees = serie.filter(d=>!d.prevu).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const prev = serie.find(d=>d.prevu);
  const derniere = versees[versees.length-1];
  if(prev && derniere){
    let key = addMonths(moisDe(derniere.date), n);
    if(key < currentMonthKey()) key = currentMonthKey();
    prev.date = dateDansMois(key, Number(String(prev.date).slice(8,10)));
  }
  return true;
}
// Une échéance non validée à la fin de son mois reste due : elle passe au mois
// courant, et c'est signalé (une fois par échéance et par mois). Renvoie le nombre d'échéances reportées.
export function chgReporter(){
  const cur = currentMonthKey();
  const echues = chgPrevisions().filter(p=>moisDe(p.date) < cur);
  echues.forEach(p=>{
    aboAlerter({id:'chg-retard-'+p.id+'-'+moisDe(p.date), type:'chg-retard', chgId:p.chgId, libelle:p.libelle, ancien:r2(p.montant), mois:moisDe(p.date)});
    p.date = dateDansMois(cur, Number(String(p.date).slice(8,10)));
  });
  return echues.length;
}
// Charges en cours, avec ce qui a déjà été payé, pour l'échéancier.
export function chgSeriesActives(){
  return chgPrevisions().map(p=>{
    const versees = chgSerie(p.chgId).filter(d=>!d.prevu).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    return {prevu:p, versees, paye:sumR2(versees, d=>d.montant)};
  }).sort((a,b)=>a.prevu.date.localeCompare(b.prevu.date));
}

/* ---- Charges ---- */
async function actionChgValider(id){
  const prev = chgPrevisions().find(x=>x.id===id); if(!prev) return;
  const champs = [{key:'date', label:'Date du paiement', type:'date'}, {key:'montant', label:'Montant payé (€)', type:'number', step:'0.01'}];
  openModal(`Valider « ${esc(prev.libelle)} »`, champs, {date:prev.date, montant:prev.montant}, async (data)=>{
    if(!data.date){ markFieldError('date','Renseigne une date'); return false; }
    if(!(Number(data.montant)>0)){ markFieldError('montant','Renseigne un montant supérieur à 0'); return false; }
    chgValider(prev, {date:data.date, montant:Number(data.montant)});
    const suivant = chgPrevisions().find(x=>x.chgId===prev.chgId);
    await persist(); await render();
    toast(suivant ? chgToast(suivant, 'Échéance validée') : 'Échéance validée');
  }, `<p class="field-note">Une fois validée, elle compte dans tes dépenses du mois du paiement.</p>`);
}
async function actionChgMontant(id){
  const prev = chgPrevisions().find(x=>x.id===id); if(!prev) return;
  openModal(`Nouveau montant : ${esc(prev.libelle)}`, [{key:'montant', label:`Nouveau montant ${chgPeriodeInfo(prev).par} (€)`, type:'number', step:'0.01'}], {montant:prev.montant}, async (data)=>{
    if(!(Number(data.montant)>0)){ markFieldError('montant','Renseigne un montant supérieur à 0'); return false; }
    chgChangerMontant(prev, Number(data.montant));
    await persist(); await render(); toast('Nouveau montant noté');
  }, `<p class="field-note">Montant actuel : ${fmtEUR(prev.montant)}. L’échéance prévue et les suivantes prennent le nouveau montant.</p>`);
}
async function actionChgArreter(id){
  const prev = chgPrevisions().find(x=>x.id===id); if(!prev) return;
  confirmDelete('', async ()=>{ chgArreter(prev.chgId); await persist(); await render(); toast('Charge arrêtée'); },
    {title:`Arrêter « ${esc(prev.libelle)} » ?`, consequence:'L’échéance prévue est retirée et plus aucune ne sera annoncée. Celles déjà validées restent dans tes dépenses.', confirmLabel:'Arrêter'});
}
export const actionsChg = {
  'chg-valider': actionChgValider,
  'chg-montant': actionChgMontant,
  'chg-arreter': actionChgArreter,
};
