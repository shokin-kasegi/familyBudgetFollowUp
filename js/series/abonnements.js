/* Abonnements : séries de prélèvements prévus, changements de prix, alertes, et leurs actions. */
import { currentUser } from '../auth.js';
import { renderNotifPanel } from '../notifications.js';
import { render } from '../routeur.js';
import { arreterSerie, previsionsDe, previsionsDuMoisDe, seriesAuChoixDe } from './series.js';
import { mine, persist, state } from '../store.js';
import { notifyBrowser } from '../sync.js';
import { confirmDelete, markFieldError, openModal, toast } from '../ui/modale.js';
import { renderSidebar } from '../ui/nav.js';
import { addMonths, currentMonthKey, dateDansMois, esc, fmtEUR, moisDe, monthLabel, monthName, r2,
  uid } from '../utils.js';

export function aboPrevisions(){ return previsionsDe('aboId'); }
export function aboPrevisionsDuMois(key){ return previsionsDuMoisDe('aboId', key); }
// Annonce le prochain prélèvement d'une série : le mois qui suit celui de `dep`
// (jamais un mois déjà passé, où elle serait aussitôt retirée).
function aboPlanifier(dep){
  if(!dep.aboId || aboPrevisions().some(p=>p.aboId===dep.aboId)) return null;
  let key = addMonths(moisDe(dep.date), 1);
  if(key < currentMonthKey()) key = currentMonthKey();
  const prev = {id:uid(), ownerId:dep.ownerId, aboId:dep.aboId, libelle:dep.libelle, categorie:dep.categorie||'', montant:r2(dep.montant),
    modePaiement:'Unique', date:dateDansMois(key, Number(String(dep.date).slice(8,10))), notes:'', prevu:true};
  if(dep.cle) prev.cle = dep.cle;
  state.depenses.push(prev);
  return prev;
}
// Marque une dépense comme abonnement (nouvelle série) et annonce le mois suivant.
export function aboDemarrer(dep){
  dep.aboId = dep.aboId || uid();
  return aboPlanifier(dep);
}
// Abonnements en cours (un par série, via son prélèvement prévu), pour choisir
// auquel rattacher une dépense : deux abonnements chez le même commerçant se
// distinguent par leur nom, leur prix et leur date.
function aboSeriesAuChoix(){ return seriesAuChoixDe('aboId'); }
function aboSerieLabel(p){ return `${p.libelle||'Sans nom'} · ${fmtEUR(p.montant)} · le ${Number(String(p.date).slice(8,10))}`; }
export function aboSerieOptions(){
  return [{value:'', label:'Nouvel abonnement'}, ...aboSeriesAuChoix().map(p=>({value:p.aboId, label:aboSerieLabel(p)}))];
}
// Rattache une dépense à un abonnement existant. Si elle tombe le mois du
// prélèvement prévu (ou après), elle le remplace (changement de prix signalé)
// et annonce le suivant ; un paiement plus ancien rejoint simplement la série.
// Elle prend le nom de l'abonnement, qui reste ainsi distinct des autres.
export function aboRattacher(dep, aboId){
  const prev = aboPrevisions().find(p=>p.aboId===aboId);
  const nom = (prev || mine(state.depenses).find(d=>d.aboId===aboId) || {}).libelle;
  if(nom) dep.libelle = nom;
  dep.aboId = aboId;
  if(prev && moisDe(prev.date) <= moisDe(dep.date)){
    const ancien = r2(prev.montant);
    if(!dep.cle && prev.cle) dep.cle = prev.cle;
    state.depenses = state.depenses.filter(d=>d!==prev);
    if(Math.abs(r2(dep.montant) - ancien) >= 0.005) aboAlerter({type:'prix', aboId, libelle:dep.libelle, ancien, nouveau:r2(dep.montant), mois:moisDe(dep.date)});
  }
  return aboPlanifier(dep);
}
// Valide une prévision : elle devient une dépense comme les autres, et annonce la suivante.
// Un montant différent de celui attendu est un changement de prix : il est signalé.
export function aboValider(prev, valeurs){
  const ancien = r2(prev.montant);
  Object.assign(prev, valeurs);
  prev.montant = r2(prev.montant);
  delete prev.prevu;
  if(Math.abs(prev.montant - ancien) >= 0.005) aboAlerter({type:'prix', aboId:prev.aboId, libelle:prev.libelle, ancien, nouveau:prev.montant, mois:moisDe(prev.date)});
  aboPlanifier(prev);
  return prev;
}
export function aboArreter(aboId){ return arreterSerie('aboId', aboId); }
// Le premier jour d'un mois, les prévisions des mois passés non validées sont
// retirées avec toute leur série. Renvoie le nombre d'abonnements retirés.
export function aboPurger(){
  const cur = currentMonthKey();
  const echues = aboPrevisions().filter(p=>moisDe(p.date) < cur);
  if(!echues.length) return 0;
  const series = new Map();
  echues.forEach(p=>{ if(!series.has(p.aboId)) series.set(p.aboId, p); });
  series.forEach((p, aboId)=>{
    aboArreter(aboId);
    aboAlerter({id:'retire-'+p.id, type:'retire', aboId, libelle:p.libelle, ancien:r2(p.montant), mois:moisDe(p.date)});
  });
  return series.size;
}
// Nouveau prix annoncé : la prévision en attente (et donc les suivantes) prend ce montant.
function aboChangerPrix(prev, montant){
  const ancien = r2(prev.montant);
  prev.montant = r2(montant);
  if(Math.abs(prev.montant - ancien) >= 0.005) aboAlerter({type:'prix', aboId:prev.aboId, libelle:prev.libelle, ancien, nouveau:prev.montant, mois:moisDe(prev.date)});
}
export function aboAlerter(a){
  const me = currentUser(); if(!me) return;
  if(!Array.isArray(state.abonnementsAlertes)) state.abonnementsAlertes = [];
  const id = a.id || uid();
  if(state.abonnementsAlertes.some(x=>x.id===id)) return;
  state.abonnementsAlertes.push({...a, id, ownerId:me.id, le:new Date().toISOString().slice(0,10), vue:false});
  if(state.abonnementsAlertes.length>200) state.abonnementsAlertes = state.abonnementsAlertes.slice(-200);
  notifyBrowser(1, aboAlerteTexte(a));
}
export function aboAlertesNonVues(){ return mine(state.abonnementsAlertes).filter(a=>!a.vue).sort((a,b)=>(b.le||'').localeCompare(a.le||'')); }
export function aboAlerteTexte(a){
  if(a.type==='prix') return `${a.libelle} : ${fmtEUR(a.ancien)} → ${fmtEUR(a.nouveau)} par mois`;
  if(a.type==='ppf-termine') return `${a.libelle} : payé en entier (${fmtEUR(a.nouveau)})`;
  if(a.type==='ppf-retard') return `${a.libelle} : mensualité de ${monthLabel(a.mois)} non validée, reportée au mois suivant`;
  if(a.type==='chg-retard') return `${a.libelle} : échéance de ${monthLabel(a.mois)} non validée, reportée au mois suivant`;
  return `${a.libelle} retiré : prélèvement de ${monthLabel(a.mois)} non validé`;
}
export function aboAlerteTitre(a){
  return {prix:'Changement de prix', 'ppf-termine':'Paiement terminé', 'ppf-retard':'Mensualité en retard', 'chg-retard':'Charge en retard'}[a.type] || 'Abonnement retiré';
}

