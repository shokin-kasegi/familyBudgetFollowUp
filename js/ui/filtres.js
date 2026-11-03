/* Filtres de colonne façon Excel, tri, et actions des tableaux. */
import { mesSorties } from '../calculs.js';
import { render } from '../routeur.js';
import { mine, persist, state } from '../store.js';
import { icon } from './icones.js';
import { bulkDelete, bulkIdsShown, bulkSet, syncBulkUI } from './selection.js';
import { attrEsc, esc, fmtEUR } from '../utils.js';
import { DEP_COLUMNS } from '../views/depenses.js';
import { REVEXC_COLUMNS } from '../views/revenus.js';

/* ============================== FILTRE GÉNÉRIQUE (façon Excel) ============================== */
/* Réutilisé sur toutes les pages ayant des tableaux de saisies : tri
   croissant/décroissant par colonne + sélection des valeurs à afficher
   (cases à cocher). L'état confirmé (après OK) vit dans state.tableFilters,
   par nom de table ; l'état en cours d'édition du panneau ouvert vit en
   mémoire (colFilterOpen/colFilterPending), pour ne synchroniser qu'à la
   validation (Annuler ne doit rien changer, comme dans Excel). */
export let colFilterOpen = null;      // { table, col }
export function setColFilterOpen(v){ colFilterOpen = v; }
export const depGroupsOpen = new Set(); // libellés (normalisés) dont le détail est déplié dans la liste des dépenses
let colFilterPending = null;   // Set des valeurs cochées, en cours d'édition
export function setColFilterPending(v){ colFilterPending = v; }
export let colFilterSearch = '';      // texte de recherche dans le panneau ouvert
export function setColFilterSearch(v){ colFilterSearch = v; }

export function tableFilterState(table){
  if(!state.tableFilters) state.tableFilters = {};
  if(!state.tableFilters[table] || !state.tableFilters[table].selected){
    state.tableFilters[table] = { sortCol:null, sortDir:'asc', selected:{} };
  }
  return state.tableFilters[table];
}
export function tableFilterActive(table){
  const f = tableFilterState(table);
  return Object.values(f.selected).some(v=>v!==null && v!==undefined);
}
export function applyTableFilterAndSort(table, columns, arr){
  const f = tableFilterState(table);
  let out = arr.filter(item=>{
    for(const col in f.selected){
      const sel = f.selected[col];
      if(sel && columns[col] && !sel.includes(String(columns[col].get(item)))) return false;
    }
    return true;
  });
  if(f.sortCol && columns[f.sortCol]){
    const {type, get} = columns[f.sortCol];
    out = [...out].sort((a,b)=>{
      let va=get(a), vb=get(b);
      if(type==='text'){ va=String(va).toLowerCase(); vb=String(vb).toLowerCase(); }
      if(va<vb) return f.sortDir==='asc'?-1:1;
      if(va>vb) return f.sortDir==='asc'?1:-1;
      return 0;
    });
  }
  return out;
}
function colDistinctValues(table, columns, col, arr){
  return Array.from(new Set(arr.map(item=>String(columns[col].get(item))))).sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
}
export function colFilterHeaderHTML(table, columns, col, arr){
  const c = columns[col];
  const f = tableFilterState(table);
  const active = !!f.selected[col] || f.sortCol===col;
  const isOpen = colFilterOpen && colFilterOpen.table===table && colFilterOpen.col===col;
  return `<th${c.type==='number'?' class="num"':''}><span class="th-filter-wrap">${c.label}<button class="th-filter-btn ${active?'active':''}" data-action="toggle-col-filter" data-table="${table}" data-col="${col}" aria-label="Filtrer ou trier la colonne">${icon('filterDown')}</button>${isOpen ? colFilterPanelHTML(table, columns, col, arr) : ''}</span></th>`;
}
function colFilterPanelHTML(table, columns, col, arr){
  const c = columns[col];
  const values = colDistinctValues(table, columns, col, arr);
  const shown = colFilterSearch ? values.filter(v=>v.toLowerCase().includes(colFilterSearch.toLowerCase())) : values;
  const allChecked = shown.length>0 && shown.every(v=>colFilterPending.has(v));
  const isNumeric = c.type==='number';
  return `
    <div class="col-filter-panel" data-table="${table}" data-col="${col}">
      <div class="cf-sort-row">
        <button data-action="col-sort" data-table="${table}" data-col="${col}" data-dir="asc">${icon('sortAsc')}${isNumeric?'Croissant':'A à Z'}</button>
        <button data-action="col-sort" data-table="${table}" data-col="${col}" data-dir="desc">${icon('sortDesc')}${isNumeric?'Décroissant':'Z à A'}</button>
      </div>
      <input type="text" class="cf-search" data-action="col-filter-search" placeholder="Rechercher…" value="${colFilterSearch.replace(/"/g,'&quot;')}">
      <div class="cf-list">
        <label class="cf-item"><input type="checkbox" data-action="col-filter-toggle-all" ${allChecked?'checked':''}> <strong>(Tout sélectionner)</strong></label>
        ${shown.map(v=>`<label class="cf-item" data-value-row="${attrEsc(v)}"><input type="checkbox" data-action="col-filter-toggle-value" data-value="${attrEsc(v)}" ${colFilterPending.has(v)?'checked':''}> ${isNumeric?fmtEUR(Number(v)):esc(v)}</label>`).join('')}
      </div>
      <div class="cf-actions">
        <button class="btn btn-primary btn-sm" data-action="col-filter-ok">${icon('check')}OK</button>
        <button class="btn btn-ghost btn-sm" data-action="col-filter-cancel">Annuler</button>
      </div>
    </div>`;
}
function tableRegistry(){
  return {
    depenses: { columns: DEP_COLUMNS, getArray: ()=> mesSorties() },
    revexc: { columns: REVEXC_COLUMNS, getArray: ()=> mine(state.revenusExceptionnels) },
  };
}
function tableSpec(table){ return tableRegistry()[table]; }

