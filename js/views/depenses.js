/* Vue Dépenses : liste, formulaire de saisie, bascule en revenu, et leurs actions. */
import { currentUser } from '../auth.js';
import { defaultDateForSelectedMonth, depensesDuMois, posteDot, VIEW_COLORS } from '../calculs.js';
import { myCategories, myCategoriesDep } from '../categories.js';
import { render } from '../routeur.js';
import { aboArreter, aboDemarrer, aboRattacher, aboSerieOptions } from '../series/abonnements.js';
import { CHG_PERIODES, chgArreter, chgChangerPeriode, chgDemarrer, chgPeriode, chgPrevisions,
  chgRattacher, chgSerieOptions } from '../series/charges.js';
import { PPF_EPS, ppfDemarrer, ppfDepassement, ppfDetacher, ppfEtat, ppfFixerTotal,
  ppfMessageDepassement, ppfRattacher, ppfRecaler, ppfSerieOptions } from '../series/ppf.js';
import { aboPrevusHTML, chgPrevusHTML, chgToast, ppfPrevusHTML, ppfToast } from '../series/vues-series.js';
import { mine, persist, setCurrentView, state } from '../store.js';
import { applyTableFilterAndSort, colFilterHeaderHTML, depGroupsOpen, tableFilterActive,
  tableFilterState } from '../ui/filtres.js';
import { pageHeadHTML } from '../ui/gabarits.js';
import { icon } from '../ui/icones.js';
import { confirmDelete, fieldRequiredErrors, markFieldError, openModal, reportFieldErrors, toast } from '../ui/modale.js';
import { bigFmt } from '../ui/mouvement.js';
import { bulkBarHTML, bulkCheckHTML, bulkHeadHTML } from '../ui/selection.js';
import { attrEsc, dash, esc, fmtDate, fmtEUR, moisDe, monthLabel, monthName, parId, r2, sumR2, uid } from '../utils.js';
import { monthStepperHTML } from './dashboard.js';
import { emptyRow, revexcFields } from './revenus.js';

