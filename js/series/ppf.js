/* Paiements en plusieurs fois : mensualités, total, recalage, et leurs actions. */
import { currentUser } from '../auth.js';
import { render } from '../routeur.js';
import { aboAlerter } from './abonnements.js';
import { previsionsDe, previsionsDuMoisDe, serieDe } from './series.js';
import { ppfToast } from './vues-series.js';
import { mine, persist, state } from '../store.js';
import { confirmDelete, markFieldError, openModal, toast } from '../ui/modale.js';
import { addMonths, currentMonthKey, dateDansMois, esc, fmtCount, fmtEUR, moisDe, monthName, r2,
  sumR2, uid } from '../utils.js';

/* ======================== PAIEMENTS EN PLUSIEURS FOIS ======================== */
/* Même mécanique que les abonnements : une dépense marquée « en plusieurs fois »
   porte un identifiant de série (ppfId) et le montant total à payer (ppfTotal).
   Chaque mensualité validée annonce la suivante (prevu:true), au montant de la
   dernière mensualité validée, sans dépasser ce qu'il reste à payer. Une prévision
   ne compte nulle part tant qu'elle n'est pas validée, à la main ou à l'import.
   Quand les mensualités validées atteignent le total, le paiement est clôturé.
   Une mensualité qui ferait dépasser le total n'est pas validée : on demande de
   vérifier les montants (mensualité ou total). Une mensualité non validée à la fin
   de son mois n'est pas retirée (la somme reste due) : elle passe au mois courant. */