/* ---- Abonnements ---- */
async function actionAboValider(id){
  const prev = aboPrevisions().find(x=>x.id===id); if(!prev) return;
  const champs = [{key:'date', label:'Date du prélèvement', type:'date'}, {key:'montant', label:'Montant prélevé (€)', type:'number', step:'0.01'}];
  openModal(`Valider « ${esc(prev.libelle)} »`, champs, {date:prev.date, montant:prev.montant}, async (data)=>{
    if(!data.date){ markFieldError('date','Renseigne une date'); return false; }
    if(!(Number(data.montant)>0)){ markFieldError('montant','Renseigne un montant supérieur à 0'); return false; }
    const ancien = r2(prev.montant);
    aboValider(prev, {date:data.date, montant:Number(data.montant)});
    const suivant = aboPrevisions().find(x=>x.aboId===prev.aboId);
    await persist(); await render();
    toast(`${Math.abs(r2(data.montant)-ancien)>=0.005 ? 'Validé avec le nouveau prix' : 'Prélèvement validé'}${suivant ? ` · suivant prévu en ${monthLabel(moisDe(suivant.date))}` : ''}`);
  }, `<p class="field-note">Une fois validé, il compte dans tes dépenses de ${monthName(moisDe(prev.date))}.</p>`);
}
async function actionAboPrix(id){
  const prev = aboPrevisions().find(x=>x.id===id); if(!prev) return;
  openModal(`Nouveau prix : ${esc(prev.libelle)}`, [{key:'montant', label:'Nouveau montant mensuel (€)', type:'number', step:'0.01'}], {montant:prev.montant}, async (data)=>{
    if(!(Number(data.montant)>0)){ markFieldError('montant','Renseigne un montant supérieur à 0'); return false; }
    aboChangerPrix(prev, Number(data.montant));
    await persist(); await render(); toast('Nouveau prix noté');
  }, `<p class="field-note">Prix actuel : ${fmtEUR(prev.montant)}. Le prélèvement prévu et les suivants prennent le nouveau montant.</p>`);
}
async function actionAboArreter(id){
  const prev = aboPrevisions().find(x=>x.id===id); if(!prev) return;
  confirmDelete('', async ()=>{ aboArreter(prev.aboId); await persist(); await render(); toast('Abonnement arrêté'); },
    {title:`Arrêter « ${esc(prev.libelle)} » ?`, consequence:'Le prélèvement prévu est retiré et plus aucun ne sera annoncé. Ceux déjà validés restent dans tes dépenses.', confirmLabel:'Arrêter'});
}
async function actionAboAlerteVue(id){
  const a = mine(state.abonnementsAlertes).find(x=>x.id===id);
  if(a){ a.vue = true; await persist(); renderSidebar(); renderNotifPanel(); }
}
export const actionsAbo = {
  'abo-valider': actionAboValider,
  'abo-prix': actionAboPrix,
  'abo-arreter': actionAboArreter,
  'abo-alerte-vue': actionAboAlerteVue,
};
