/* Modales, formulaires génériques, confirmations et toasts. */
import { myCategories } from '../categories.js';
import { icon } from './icones.js';
import { motionOff } from './mouvement.js';
import { attrEsc, esc } from '../utils.js';

export function toast(msg){
  const t = document.getElementById('toast');
  t.innerHTML = icon('check') + '<span></span>';
  t.lastChild.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 2400);
}

/* ============================== MODAL SYSTEM ============================== */
export function openModal(title, fields, values, onSave, extraHtml){
  const root = document.getElementById('modal-root');
  const isEdit = !!(values && values.id);
  if(!document.querySelector('#modal-root .modal')) modalReturnFocus = document.activeElement;
  root.innerHTML = `
    <div class="modal-overlay" id="ov">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <h3 id="modal-title">${title}</h3>
        <form id="modal-form">
          ${fields.map(f=>fieldHTML(f, values)).join('')}
          ${extraHtml||''}
          ${fields.length>0 ? `<div class="modal-actions">
            <button type="button" class="btn btn-ghost" id="cancel-btn">Annuler</button>
            <button type="submit" class="btn btn-primary">${icon('check')}${isEdit?'Enregistrer':'Ajouter'}</button>
          </div>` : ''}
        </form>
      </div>
    </div>`;
  const ov = document.getElementById('ov');
  ov.addEventListener('click', (e)=>{ if(e.target.id==='ov') closeModal(); });
  document.getElementById('cancel-btn')?.addEventListener('click', closeModal);
  fields.forEach(f=>{
    const el = document.getElementById('f_'+f.key);
    el?.addEventListener('input', ()=>clearFieldError(f.key));
    el?.addEventListener('change', ()=>clearFieldError(f.key));
  });
  if(fields.some(f=>f.showIf)){
    const updateConditionalFields = ()=>{
      const current = {};
      fields.forEach(f=>{ const el = document.getElementById('f_'+f.key); if(el) current[f.key] = f.type==='checkbox' ? el.checked : el.value; });
      fields.forEach(f=>{
        if(!f.showIf) return;
        const el = document.getElementById('f_'+f.key);
        const wrap = el?.closest('.field');
        if(wrap) wrap.hidden = !f.showIf(current);
      });
    };
    document.getElementById('modal-form').addEventListener('input', updateConditionalFields);
    document.getElementById('modal-form').addEventListener('change', updateConditionalFields);
    updateConditionalFields();
  }
  document.getElementById('modal-form').onsubmit = async (e)=>{
    e.preventDefault();
    clearFieldErrors();
    const data = {};
    fields.forEach(f=>{
      const el = document.getElementById('f_'+f.key);
      if(!el) return;
      let v = f.type==='checkbox' ? el.checked : el.value;
      if(f.type==='number') v = v===''? 0 : parseFloat(v);
      if(f.type==='date' && v==='') v = null;
      data[f.key] = v;
    });
    // onSave peut renvoyer explicitement false pour signaler une validation
    // échouée : dans ce cas, le modal reste ouvert (rien n'est perdu, l'utilisateur
    // corrige simplement sa saisie) plutôt que de se fermer sur une erreur. Il peut
    // aussi avoir mis en évidence les champs fautifs via markFieldError avant de renvoyer false.
    // Pendant l'enregistrement (synchro GitHub comprise), le bouton est désactivé :
    // un double clic ou un Entrée répété ne crée pas de doublon.
    const submitBtn = e.submitter || document.querySelector('#modal-form button[type=submit]');
    if(submitBtn && submitBtn.disabled) return;
    const submitHTML = submitBtn ? submitBtn.innerHTML : '';
    if(submitBtn){ submitBtn.disabled = true; submitBtn.setAttribute('aria-busy','true'); submitBtn.textContent = 'Enregistrement…'; }
    let result;
    try{ result = await onSave(data); }
    finally{
      if(submitBtn && submitBtn.isConnected){ submitBtn.disabled = false; submitBtn.removeAttribute('aria-busy'); submitBtn.innerHTML = submitHTML; }
    }
    if(result===false) return;
    closeModal();
  };
  // Focus sur le premier champ, sauf si l'utilisateur est déjà dans la modale (saisie rapide) :
  // lui reprendre le focus enverrait la suite de sa frappe dans un autre champ.
  setTimeout(()=>{ if(document.querySelector('#modal-root .modal')?.contains(document.activeElement)) return; const first = document.querySelector('#modal-form input:not([type=hidden]),#modal-form select') || document.getElementById('del-yes') || modalFocusables()[0]; if(first) first.focus(); }, 50);
}
function fieldHTML(f, values){
  const val = values && values[f.key]!==undefined && values[f.key]!==null ? values[f.key] : (f.default!==undefined?f.default:'');
  const hiddenAttr = f.showIf && !f.showIf(values||{}) ? ' hidden' : '';
  if(f.type==='select'){
    const opts = f.options.map(o=> typeof o==='object' ? o : {value:o, label:o});
    return `<div class="field"${hiddenAttr}><label for="f_${f.key}">${f.label}</label><select id="f_${f.key}">${opts.map(o=>`<option value="${attrEsc(o.value)}" ${String(o.value)===String(val)?'selected':''}>${esc(o.label)}</option>`).join('')}</select></div>`;
  }
  if(f.type==='category'){
    return categoryFieldHTML(f, val, hiddenAttr);
  }
  if(f.type==='checkbox'){
    return `<div class="field"${hiddenAttr} style="display:flex;align-items:center;gap:9px;"><input id="f_${f.key}" type="checkbox" ${val?'checked':''} style="width:16px;height:16px;accent-color:#FFFFFF;"><label for="f_${f.key}" style="margin:0;font-size:13px;color:var(--text);">${f.label}</label></div>`;
  }
  if(f.type==='password'){
    return `<div class="field"${hiddenAttr}><label for="f_${f.key}">${f.label}</label><div class="pw-wrap"><input id="f_${f.key}" type="password"${f.maxlength?` maxlength="${f.maxlength}"`:''} value="${attrEsc(val||'')}" placeholder="${f.placeholder||''}" autocomplete="${f.autocomplete||'current-password'}"><button type="button" class="pw-toggle" data-toggle-pw="f_${f.key}" aria-label="Afficher ou masquer la saisie">${icon('eye')}</button></div></div>`;
  }
  const amount = f.type==='number' && /montant|budget/i.test(f.key);
  return `<div class="field${amount?' amount':''}"${hiddenAttr}><label for="f_${f.key}">${f.label}</label><input id="f_${f.key}" type="${f.type||'text'}"${amount?' inputmode="decimal"':''} ${f.step?`step="${f.step}"`:''}${f.maxlength?` maxlength="${f.maxlength}"`:''} value="${attrEsc(val===0?0:(val||''))}" placeholder="${f.placeholder||''}"></div>`;
}
// Champ « Catégorie » personnalisable : au lieu d'un <select> figé, un menu
// déroulant où chaque catégorie porte sa propre croix de suppression, et où
// une dernière ligne « + Autre… » ouvre un champ texte pour en créer une
// nouvelle sans jamais quitter le formulaire en cours.
function categoryFieldHTML(f, val, hiddenAttr){
  const hasVal = val!==undefined && val!==null && val!=='';
  return `<div class="field cat-field"${hiddenAttr||''} data-cat-type="${f.categoryType}" data-cat-key="${f.key}">
    <label id="lbl_${f.key}">${f.label}</label>
    <input type="hidden" id="f_${f.key}" value="${attrEsc(val)}">
    <div class="cat-select">
      <button type="button" class="cat-select-btn" data-cat-toggle aria-expanded="false" aria-labelledby="lbl_${f.key}">
        <span class="cat-select-label ${hasVal?'':'is-placeholder'}">${hasVal?esc(val):'Choisir une catégorie'}</span>
        ${icon('chevD')}
      </button>
      <div class="cat-dropdown">${categoryDropdownListHTML(f.categoryType, val)}</div>
    </div>
  </div>`;
}
export function categoryDropdownListHTML(type, currentValue){
  const cats = myCategories(type);
  const names = cats.map(c=>c.nom);
  const ghost = (currentValue && !names.includes(currentValue))
    ? `<div class="cat-option cat-option-ghost"><button type="button" class="cat-option-label" data-cat-select="${attrEsc(currentValue)}">${esc(currentValue)} <em>(supprimée)</em></button></div>`
    : '';
  const rows = cats.map(c=>`
    <div class="cat-option ${c.nom===currentValue?'is-selected':''}">
      <button type="button" class="cat-option-label" data-cat-select="${attrEsc(c.nom)}">${esc(c.nom)}</button>
      <button type="button" class="cat-option-del" data-cat-delete="${c.id}" title="Supprimer cette catégorie" aria-label="Supprimer cette catégorie">${icon('x')}</button>
    </div>`).join('');
  const empty = cats.length===0 ? `<div class="field-note" style="padding:8px 9px;">Aucune catégorie pour l'instant.</div>` : '';
  return `${ghost}${rows}${empty}
    <button type="button" class="cat-add-row" data-cat-add-toggle>${icon('plus')}<span>Autre…</span></button>
    <div class="cat-add-input-row" hidden>
      <input type="text" class="cat-add-input" placeholder="Nouvelle catégorie" maxlength="40">
      <button type="button" class="cat-add-confirm" data-cat-add-confirm title="Ajouter" aria-label="Ajouter">${icon('check')}</button>
      <button type="button" class="cat-add-cancel" data-cat-add-cancel title="Annuler" aria-label="Annuler">${icon('x')}</button>
    </div>`;
}
// Champ catégorie tel qu'il est à l'écran après un render() : une ligne du relevé
// est reconstruite, un champ de modale reste le même élément.
export function catFieldVivant(field){
  return field.isConnected ? field : (document.querySelector(`.cat-field[data-cat-key="${field.dataset.catKey}"]`) || field);
}
export function resetCatDropdown(wrap){
  const addRow = wrap.querySelector('.cat-add-row');
  const inputRow = wrap.querySelector('.cat-add-input-row');
  if(addRow) addRow.hidden = false;
  if(inputRow) inputRow.hidden = true;
  wrap.querySelector('[data-cat-toggle]')?.setAttribute('aria-expanded', String(wrap.classList.contains('open')));
}
// Élément qui avait le focus avant l'ouverture de la modale : on le lui rend à la fermeture.
let modalReturnFocus = null;
export function closeModal(){
  const root = document.getElementById('modal-root');
  const ov = root.querySelector('.modal-overlay');
  // Sortie plus rapide que l'entrée (150 ms) ; une nouvelle modale ouverte entre-temps n'est pas effacée.
  if(ov && !motionOff()){
    ov.classList.add('closing'); ov.id = '';
    setTimeout(()=>{ if(ov.isConnected) ov.remove(); }, 150);
  } else root.innerHTML='';
  if(modalReturnFocus && modalReturnFocus.isConnected) modalReturnFocus.focus();
  modalReturnFocus = null;
}
export function modalFocusables(){
  return Array.from(document.querySelectorAll('#modal-root .modal-overlay:not(.closing) .modal :is(button, input, select, textarea, [tabindex]:not([tabindex="-1"]))'))
    .filter(el=>!el.disabled && el.type!=='hidden' && el.offsetParent!==null);
}
export function markFieldError(key, msg){
  const input = document.getElementById('f_'+key);
  const field = input?.closest('.field');
  if(!field) return;
  field.classList.add('has-error');
  if(msg && !field.querySelector('.field-error-text')){
    const p = document.createElement('div');
    p.className = 'field-error-text';
    p.textContent = msg;
    field.appendChild(p);
  }
}
export function clearFieldError(key){
  const field = document.getElementById('f_'+key)?.closest('.field');
  if(!field) return;
  field.classList.remove('has-error');
  field.querySelector('.field-error-text')?.remove();
}
function clearFieldErrors(){
  document.querySelectorAll('#modal-form .field.has-error').forEach(field=>{
    field.classList.remove('has-error');
    field.querySelector('.field-error-text')?.remove();
  });
}
// Validation générique pour les formulaires de saisie : un champ marqué
// `required` doit être non vide (montant strictement positif pour les
// champs numériques) sous peine de rester en évidence et de bloquer l'ajout.
export function fieldRequiredErrors(fields, data){
  const errors = [];
  fields.forEach(f=>{
    if(!f.required) return;
    const v = data[f.key];
    const empty = v===undefined || v===null || (typeof v==='string' && !v.trim());
    if(f.type==='number'){
      if(empty || Number(v)<=0) errors.push([f.key, f.errorMsg || 'Renseigne un montant supérieur à 0']);
    } else if(empty){
      errors.push([f.key, f.errorMsg || (f.type==='date' ? 'Renseigne une date' : (f.type==='category' ? 'Choisis une catégorie' : 'Ce champ est obligatoire'))]);
    }
  });
  return errors;
}
export function reportFieldErrors(errors){
  if(!errors.length) return false;
  errors.forEach(([key,msg])=>markFieldError(key,msg));
  toast(errors[0][1]);
  return true;
}

// La phrase nomme la conséquence ; le bouton destructif est un texte rouge, sans fond.
export function confirmDelete(label, onYes, opts){
  opts = opts || {};
  openModal(opts.title || `Supprimer « ${esc(label)} » ?`, [], {}, ()=>{}, `
    <p class="modal-lead">${opts.consequence || 'Cette action est définitive.'}</p>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" id="del-cancel">Annuler</button>
    <button type="button" class="btn btn-text danger" id="del-yes">${icon('trash')}${opts.confirmLabel || 'Supprimer'}</button></div>
  `);
  document.getElementById('del-cancel').onclick = closeModal;
  document.getElementById('del-yes').onclick = ()=>{ onYes(); closeModal(); };
}
