/* Vue Revenus, solde du compte, et leurs actions. */
import { currentUser } from '../auth.js';
import { categoriesHorsRevenu, dateDuJour, defaultDateForSelectedMonth, estHorsRevenu,
  revenusDuMoisListe, soldeAncre, soldeCompteFixer, VIEW_COLORS } from '../calculs.js';
import { myCategories } from '../categories.js';
import { render } from '../routeur.js';
import { mine, persist, state } from '../store.js';
import { applyTableFilterAndSort, colFilterHeaderHTML, tableFilterActive, tableFilterState } from '../ui/filtres.js';
import { pageHeadHTML } from '../ui/gabarits.js';
import { icon } from '../ui/icones.js';
import { confirmDelete, fieldRequiredErrors, markFieldError, openModal, reportFieldErrors, toast } from '../ui/modale.js';
import { bigFmt } from '../ui/mouvement.js';
import { bulkBarHTML, bulkCheckHTML, bulkHeadHTML } from '../ui/selection.js';
import { attrEsc, dash, esc, fmtCount, fmtDate, fmtEUR, monthLabel, monthName, parId, r2, sumR2, uid } from '../utils.js';
import { monthStepperHTML } from './dashboard.js';
import { noteSub } from './depenses.js';

/* ============================== REVENUS ============================== */
export const REVEXC_COLUMNS = {
  date: { label:'Date', type:'text', get:r=>r.date||'' },
  libelle: { label:'Libellé', type:'text', get:r=>r.libelle },
  categorie: { label:'Catégorie', type:'text', get:r=>r.categorie },
  montant: { label:'Montant', type:'number', get:r=>Number(r.montant)||0 },
};
export function renderRevenus(){
  const key = state.selectedMonth;
  const reAll = revenusDuMoisListe(key);
  const reFiltered = applyTableFilterAndSort('revexc', REVEXC_COLUMNS, reAll);
  const re = tableFilterState('revexc').sortCol ? reFiltered : [...reFiltered].sort((a,b)=>new Date(b.date)-new Date(a.date));
  const hors = categoriesHorsRevenu();
  const total = sumR2(reAll, r=>r.montant);
  const horsTotal = sumR2(reAll.filter(r=>estHorsRevenu(r, hors)), r=>r.montant);
  const revenu = r2(total - horsTotal);
  const finding = total<=0 ? `Aucun revenu saisi pour ${monthLabel(key)}.` : `${fmtCount(reAll.length, 'entrée', 'entrées')} ce mois-ci.`;
  return `
    ${pageHeadHTML({title:'Revenus', color:VIEW_COLORS.revenus, finding, stepper:monthStepperHTML(key,'dashboard'),
      action:`<button class="btn btn-primary" data-action="add-revexc">${icon('plus')}Ajouter un revenu</button>`})}

    <section class="card hero mb16" aria-labelledby="rev-l">
      <div class="hero-label" id="rev-l">Revenus de ${monthName(key)}</div>
      <div class="big fig" data-tween="rev:total" data-fmt="big" data-v="${revenu}">${bigFmt(revenu)}</div>
      ${horsTotal>0.004 ? `<div class="hero-hors">+ <b class="num">${fmtEUR(horsTotal)}</b> hors revenu total, inclus dans le reste à vivre</div>` : ''}
      ${horsRevenuReglageHTML()}
    </section>

    <div class="card">
      <div class="section-head"><h2>Entrées</h2></div>
      ${tableFilterActive('revexc') ? `<div class="row-actions" style="justify-content:flex-start;margin-bottom:12px;"><button class="btn btn-ghost btn-sm" data-action="clear-table-filter" data-table="revexc">${icon('x')}Réinitialiser les filtres</button></div>` : ''}
      ${reAll.length===0 ? emptyRow(`Aucun revenu en ${monthLabel(key)}`, 'add-revexc', 'Ajouter un revenu') :
        (re.length===0 ? emptyRow('Aucun revenu ne correspond à ces filtres', 'clear-table-filter', 'Réinitialiser', 'revexc') : `
      ${bulkBarHTML('revexc')}<div class="table-wrap"><table class="rtable" data-total-col="3" data-name="revenus">
        <thead><tr>
          ${colFilterHeaderHTML('revexc', REVEXC_COLUMNS, 'libelle', reAll)}
          ${colFilterHeaderHTML('revexc', REVEXC_COLUMNS, 'date', reAll)}
          ${colFilterHeaderHTML('revexc', REVEXC_COLUMNS, 'categorie', reAll)}
          ${colFilterHeaderHTML('revexc', REVEXC_COLUMNS, 'montant', reAll)}
          ${bulkHeadHTML('revexc', re)}
        </tr></thead>
        <tbody>${re.map(r=>`<tr>
          <td><span class="cell-main">${dash(r.libelle)}</span>${noteSub(r)}</td><td class="sub first-sub">${fmtDate(r.date)}</td><td class="sub">${dash(r.categorie)}${estHorsRevenu(r, hors) ? ' <span class="pill pill-dim" title="Compté dans le reste à vivre, pas dans le revenu total">hors revenu</span>' : ''}</td>
          <td class="num key" data-v="${r2(r.montant)}">${fmtEUR(r.montant)}</td>
          <td class="row-actions">${bulkCheckHTML('revexc', [r.id], 'Sélectionner '+(r.libelle||''))}<button class="icon-btn" data-action="edit-revexc" data-id="${r.id}" aria-label="Modifier ${attrEsc(r.libelle)}">${icon('edit')}</button><button class="icon-btn del" data-action="del-revexc" data-id="${r.id}" aria-label="Supprimer ${attrEsc(r.libelle)}">${icon('trash')}</button></td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td>${tableFilterActive('revexc')?'Total (filtré)':'Total'} ${monthLabel(key)}</td><td></td><td></td><td class="num key" data-v="${sumR2(re,r=>r.montant)}">${fmtEUR(sumR2(re,r=>r.montant))}</td><td></td></tr></tfoot>
      </table></div>`)}
    </div>
  `;
}
// Réglage : quelles catégories de revenus sortent du revenu total.
function horsRevenuReglageHTML(){
  const cats = myCategories('revenus');
  if(!cats.length) return '';
  return `<div class="hors-revenu">
      <div class="field-note" id="hors-l">Exclure du revenu total (restent dans le reste à vivre) :</div>
      <div class="chips" role="group" aria-labelledby="hors-l">${cats.map(c=>`<button type="button" class="chip rl-chip" data-action="toggle-hors-revenu" data-id="${c.id}" aria-pressed="${!!c.horsRevenu}">${esc(c.nom)}</button>`).join('')}</div>
    </div>`;
}
export function emptyState(iconName, title, desc, action, btnLabel){
  const btnIcon = action==='clear-table-filter' ? 'x' : (action && action.startsWith('goto-')) ? 'chevR' : 'plus';
  return `<div class="empty">${icon(iconName)}<div style="font-weight:600;color:var(--text);margin-bottom:6px;">${title}</div>${desc?`<p>${desc}</p>`:''}
    ${action ? `<button class="btn btn-ghost btn-sm" data-action="${action}" style="margin:0 auto;">${icon(btnIcon)}${btnLabel}</button>` : ''}</div>`;
}
// État vide compact : une ligne dans son cadre (≈ 40 px), avec l'action à côté.
export function emptyRow(text, action, label, table, extraAttrs){
  return `<div class="empty-row"><span>${text}</span>${action ? `<span aria-hidden="true">·</span><button class="link" data-action="${action}"${table?` data-table="${table}"`:''}${extraAttrs||''}>${label}</button>` : ''}</div>`;
}

export function revexcFields(){
  return [
    {key:'date', label:'Date', type:'date', required:true},
    {key:'libelle', label:'Libellé', placeholder:'Salaire, remboursement…', required:true},
    {key:'categorie', label:'Catégorie', type:'category', categoryType:'revenus', required:true},
    {key:'montant', label:'Montant (€)', type:'number', step:'0.01', required:true},
    {key:'notes', label:'Commentaire', placeholder:'Facultatif'},
  ];
}

/* ---- Revenus (entrées) et solde du compte ---- */
async function actionAddRevexc(){
  openModal('Ajouter un revenu', revexcFields(), {date:defaultDateForSelectedMonth(), categorie:(myCategories('revenus').find(c=>c.nom==='Autre')||myCategories('revenus')[0]||{}).nom||''}, async (data)=>{
    if(Number(data.montant)<0){ markFieldError('montant','Un revenu ne peut pas être négatif'); toast('Un revenu ne peut pas être négatif — utilise l\u2019onglet Dépenses pour une dépense.'); return false; }
    if(reportFieldErrors(fieldRequiredErrors(revexcFields(), data))) return false;
    state.revenusExceptionnels.push({id:uid(), ownerId:currentUser().id, ...data}); await persist(); await render(); toast('Revenu ajouté'); });
}
async function actionEditRevexc(id){
  openModal('Modifier le revenu', revexcFields(), parId(mine(state.revenusExceptionnels), id), async (data)=>{
    if(Number(data.montant)<0){ markFieldError('montant','Un revenu ne peut pas être négatif'); toast('Un revenu ne peut pas être négatif — utilise l\u2019onglet Dépenses pour une dépense.'); return false; }
    if(reportFieldErrors(fieldRequiredErrors(revexcFields(), data))) return false;
    Object.assign(parId(mine(state.revenusExceptionnels), id), data); await persist(); await render(); toast('Revenu mis à jour'); });
}
async function actionDelRevexc(id){
  const item=parId(mine(state.revenusExceptionnels), id); confirmDelete(item.libelle, async ()=>{ state.revenusExceptionnels = state.revenusExceptionnels.filter(x=>x.id!==id); await persist(); await render(); toast('Revenu supprimé'); });
}
async function actionToggleHorsRevenu(id){
  const cat = mine(state.categoriesRevenus).find(c=>c.id===id); if(!cat) return;
  if(cat.horsRevenu) delete cat.horsRevenu; else cat.horsRevenu = true;
  await persist(); await render(); toast(cat.horsRevenu ? `${cat.nom} : exclu du revenu total` : `${cat.nom} : compté dans le revenu total`);
}
async function actionSoldeCompte(){
  const a = soldeAncre();
  openModal('Solde du compte', [
    {key:'date', label:'Date', type:'date'},
    {key:'montant', label:'Solde à la fin de ce jour (€)', type:'number', step:'0.01'},
  ], {date: a ? a.date : dateDuJour(), montant: a ? a.montant : ''}, async (data)=>{
    const saisi = (document.getElementById('f_montant')?.value||'').trim();
    if(reportFieldErrors([...(!data.date ? [['date','Renseigne une date']] : []), ...(!saisi || !Number.isFinite(data.montant) ? [['montant','Renseigne le solde (négatif si découvert)']] : [])])) return false;
    soldeCompteFixer(data.date, data.montant, 'saisie');
    await persist(); await render();
    toast('Solde du compte enregistré');
  }, `<p class="field-note">Le solde affiché par ta banque ce jour-là. Le reste à vivre s’aligne dessus, et le solde reporté des autres mois en découle. Le solde le plus récent fait foi ; un import de relevé retient aussi son solde de fin.</p>`);
}
export const actionsRevenus = {
  'add-revexc': actionAddRevexc,
  'edit-revexc': actionEditRevexc,
  'del-revexc': actionDelRevexc,
  'toggle-hors-revenu': actionToggleHorsRevenu,
  'solde-compte': actionSoldeCompte,
};
