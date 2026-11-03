/* Sélection multiple dans les tableaux. */
import { render } from '../routeur.js';
import { mine, persist, state } from '../store.js';
import { icon } from './icones.js';
import { confirmDelete, toast } from './modale.js';
import { attrEsc, fmtCount } from '../utils.js';

/* ============================== SÉLECTION MULTIPLE ============================== */
// Chaque tableau a sa propre sélection (clé = nom du tableau). Une case porte un ou
// plusieurs identifiants (data-ids) : une ligne, un groupe de dépenses, ou tout le
// tableau pour la case d'en-tête. La sélection survit aux rendus, mais ne garde que
// les lignes encore affichées : on ne supprime jamais une ligne masquée par un filtre.
const bulkSel = {};
const BULK_TABLES = {
  revexc: {one:'revenu', many:'revenus', done:'supprimé', remove:ids=>{ state.revenusExceptionnels = state.revenusExceptionnels.filter(x=>!ids.has(x.id)); }},
  depenses: {one:'dépense', many:'dépenses', done:'supprimée', remove:ids=>{ state.depenses = state.depenses.filter(x=>!ids.has(x.id)); }},
};
export function bulkSet(table){ return bulkSel[table] || (bulkSel[table] = new Set()); }
export function bulkCheckHTML(table, ids, label){
  return `<input type="checkbox" class="bulk-cb" data-bulk="${table}" data-ids="${ids.join(',')}" aria-label="${attrEsc(label)}">`;
}
export function bulkHeadHTML(table, rows){
  return `<th class="bulk-th">${bulkCheckHTML(table, rows.map(r=>r.id), 'Tout sélectionner')}</th>`;
}
export function bulkBarHTML(table){
  return `<div class="bulk-bar" data-bulk-bar="${table}" hidden role="region" aria-label="Sélection">
    <span class="bulk-count" aria-live="polite"></span>
    <button type="button" class="btn btn-text btn-sm" data-action="bulk-select-all" data-bulk="${table}">Tout sélectionner</button>
    <button type="button" class="btn btn-text btn-sm" data-action="bulk-clear" data-bulk="${table}">Annuler</button>
    <button type="button" class="btn btn-text btn-sm danger" data-action="bulk-delete" data-bulk="${table}">${icon('trash')}Supprimer</button>
  </div>`;
}
export function bulkIdsShown(table){
  const ids = new Set();
  document.querySelectorAll(`.bulk-cb[data-bulk="${table}"]`).forEach(cb=>cb.dataset.ids.split(',').filter(Boolean).forEach(id=>ids.add(id)));
  return ids;
}
// Recalé après chaque rendu et chaque clic : cases cochées / partielles, barre affichée.
export function syncBulkUI(){
  Object.keys(bulkSel).forEach(table=>{
    const shown = bulkIdsShown(table), sel = bulkSel[table];
    [...sel].forEach(id=>{ if(!shown.has(id)) sel.delete(id); });
  });
  document.querySelectorAll('.bulk-cb').forEach(cb=>{
    const sel = bulkSet(cb.dataset.bulk), ids = cb.dataset.ids.split(',').filter(Boolean);
    const n = ids.filter(id=>sel.has(id)).length;
    cb.checked = ids.length>0 && n===ids.length;
    cb.indeterminate = n>0 && n<ids.length;
  });
  document.querySelectorAll('[data-bulk-bar]').forEach(bar=>{
    const table = bar.dataset.bulkBar, n = bulkSet(table).size, cfg = BULK_TABLES[table];
    bar.hidden = n===0;
    bar.querySelector('.bulk-count').textContent = `${fmtCount(n, cfg.one, cfg.many)} sélectionné${cfg.done.endsWith('e')?'e':''}${n>1?'s':''}`;
    bar.querySelector('[data-action="bulk-select-all"]').hidden = n===bulkIdsShown(table).size;
  });
}

// Écouteurs globaux du module : posés par main.js, dans l'ordre d'origine
// (plusieurs modules écoutent les mêmes événements du document).
export function ecouteursSelection(){
  document.addEventListener('change', (e)=>{
    const cb = e.target.closest && e.target.closest('.bulk-cb');
    if(!cb) return;
    const sel = bulkSet(cb.dataset.bulk);
    cb.dataset.ids.split(',').filter(Boolean).forEach(id=>{ if(cb.checked) sel.add(id); else sel.delete(id); });
    syncBulkUI();
  });
}
export function bulkDelete(table){
  const cfg = BULK_TABLES[table], ids = new Set(bulkSet(table));
  const n = ids.size;
  if(!n) return;
  if(n===1){
    // Une seule ligne : même chemin que la corbeille de la ligne.
    const btn = document.querySelector(`.bulk-cb[data-bulk="${table}"][data-ids="${[...ids][0]}"]`)?.closest('tr')?.querySelector('.icon-btn.del');
    if(btn){ btn.click(); return; }
  }
  confirmDelete('', async ()=>{
    // Seules les lignes de l'utilisateur courant peuvent partir, comme pour la suppression unitaire.
    const own = new Set();
    ['revenusExceptionnels','depenses'].forEach(k=>mine(state[k]).forEach(x=>{ if(ids.has(x.id)) own.add(x.id); }));
    cfg.remove(own);
    bulkSet(table).clear();
    await persist(); await render();
    toast(`${fmtCount(own.size, cfg.one, cfg.many)} ${cfg.done}${own.size>1?'s':''}`);
  }, {
    title: `Supprimer ${fmtCount(n, cfg.one, cfg.many)} ?`,
    consequence: 'Cette action est définitive.',
    confirmLabel: `Supprimer (${n})`,
  });
}