export const PPF_EPS = 0.005;
export function ppfSerie(ppfId){ return serieDe('ppfId', ppfId); }
export function ppfPrevisions(){ return previsionsDe('ppfId'); }
export function ppfPrevisionsDuMois(key){ return previsionsDuMoisDe('ppfId', key); }
export function ppfIds(){ return [...new Set(mine(state.depenses).filter(d=>d.ppfId).map(d=>d.ppfId))]; }
export function ppfEtat(ppfId){
  const serie = ppfSerie(ppfId);
  const versees = serie.filter(d=>!d.prevu).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const prevu = serie.find(d=>d.prevu) || null;
  const ref = versees[versees.length-1] || prevu || serie[0] || {};
  const total = r2(Number((serie.find(d=>Number(d.ppfTotal)>0)||{}).ppfTotal)||0);
  const paye = sumR2(versees, d=>d.montant);
  const reste = r2(total - paye);
  return {ppfId, libelle:ref.libelle||'', categorie:ref.categorie||'', total, paye, reste, versees, prevu, derniere:versees[versees.length-1]||null,
    termine: versees.length>0 && reste < PPF_EPS, depassement: reste <= -PPF_EPS ? -reste : 0, arrete: serie.some(d=>d.ppfArrete)};
}
// Dépassement (en €) si `montant` était validé dans la série, avec un total éventuellement corrigé.
// `horsId` : mensualité déjà validée qu'on remplace (modification), à ne pas compter deux fois.
export function ppfDepassement(ppfId, montant, total, horsId){
  const e = ppfEtat(ppfId);
  const paye = sumR2(e.versees.filter(d=>d.id!==horsId), d=>d.montant);
  const t = total!=null ? r2(total) : e.total;
  const dep = r2(paye + r2(montant) - t);
  return dep >= PPF_EPS ? dep : 0;
}
export function ppfMessageDepassement(dep, total){
  return `Le total des mensualités dépasse le montant total (${fmtEUR(total)}) de ${fmtEUR(dep)} : vérifie les montants saisis`;
}
export function ppfFixerTotal(ppfId, total){ ppfSerie(ppfId).forEach(d=>{ d.ppfTotal = r2(total); }); }
// Met la série d'accord avec ses mensualités validées : clôture, prochaine mensualité
// (montant de la dernière validée, plafonné au reste), report d'une mensualité en retard.
// Renvoie vrai si quelque chose a changé.
export function ppfRecaler(ppfId){
  const e = ppfEtat(ppfId);
  const me = currentUser();
  const retirerPrevu = ()=>{ state.depenses = state.depenses.filter(d=>!(d.prevu && d.ppfId===ppfId && me && d.ownerId===me.id)); };
  if(!e.versees.length || e.termine || e.arrete){
    // Clôture : signalée une fois (l'alerte est dédoublonnée par son identifiant).
    const nouvelle = e.termine && !mine(state.abonnementsAlertes).some(a=>a.id==='ppf-fin-'+ppfId);
    if(nouvelle) aboAlerter({id:'ppf-fin-'+ppfId, type:'ppf-termine', ppfId, libelle:e.libelle, nouveau:e.paye, mois:moisDe(e.derniere.date)});
    if(!e.prevu) return nouvelle;
    retirerPrevu();
    return true;
  }
  const montant = r2(Math.min(r2(e.derniere.montant), e.reste));
  const cur = currentMonthKey();
  if(e.prevu){
    let change = false;
    if(Math.abs(r2(e.prevu.montant) - montant) >= PPF_EPS){ e.prevu.montant = montant; change = true; }
    if(moisDe(e.prevu.date) < cur){
      aboAlerter({id:'ppf-retard-'+e.prevu.id+'-'+moisDe(e.prevu.date), type:'ppf-retard', ppfId, libelle:e.libelle, mois:moisDe(e.prevu.date)});
      e.prevu.date = dateDansMois(cur, Number(String(e.prevu.date).slice(8,10)));
      change = true;
    }
    return change;
  }
  const dep = e.derniere;
  let key = addMonths(moisDe(dep.date), 1);
  if(key < cur) key = cur;
  const prev = {id:uid(), ownerId:dep.ownerId, ppfId, ppfTotal:e.total, libelle:dep.libelle, categorie:dep.categorie||'', montant,
    modePaiement:'Unique', date:dateDansMois(key, Number(String(dep.date).slice(8,10))), notes:'', prevu:true};
  if(dep.cle) prev.cle = dep.cle;
  state.depenses.push(prev);
  return true;
}
export function ppfRecalerTout(){ let n = 0; ppfIds().forEach(id=>{ if(ppfRecaler(id)) n++; }); return n; }
// Marque une dépense comme première mensualité d'un paiement en plusieurs fois.
export function ppfDemarrer(dep, total){
  delete dep.aboId;
  dep.ppfId = dep.ppfId || uid();
  dep.ppfTotal = r2(total);
  ppfRecaler(dep.ppfId);
  return ppfEtat(dep.ppfId);
}
// Valide la mensualité prévue (elle devient une dépense comme les autres) ; la suivante,
// ou la clôture, découle du recalage.
export function ppfValider(prev, valeurs){
  Object.assign(prev, valeurs);
  prev.montant = r2(prev.montant);
  delete prev.prevu;
  ppfRecaler(prev.ppfId);
  return ppfEtat(prev.ppfId);
}
// Retire une dépense de sa série (case décochée) ; la série se recale sans elle.
export function ppfDetacher(dep){
  const ppfId = dep.ppfId;
  delete dep.ppfId; delete dep.ppfTotal; delete dep.cle;
  ppfRecaler(ppfId);
}
// Paiements en cours (au moins une mensualité validée, ni terminés ni arrêtés), pour
// choisir auquel rattacher une mensualité : deux paiements chez le même commerçant
// se distinguent par leur nom, leur mensualité et ce qu'il reste à payer.
function ppfEnCoursAuChoix(){
  return ppfIds().map(ppfEtat).filter(e=>e.versees.length && !e.termine && !e.arrete)
    .sort((a,b)=>a.libelle.localeCompare(b.libelle,'fr') || a.reste-b.reste);
}
function ppfSerieLabel(e){ return `${e.libelle||'Sans nom'} · ${fmtEUR((e.prevu||e.derniere).montant)} · reste ${fmtEUR(e.reste)}`; }
export function ppfSerieOptions(){
  return [{value:'', label:'Nouveau paiement'}, ...ppfEnCoursAuChoix().map(e=>({value:e.ppfId, label:ppfSerieLabel(e)}))];
}
// Rattache une dépense à un paiement en cours, comme mensualité. Si elle tombe le
// mois de la mensualité prévue (ou après), elle la remplace ; la suivante (ou la
// clôture) découle du recalage. Elle prend le nom du paiement, qui reste ainsi
// distinct des autres. Le dépassement du total est vérifié avant (ppfDepassement).
export function ppfRattacher(dep, ppfId){
  const e = ppfEtat(ppfId);
  delete dep.aboId;
  if(e.libelle) dep.libelle = e.libelle;
  if(e.prevu && moisDe(e.prevu.date) <= moisDe(dep.date)){
    if(!dep.cle && e.prevu.cle) dep.cle = e.prevu.cle;
    state.depenses = state.depenses.filter(d=>d!==e.prevu);
  }
  dep.ppfId = ppfId;
  dep.ppfTotal = e.total;
  ppfRecaler(ppfId);
  return ppfEtat(ppfId);
}
// Arrête un paiement avant son terme : plus aucune mensualité n'est annoncée.
function ppfArreter(ppfId){ ppfSerie(ppfId).forEach(d=>{ d.ppfArrete = true; }); ppfRecaler(ppfId); }
// Texte court d'avancement : « 3 mensualités · 450,00 € sur 1 200,00 € ».
export function ppfAvancement(e){ return `${fmtCount(e.versees.length,'mensualité','mensualités')} · ${fmtEUR(e.paye)} sur ${fmtEUR(e.total)}`; }