export const DEP_COLUMNS = {
  libelle:   { label:'Libellé',   type:'text',   get:d=>d.libelle },
  categorie: { label:'Catégorie', type:'text',   get:d=>d.categorie },
  montant:   { label:'Montant',   type:'number', get:d=>r2(d.montant) },
};
// Commentaire d'une saisie, sous son libellé.
export function noteSub(x){ return x.notes ? `<span class="cell-sub">${esc(x.notes)}</span>` : ''; }
function depGroupKey(d){ return String(d.libelle||'').trim().toLowerCase(); }
// Regroupe une liste (déjà filtrée et triée) par libellé, en gardant l'ordre de la
// première occurrence ; si le tri porte sur le montant, ce sont les totaux qui comptent.
function depGroups(list){
  const map = new Map();
  list.forEach(x=>{
    const k = depGroupKey(x);
    if(!map.has(k)) map.set(k, {key:k, items:[], total:0});
    map.get(k).items.push(x);
  });
  const groups = [...map.values()];
  groups.forEach(g=>{ g.total = sumR2(g.items, x=>x.montant); });
  const f = tableFilterState('depenses');
  if(f.sortCol==='montant') groups.sort((a,b)=> f.sortDir==='asc' ? a.total-b.total : b.total-a.total);
  return groups;
}
export function renderDepenses(){
  const key = state.selectedMonth;
  const filtrableArr = depensesDuMois(key);
  const listFiltered = applyTableFilterAndSort('depenses', DEP_COLUMNS, filtrableArr);
  const list = tableFilterState('depenses').sortCol ? listFiltered : [...listFiltered].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const total = sumR2(filtrableArr, x=>x.montant);
  const biggest = [...filtrableArr].sort((x,y)=>(Number(y.montant)||0)-(Number(x.montant)||0))[0];
  const finding = biggest ? `Plus grosse dépense du mois : ${esc(biggest.libelle)}, <strong>${fmtEUR(biggest.montant)}</strong>.` : `Aucune dépense en ${monthLabel(key)}.`;
  const actionsFor = d0 => `<td class="row-actions">${bulkCheckHTML('depenses', [d0.id], 'Sélectionner '+(d0.libelle||''))}<button class="icon-btn" data-action="edit-depense" data-id="${d0.id}" aria-label="Modifier ${attrEsc(d0.libelle)}">${icon('edit')}</button><button class="icon-btn del" data-action="del-depense" data-id="${d0.id}" aria-label="Supprimer ${attrEsc(d0.libelle)}">${icon('trash')}</button></td>`;
  // Les dépenses portant le même libellé sont regroupées sur une ligne (total du mois) ;
  // un clic sur le libellé déplie le détail.
  const depenseRowHTML = (x, child=false) => `<tr${child?' class="grp-child"':''}>
          <td><span class="cell-main">${dash(x.libelle)}</span>${x.aboId?'<span class="pill pill-dim pill-abo">Abonnement</span>':''}${x.ppfId?'<span class="pill pill-dim pill-abo">En plusieurs fois</span>':''}${x.chgId?'<span class="pill pill-dim pill-abo">Charge</span>':''}${noteSub(x)}${x.date?`<span class="cell-sub">${fmtDate(x.date)}</span>`:''}</td><td class="sub first-sub">${dash(x.categorie)}</td>
          <td class="num key" data-v="${r2(x.montant)}">${fmtEUR(x.montant)}</td>
          ${actionsFor(x)}
        </tr>`;
  return `
    ${pageHeadHTML({title:'Dépenses', color:VIEW_COLORS.depenses, finding, stepper:monthStepperHTML(key,'dashboard'),
      action:`<button class="btn btn-primary" data-action="add-depense">${icon('plus')}Ajouter une dépense</button>`})}

    <section class="card hero mb16" aria-labelledby="dep-l">
      <div class="hero-label" id="dep-l">Dépenses de ${monthName(key)}</div>
      <div class="big fig" style="color:var(--text)" data-tween="dep:total" data-fmt="big" data-v="${total}">${bigFmt(total)}</div>
    </section>

    ${chgPrevusHTML(key)}
    ${aboPrevusHTML(key)}
    ${ppfPrevusHTML(key)}
    <div class="card">
      <div class="section-head"><h2>${posteDot('achats')}Sorties</h2></div>
      ${tableFilterActive('depenses') ? `<div class="row-actions" style="justify-content:flex-start;margin-bottom:12px;"><button class="btn btn-ghost btn-sm" data-action="clear-table-filter" data-table="depenses">${icon('x')}Réinitialiser les filtres</button></div>` : ''}
      ${filtrableArr.length===0 ? emptyRow(`Aucune dépense en ${monthLabel(key)}`, 'add-depense', 'Ajouter une dépense') :
        (list.length===0 ? emptyRow('Aucune dépense ne correspond à ces filtres', 'clear-table-filter', 'Réinitialiser', 'depenses') : `
      ${bulkBarHTML('depenses')}<div class="table-wrap"><table class="rtable" data-total-col="2" data-name="dépenses">
        <thead><tr>
          ${colFilterHeaderHTML('depenses', DEP_COLUMNS, 'libelle', filtrableArr)}
          ${colFilterHeaderHTML('depenses', DEP_COLUMNS, 'categorie', filtrableArr)}
          ${colFilterHeaderHTML('depenses', DEP_COLUMNS, 'montant', filtrableArr)}
          ${bulkHeadHTML('depenses', list)}
        </tr></thead>
        <tbody>${depGroups(list).map(g=>{
          if(g.items.length===1) return depenseRowHTML(g.items[0]);
          const open = depGroupsOpen.has(g.key);
          const same = get => { const v = new Set(g.items.map(get)); return v.size===1 ? dash([...v][0]) : '<span class="nil">Plusieurs</span>'; };
          return `<tr class="grp-row${open?' is-open':''}">
          <td><button class="grp-toggle" data-action="toggle-dep-group" data-group="${attrEsc(g.key)}" aria-expanded="${open}"><span class="grp-chev" aria-hidden="true">${icon('chevR')}</span><span class="cell-main">${dash(g.items[0].libelle)}</span></button><span class="cell-sub">${g.items.length} dépenses</span></td>
          <td class="sub first-sub">${same(x=>x.categorie)}</td>
          <td class="num key" data-v="${g.total}">${fmtEUR(g.total)}</td>
          <td class="row-actions">${bulkCheckHTML('depenses', g.items.map(x=>x.id), `Sélectionner les ${g.items.length} dépenses ${g.items[0].libelle||''}`)}</td>
        </tr>${open ? g.items.map(x=>depenseRowHTML(x, true)).join('') : ''}`;}).join('')}</tbody>
        <tfoot><tr><td>${tableFilterActive('depenses')?'Total (filtré)':'Total'} ${monthLabel(key)}</td><td></td><td class="num key" data-v="${sumR2(list,x=>x.montant)}">${fmtEUR(sumR2(list,x=>x.montant))}</td><td></td></tr></tfoot>
      </table></div>`)}
    </div>
  `;
}
function depense_fields(){
  const series = aboSerieOptions(), paiements = ppfSerieOptions(), charges = chgSerieOptions();
  return [
    {key:'date', label:'Date de la dépense', type:'date'},
    {key:'libelle', label:'Libellé', placeholder:'Courses, restaurant, réparation…'},
    {key:'categorie', label:'Catégorie', type:'category', categoryType:'depenses'},
    {key:'montant', label:'Montant (€)', type:'number', step:'0.01'},
    {key:'notes', label:'Commentaire', placeholder:'Facultatif'},
    {key:'charge', label:'Charge (loyer, énergie, assurance…) : prévoir la prochaine échéance', type:'checkbox', showIf:v=>!v.abonnement && !v.plusieursFois},
    ...(charges.length>1 ? [{key:'chgSerie', label:'Quelle charge ?', type:'select', options:charges, showIf:v=>!!v.charge}] : []),
    {key:'chgPeriode', label:'Périodicité', type:'select', options:CHG_PERIODES, default:'1', showIf:v=>!!v.charge && !v.chgSerie},
    {key:'abonnement', label:'Abonnement : prévoir le même prélèvement le mois suivant', type:'checkbox', showIf:v=>!v.plusieursFois && !v.charge},
    ...(series.length>1 ? [{key:'aboSerie', label:'Quel abonnement ?', type:'select', options:series, showIf:v=>!!v.abonnement && !v.plusieursFois}] : []),
    {key:'plusieursFois', label:'Paiement en plusieurs fois : cette dépense est une mensualité', type:'checkbox', showIf:v=>!v.abonnement && !v.charge},
    ...(paiements.length>1 ? [{key:'ppfSerie', label:'Quel paiement ?', type:'select', options:paiements, showIf:v=>!!v.plusieursFois}] : []),
    {key:'montantTotal', label:'Montant total à payer (€)', type:'number', step:'0.01', showIf:v=>!!v.plusieursFois && !v.ppfSerie},
  ];
}
// Une case masquée (l'autre mode est coché) ne compte pas.
function depenseMode(data){ return data.charge ? 'chg' : data.plusieursFois ? 'ppf' : data.abonnement ? 'abo' : 'unique'; }
function depenseValidationErrors(data, dep){
  const errors = [];
  if(!data.date) errors.push(['date','Renseigne une date']);
  if(!data.libelle || !String(data.libelle).trim()) errors.push(['libelle','Renseigne un libellé']);
  if(!data.montant || Number(data.montant)<=0) errors.push(['montant','Renseigne un montant supérieur à 0']);
  if(depenseMode(data)==='ppf' && data.ppfSerie && !errors.some(e=>e[0]==='montant')){
    // Mensualité d'un paiement en cours : elle ne doit pas faire dépasser son total.
    const dep2 = ppfDepassement(data.ppfSerie, data.montant, null, dep && dep.id);
    if(dep2) errors.push(['montant', ppfMessageDepassement(dep2, ppfEtat(data.ppfSerie).total)]);
  } else if(depenseMode(data)==='ppf' && !errors.some(e=>e[0]==='montant')){
    const total = Number(data.montantTotal)||0;
    if(total<=0) errors.push(['montantTotal','Renseigne le montant total à payer']);
    else if(dep && dep.ppfId){
      const dep2 = ppfDepassement(dep.ppfId, data.montant, total, dep.id);
      if(dep2){ const m = ppfMessageDepassement(dep2, total); errors.push(['montant', m], ['montantTotal', m]); }
    } else if(r2(data.montant) >= r2(total) - PPF_EPS){
      const m = r2(data.montant) > r2(total) ? ppfMessageDepassement(r2(r2(data.montant)-r2(total)), total) : 'La mensualité égale le total : c’est un paiement en une fois';
      errors.push(['montant', m], ['montantTotal', m]);
    }
  }
  return errors;
}
function openDepenseEditModal(depenseId){
  const dep = mine(state.depenses).find(x=>x.id===depenseId);
  // Déjà abonnement : la série ne change pas ici, le choix n'est proposé qu'en le devenant.
  const champs = depense_fields().filter(f=>!(f.key==='aboSerie' && dep.aboId) && !(f.key==='ppfSerie' && dep.ppfId) && !(f.key==='chgSerie' && dep.chgId));
  openModal('Modifier la dépense', champs, {...dep, abonnement:!!dep.aboId, plusieursFois:!!dep.ppfId, montantTotal:dep.ppfId ? ppfEtat(dep.ppfId).total : '', charge:!!dep.chgId, chgPeriode:String(chgPeriode(dep))}, async (data)=>{
    const errors = depenseValidationErrors(data, dep);
    if(errors.length){ errors.forEach(([key,msg])=>markFieldError(key,msg)); toast(errors[0][1]); return false; }
    Object.assign(dep, {libelle:data.libelle, categorie:data.categorie, montant:data.montant, date:data.date, modePaiement:'Unique', notes:(data.notes||'').trim()});
    const mode = depenseMode(data);
    let msg = 'Dépense mise à jour';
    if(mode!=='abo' && dep.aboId){ aboArreter(dep.aboId); delete dep.aboId; delete dep.cle; msg = 'Ce n’est plus un abonnement'; }
    if(mode!=='ppf' && dep.ppfId){ ppfDetacher(dep); msg = 'Retirée du paiement en plusieurs fois'; }
    if(mode!=='chg' && dep.chgId){ chgArreter(dep.chgId); delete dep.chgId; delete dep.chgPeriode; delete dep.cle; msg = 'Ce n’est plus une charge'; }
    if(mode==='chg' && !dep.chgId){
      const prev = data.chgSerie ? chgRattacher(dep, data.chgSerie) : chgDemarrer(dep, data.chgPeriode);
      msg = prev ? chgToast(prev, 'Charge') : data.chgSerie ? 'Rattachée à la charge' : msg;
    } else if(mode==='chg' && chgChangerPeriode(dep.chgId, data.chgPeriode)){
      const prev = chgPrevisions().find(p=>p.chgId===dep.chgId);
      msg = prev ? chgToast(prev, 'Périodicité mise à jour') : 'Périodicité mise à jour';
    }
    if(mode==='abo' && !dep.aboId){
      const prev = data.aboSerie ? aboRattacher(dep, data.aboSerie) : aboDemarrer(dep);
      msg = prev ? `Abonnement : prochain prélèvement prévu en ${monthLabel(moisDe(prev.date))}` : data.aboSerie ? 'Rattachée à l’abonnement' : msg;
    }
    if(mode==='ppf'){
      const nouveau = !dep.ppfId, rattache = nouveau && !!data.ppfSerie;
      if(rattache) ppfRattacher(dep, data.ppfSerie);
      else if(nouveau) ppfDemarrer(dep, data.montantTotal); else { ppfFixerTotal(dep.ppfId, data.montantTotal); ppfRecaler(dep.ppfId); }
      msg = ppfToast(ppfEtat(dep.ppfId), rattache ? 'Mensualité ajoutée' : nouveau ? 'Paiement en plusieurs fois' : 'Mensualité mise à jour');
    }
    await persist(); await render(); toast(msg); }, `<p class="field-note">Ce n’est pas une dépense mais une entrée d’argent ? <button type="button" class="link" id="dep-vers-revenu">Basculer en revenu</button></p>`);
  document.getElementById('dep-vers-revenu').onclick = ()=>openBasculerEnRevenu(dep);
}
// Une dépense saisie (ou importée) par erreur devient un revenu : on repart de ce qui
// est dans le formulaire, avec un montant positif, puis la dépense est retirée — et
// avec elle son abonnement ou sa place dans un paiement en plusieurs fois.
function openBasculerEnRevenu(dep){
  const lu = k => { const el = document.getElementById('f_'+k); return el ? el.value : dep[k]; };
  const cats = myCategories('revenus');
  const categorie = (cats.find(c=>c.nom===lu('categorie')) || cats.find(c=>c.nom==='Autre') || cats[0] || {}).nom || '';
  const valeurs = {date:lu('date')||dep.date, libelle:lu('libelle'), categorie, montant:r2(Math.abs(Number(lu('montant'))||0)), notes:lu('notes')||''};
  openModal('Basculer en revenu', revexcFields(), valeurs, async (data)=>{
    data.montant = Math.abs(Number(data.montant)||0);
    if(!(data.montant>0)){ markFieldError('montant','Renseigne un montant supérieur à 0'); return false; }
    if(reportFieldErrors(fieldRequiredErrors(revexcFields(), data))) return false;
    if(dep.aboId) aboArreter(dep.aboId);
    if(dep.ppfId) ppfDetacher(dep);
    if(dep.chgId) chgArreter(dep.chgId);
    state.depenses = state.depenses.filter(x=>x.id!==dep.id);
    state.revenusExceptionnels.push({id:uid(), ownerId:currentUser().id, ...data, notes:(data.notes||'').trim()});
    await persist(); await render(); toast(`Basculée en revenu · ${fmtEUR(data.montant)} en ${monthLabel(moisDe(data.date))}`);
  }, `<p class="field-note">La dépense « ${esc(dep.libelle||'')} » sera retirée des dépenses et comptée en revenu, en positif.</p>`);
}