/* ---- Tableaux : sélection multiple, tri et filtres de colonne ---- */
function actionBulkDelete(id, el){
  bulkDelete(el.dataset.bulk);
}
function actionBulkClear(id, el){
  bulkSet(el.dataset.bulk).clear(); syncBulkUI();
}
function actionBulkSelectAll(id, el){
  const sel = bulkSet(el.dataset.bulk); bulkIdsShown(el.dataset.bulk).forEach(id=>sel.add(id)); syncBulkUI();
}
async function actionClearTableFilter(id, el){
  state.tableFilters[el.dataset.table] = { sortCol:null, sortDir:'asc', selected:{} }; await persist(); await render();
}
async function actionToggleColFilter(id, el){
  const table = el.dataset.table, col = el.dataset.col;
  if(colFilterOpen && colFilterOpen.table===table && colFilterOpen.col===col){ colFilterOpen = null; }
  else{
    colFilterOpen = { table, col };
    colFilterSearch = '';
    const spec = tableSpec(table);
    const f = tableFilterState(table);
    const arr = spec.getArray();
    const all = colDistinctValues(table, spec.columns, col, arr);
    colFilterPending = new Set(f.selected[col] || all);
  }
  await render();
}
async function actionColSort(id, el){
  const f = tableFilterState(el.dataset.table);
  f.sortCol = el.dataset.col; f.sortDir = el.dataset.dir;
  colFilterOpen = null;
  await persist(); await render();
}
async function actionColFilterToggleAll(){
  const { table, col } = colFilterOpen;
  const spec = tableSpec(table);
  const arr = spec.getArray();
  const shown = colFilterSearch ? colDistinctValues(table, spec.columns, col, arr).filter(v=>v.toLowerCase().includes(colFilterSearch.toLowerCase())) : colDistinctValues(table, spec.columns, col, arr);
  const allChecked = shown.every(v=>colFilterPending.has(v));
  shown.forEach(v=>{ if(allChecked) colFilterPending.delete(v); else colFilterPending.add(v); });
  await render();
}
async function actionColFilterToggleValue(id, el){
  const v = el.dataset.value;
  if(colFilterPending.has(v)) colFilterPending.delete(v); else colFilterPending.add(v);
  await render();
}
async function actionColFilterOk(){
  const { table, col } = colFilterOpen;
  const spec = tableSpec(table);
  const arr = spec.getArray();
  const all = colDistinctValues(table, spec.columns, col, arr);
  const f = tableFilterState(table);
  // Si tout est coché, ça revient à "pas de filtre" sur cette colonne.
  f.selected[col] = (colFilterPending.size===all.length) ? null : Array.from(colFilterPending);
  colFilterOpen = null; colFilterPending = null; colFilterSearch = '';
  await persist(); await render();
}
async function actionColFilterCancel(){
  colFilterOpen = null; colFilterPending = null; colFilterSearch = '';
  await render();
}
export const actionsTableaux = {
  'bulk-delete': actionBulkDelete,
  'bulk-clear': actionBulkClear,
  'bulk-select-all': actionBulkSelectAll,
  'clear-table-filter': actionClearTableFilter,
  'toggle-col-filter': actionToggleColFilter,
  'col-sort': actionColSort,
  'col-filter-toggle-all': actionColFilterToggleAll,
  'col-filter-toggle-value': actionColFilterToggleValue,
  'col-filter-ok': actionColFilterOk,
  'col-filter-cancel': actionColFilterCancel,
};