/* ---- Paiements en plusieurs fois ---- */
async function actionPpfValider(id){
  const prev = ppfPrevisions().find(x=>x.id===id); if(!prev) return;
  const e = ppfEtat(prev.ppfId);
  const champs = [{key:'date', label:'Date de la mensualité', type:'date'}, {key:'montant', label:'Montant payé (€)', type:'number', step:'0.01'}, {key:'montantTotal', label:'Montant total à payer (€)', type:'number', step:'0.01'}];
  openModal(`Valider « ${esc(prev.libelle)} »`, champs, {date:prev.date, montant:prev.montant, montantTotal:e.total}, async (data)=>{
    if(!data.date){ markFieldError('date','Renseigne une date'); return false; }
    if(!(Number(data.montant)>0)){ markFieldError('montant','Renseigne un montant supérieur à 0'); return false; }
    if(!(Number(data.montantTotal)>0)){ markFieldError('montantTotal','Renseigne le montant total à payer'); return false; }
    const dep = ppfDepassement(prev.ppfId, data.montant, data.montantTotal);
    if(dep){ const m = ppfMessageDepassement(dep, data.montantTotal); markFieldError('montant', m); markFieldError('montantTotal', m); toast(m); return false; }
    ppfFixerTotal(prev.ppfId, data.montantTotal);
    const fin = ppfValider(prev, {date:data.date, montant:Number(data.montant)});
    await persist(); await render();
    toast(ppfToast(fin, 'Mensualité validée'));
  }, `<p class="field-note">Déjà payé : ${fmtEUR(e.paye)} · reste ${fmtEUR(e.reste)}. Une fois validée, la mensualité compte dans tes dépenses de ${monthName(moisDe(prev.date))}.</p>`);
}
async function actionPpfTotal(id){
  const e = ppfEtat(id); if(!e.versees.length) return;
  openModal(`Montant total : ${esc(e.libelle)}`, [{key:'montantTotal', label:'Montant total à payer (€)', type:'number', step:'0.01'}], {montantTotal:e.total}, async (data)=>{
    const t = r2(Number(data.montantTotal)||0);
    if(t<=0){ markFieldError('montantTotal','Renseigne le montant total à payer'); return false; }
    if(t < r2(e.paye - PPF_EPS)){ const m = ppfMessageDepassement(r2(e.paye - t), t); markFieldError('montantTotal', m); toast(m); return false; }
    ppfFixerTotal(id, t); ppfRecaler(id);
    await persist(); await render(); toast(ppfToast(ppfEtat(id), 'Montant total mis à jour'));
  }, `<p class="field-note">Déjà payé : ${fmtEUR(e.paye)} en ${fmtCount(e.versees.length,'mensualité','mensualités')}.</p>`);
}
async function actionPpfArreter(id){
  const e = ppfEtat(id); if(!e.versees.length) return;
  confirmDelete('', async ()=>{ ppfArreter(id); await persist(); await render(); toast('Paiement en plusieurs fois arrêté'); },
    {title:`Arrêter « ${esc(e.libelle)} » ?`, consequence:`La mensualité prévue est retirée et plus aucune ne sera annoncée (reste ${fmtEUR(e.reste)}). Celles déjà validées restent dans tes dépenses.`, confirmLabel:'Arrêter'});
}
export const actionsPpf = {
  'ppf-valider': actionPpfValider,
  'ppf-total': actionPpfTotal,
  'ppf-arreter': actionPpfArreter,
};