/* ---- Dépenses (sorties datées, payées en une fois) ---- */
async function actionAddDepense(){
  openModal('Ajouter une dépense', depense_fields(), {categorie:(myCategoriesDep()[0]||{}).nom||'', date:defaultDateForSelectedMonth()}, async (data)=>{
    const errors = depenseValidationErrors(data);
    if(errors.length){ errors.forEach(([key,msg])=>markFieldError(key,msg)); toast(errors[0][1]); return false; }
    const dep = {id:uid(), ownerId:currentUser().id, libelle:data.libelle, categorie:data.categorie, montant:data.montant, modePaiement:'Unique', date:data.date, notes:(data.notes||'').trim()};
    state.depenses.push(dep);
    const mode = depenseMode(data);
    const prev = mode==='abo' ? (data.aboSerie ? aboRattacher(dep, data.aboSerie) : aboDemarrer(dep)) : null;
    const ppf = mode==='ppf' ? (data.ppfSerie ? ppfRattacher(dep, data.ppfSerie) : ppfDemarrer(dep, data.montantTotal)) : null;
    const chg = mode==='chg' ? (data.chgSerie ? chgRattacher(dep, data.chgSerie) : chgDemarrer(dep, data.chgPeriode)) : null;
    await persist(); await render();
    toast(chg ? chgToast(chg, data.chgSerie ? 'Échéance validée' : 'Charge ajoutée') : mode==='chg' && data.chgSerie ? 'Rattachée à la charge' : ppf ? ppfToast(ppf, data.ppfSerie ? 'Mensualité ajoutée' : 'Paiement en plusieurs fois ajouté') : prev ? `${data.aboSerie ? 'Prélèvement validé' : 'Abonnement ajouté'} · prochain prélèvement prévu en ${monthLabel(moisDe(prev.date))}` : mode==='abo' && data.aboSerie ? 'Rattachée à l’abonnement' : 'Dépense ajoutée'); });
}
function actionEditDepense(id){
  openDepenseEditModal(id);
}
async function actionDelDepense(id){
  const item=parId(mine(state.depenses), id); confirmDelete(item.libelle, async ()=>{
    state.depenses = state.depenses.filter(x=>x.id!==id);
    await persist(); await render(); toast('Dépense supprimée'); });
}
async function actionToggleDepGroup(id, el){
  const g = el.dataset.group; if(depGroupsOpen.has(g)) depGroupsOpen.delete(g); else depGroupsOpen.add(g); await render();
}
async function actionGotoDepenses(){
  setCurrentView('depenses'); await render();
}
export const actionsDepenses = {
  'add-depense': actionAddDepense,
  'edit-depense': actionEditDepense,
  'del-depense': actionDelDepense,
  'toggle-dep-group': actionToggleDepGroup,
  'goto-depenses': actionGotoDepenses,
};
