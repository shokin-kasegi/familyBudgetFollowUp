/* Écouteurs du document (clic, saisie, clavier, glisser-déposer) : ils délèguent aux actions (actions.js). */
import { handleAction } from './actions.js';
import { toggleChat } from './assistant.js';
import { currentUser } from './auth.js';
import { catPalette } from './categories-couleurs.js';
import { addCategory, deleteCategory } from './categories.js';
import { closeUserActionMenus } from './comptes.js';
import { notifOpen, toggleNotifPanel } from './notifications.js';
import { RELEVE_TRANCHE, releveChangerChamp, releveChangerColonne, releveChangerSolde, releveFiltre,
  releveOuvrirFichier, releveRetirerCategorie, setReleveAffichees, setReleveReglesQ } from './releve.js';
import { render } from './routeur.js';
import { currentView, persist, setCurrentView, state } from './store.js';
import { importDataFile } from './sync.js';
import { colFilterOpen, colFilterSearch, setColFilterOpen, setColFilterPending, setColFilterSearch } from './ui/filtres.js';
import { icon } from './ui/icones.js';
import { categoryDropdownListHTML, catFieldVivant, clearFieldError, closeModal, modalFocusables,
  resetCatDropdown, toast } from './ui/modale.js';
import { changeMonth, navigateTo, setMotionInstant, withTransition } from './ui/mouvement.js';
import { dragJustHappened, setDragJustHappened } from './ui/nav.js';
import { syncBulkUI } from './ui/selection.js';
import { addMonths } from './utils.js';
import { drawAnalyseChart } from './views/analyse.js';
import { animateView, chartFilterOpen, dashAfterRender, dashYear, drawYearCharts, setChartFilterOpen,
  setChartFilterPendingChecked, setChartFilterPendingDim, setDashFocusPoste } from './views/dashboard.js';
import { releveAfterRender, releveRedessinerLignes, releveRedessinerRegles } from './views/releve.js';

/* ============================== EVENT HANDLING ============================== */
// Indice visuel de défilement horizontal : un tableau qui déborde (fréquent
// sur mobile, où les colonnes — et parfois les boutons d'action — sortent de
// l'écran) reçoit un léger fondu sur le(s) bord(s) qui cachent du contenu,
// pour signaler qu'on peut faire glisser. Pas de fondu si tout tient déjà,
// et le fondu du côté déjà atteint disparaît une fois qu'on y a défilé.
export function updateTableScrollHints(){
  document.querySelectorAll('.table-wrap').forEach(w=>{
    const canScroll = w.scrollWidth > w.clientWidth + 1;
    const atStart = w.scrollLeft <= 1;
    const atEnd = w.scrollLeft >= w.scrollWidth - w.clientWidth - 1;
    w.classList.toggle('scroll-fade-left', canScroll && !atStart);
    w.classList.toggle('scroll-fade-right', canScroll && !atEnd);
    if(!w.dataset.scrollHintBound){
      w.dataset.scrollHintBound = '1';
      w.addEventListener('scroll', updateTableScrollHints, {passive:true});
    }
  });
}
export function afterRender(){
  // Un souci ponctuel de graphique ou d'animation ne doit jamais interrompre
  // le reste de l'application (notifications, sync...).
  try{
    syncBulkUI();
    updateTableScrollHints();
    if(currentView==='dashboard') dashAfterRender();
    if(currentView==='releve') releveAfterRender();
    else if(currentView!=='dashboard') animateView(); // le tableau de bord anime ses chiffres lui-même, chacun dans son format
    redrawCurrentCharts();
    if(currentView==='analyse'){
      const input = document.getElementById('analyse-search');
      if(input) input.addEventListener('keydown', (e)=>{ if(e.key==='Enter'){ e.preventDefault(); handleAction('run-analyse'); } });
    }
  }catch(e){ console.error('afterRender: erreur non bloquante', e); }
}
// Les graphiques sont en SVG, dessinés à la largeur réelle : on les redessine
// quand la mise en page change (passage téléphone / bureau).
export function redrawCurrentCharts(){
  try{
    if(currentView==='dashboard' || currentView==='annuelle') drawYearCharts();
    if(currentView==='analyse') drawAnalyseChart();
  }catch(e){ console.error('redrawCurrentCharts: erreur non bloquante', e); }
}

let releveRechercheMinuteur = null;

// Écouteurs globaux du module : posés par main.js, dans l'ordre d'origine
// (plusieurs modules écoutent les mêmes événements du document).
export function ecouteursEvenements(){
  document.addEventListener('input', (e)=>{
    if(e.target.id==='releve-recherche' || e.target.id==='releve-regles-recherche'){
      const lignes = e.target.id==='releve-recherche', val = e.target.value;
      clearTimeout(releveRechercheMinuteur);
      releveRechercheMinuteur = setTimeout(()=>{
        if(lignes){ releveFiltre.q = val; setReleveAffichees(RELEVE_TRANCHE); releveRedessinerLignes(); }
        else { setReleveReglesQ(val); releveRedessinerRegles(); }
      }, 120);
      return;
    }
    if(e.target.dataset && e.target.dataset.action==='col-filter-search'){
      setColFilterSearch(e.target.value);
      // Filtre la liste affichée sans re-render complet, pour ne pas perdre le focus pendant la frappe.
      const panel = e.target.closest('.col-filter-panel');
      if(!panel) return;
      panel.querySelectorAll('.cf-list .cf-item[data-value-row]').forEach(row=>{
        const v = row.dataset.valueRow.toLowerCase();
        row.style.display = v.includes(colFilterSearch.toLowerCase()) ? '' : 'none';
      });
    }
  });
  document.addEventListener('change', async (e)=>{
    if(e.target.id==='import-file-input' && e.target.files[0]){ importDataFile(e.target.files[0]); }
    if(e.target.id==='releve-file' && e.target.files[0]){ const f = e.target.files[0]; e.target.value = ''; await releveOuvrirFichier(f); }
    if(e.target.dataset && e.target.dataset.rlChamp){ releveChangerChamp(e.target); }
    if(e.target.dataset && e.target.dataset.rlSolde){ releveChangerSolde(e.target); }
    if(e.target.dataset && e.target.dataset.rlCol){ await releveChangerColonne(e.target); }
  });
  document.addEventListener('dragover', (e)=>{
    const zone = e.target.closest && e.target.closest('.rl-drop');
    if(!zone) return;
    e.preventDefault(); zone.classList.add('is-over');
  });
  document.addEventListener('dragleave', (e)=>{ const zone = e.target.closest && e.target.closest('.rl-drop'); if(zone && !zone.contains(e.relatedTarget)) zone.classList.remove('is-over'); });
  document.addEventListener('drop', async (e)=>{
    const zone = e.target.closest && e.target.closest('.rl-drop');
    if(!zone) return;
    e.preventDefault(); zone.classList.remove('is-over');
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if(f) await releveOuvrirFichier(f);
  });
  document.addEventListener('keydown', async (e)=>{
    if(e.key!=='Enter' || e.isComposing || !e.target.matches || !e.target.matches('.rl-row input[data-rl-champ]')) return;
    e.preventDefault();
    const id = e.target.dataset.rlId;
    await releveChangerChamp(e.target);
    // La ligne a pu être redessinée (montant passé de − à +) : on retrouve son bouton.
    document.querySelector(`.rl-row[data-rl-row="${id}"] [data-action="releve-valider"]`)?.click();
  });
  document.addEventListener('keydown', (e)=>{
    if(e.key!=='Enter' && e.key!==' ') return;
    const el = e.target;
    if(!el.matches || !el.matches('[data-action][tabindex="0"]:not(button)')) return;
    e.preventDefault();
    const sel = `[data-action="${el.dataset.action}"]` + (el.dataset.id ? `[data-id="${el.dataset.id}"]` : '') + (el.dataset.k ? `[data-k="${el.dataset.k}"]` : '');
    setMotionInstant(true); // une action au clavier ne s'anime pas
    try{ el.dispatchEvent(new MouseEvent('click', {bubbles:true})); } finally { setMotionInstant(false); }
    setTimeout(()=>{ const again = document.querySelector(sel); if(again && !again.closest('[hidden]')) again.focus(); }, 60);
  });
  document.addEventListener('keydown', async (e)=>{
    if(e.key!=='ArrowLeft' && e.key!=='ArrowRight') return;
    if(currentView!=='dashboard' || !currentUser() || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if(document.querySelector('#modal-root .modal') || colFilterOpen || chartFilterOpen) return;
    if(e.target.closest && e.target.closest('input,textarea,select,[contenteditable],#sidebar,#island,.ychart')) return;
    e.preventDefault();
    const dir = e.key==='ArrowLeft' ? -1 : 1;
    setMotionInstant(true);
    try{ await changeMonth(addMonths(state.selectedMonth, dir), dir); } finally { setMotionInstant(false); }
  });
  document.addEventListener('keydown', (e)=>{
    // Tab reste à l'intérieur de la modale ouverte (piège de focus).
    if(e.key==='Tab' && document.querySelector('#modal-root .modal')){
      const els = modalFocusables();
      if(!els.length) return;
      const first = els[0], last = els[els.length-1];
      const outside = !els.includes(document.activeElement);
      if(e.shiftKey && (outside || document.activeElement===first)){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && (outside || document.activeElement===last)){ e.preventDefault(); first.focus(); }
      return;
    }
    if(e.target.classList && e.target.classList.contains('cat-add-input') && e.key==='Enter'){
      e.preventDefault();
      e.target.closest('.cat-add-input-row')?.querySelector('[data-cat-add-confirm]')?.click();
      return;
    }
    if(e.key!=='Enter' && e.key!=='Escape') return;
    if(e.isComposing || e.defaultPrevented) return;
    // Raccourcis clavier universels : Entrée valide, Échap annule — sur toutes
    // les fenêtres (modales de saisie, confirmations de suppression, panneaux de filtre).
    const modalOpen = !!document.querySelector('#modal-root .modal');
    if(e.key==='Escape'){
      // Un menu de catégorie ouvert se referme d'abord, sans fermer la modale.
      const openCat = document.querySelector('.cat-select.open');
      if(openCat){ e.preventDefault(); openCat.classList.remove('open'); resetCatDropdown(openCat); return; }
      const openUserMenu = !modalOpen && document.querySelector('.user-row.actions-open');
      if(openUserMenu){ e.preventDefault(); closeUserActionMenus(); openUserMenu.querySelector('.user-more')?.focus(); return; }
      if(modalOpen){ e.preventDefault(); closeModal(); return; }
      const panelCancel = (colFilterOpen || chartFilterOpen) && document.querySelector('[data-action="col-filter-cancel"],[data-action="chart-filter-cancel"]');
      if(panelCancel){ e.preventDefault(); panelCancel.click(); return; }
      if(notifOpen){ e.preventDefault(); toggleNotifPanel(false); return; }
      return;
    }
    // Entrée : on laisse le comportement natif sur les boutons (activation du bouton
    // ciblé) et sur les zones de texte multilignes (retour à la ligne).
    const tag = e.target.tagName;
    if(tag==='BUTTON' || tag==='TEXTAREA' || tag==='A') return;
    if(e.target.closest && e.target.closest('.cat-select.open')) return;
    if(modalOpen){
      const yes = document.getElementById('del-yes');
      if(yes){ e.preventDefault(); yes.click(); return; }
      const form = document.getElementById('modal-form');
      const submit = form?.querySelector('button[type=submit]');
      if(form && submit){ e.preventDefault(); if(!submit.disabled) form.requestSubmit(submit); }
      return;
    }
    const panelOk = document.querySelector('[data-action="col-filter-ok"],[data-action="chart-filter-ok"]');
    if(panelOk && (colFilterOpen || chartFilterOpen)){ e.preventDefault(); panelOk.click(); }
  });
  document.addEventListener('dblclick', async (e)=>{
    if(currentView!=='dashboard') return;
    const el = e.target.closest('#view .poste[data-k^="cat:"], #view .flow .seg[data-k^="cat:"]');
    if(!el) return;
    e.preventDefault();
    window.getSelection?.()?.removeAllRanges();
    const label = el.dataset.k.slice(4);
    const year = dashYear();
    // Un poste peut réunir plusieurs catégories (« Autres », ou celles qui partagent une couleur).
    const cats = catPalette(year).categoriesDe(label);
    state.analyseCats = cats; state.analyseCatLabel = label; state.analyseYear = year;
    setDashFocusPoste(null);
    persist();
    await navigateTo('analyse');
  });
  document.addEventListener('click', (e)=>{
    if(!e.target.closest('.skip-link')) return;
    e.preventDefault();
    document.getElementById('view').focus();
  });
  document.addEventListener('click', async (e)=>{
    if(dragJustHappened){ setDragJustHappened(false); return; } // évite de naviguer juste après un glisser-déposer d'onglet
    if(notifOpen && !e.target.closest('#notif-panel') && !e.target.closest('[data-action="toggle-notif-panel"]')){ toggleNotifPanel(false); }
    if(colFilterOpen && !e.target.closest('.col-filter-panel') && !e.target.closest('[data-action="toggle-col-filter"]')){
      setColFilterOpen(null); setColFilterPending(null); setColFilterSearch('');
      render();
    }
    if(chartFilterOpen && !e.target.closest('.chart-filter-panel') && !e.target.closest('[data-action="toggle-chart-filter"]')){
      setChartFilterOpen(null); setChartFilterPendingDim(null); setChartFilterPendingChecked(null); setColFilterSearch('');
      render();
    }
    document.querySelectorAll('.cat-select.open').forEach(wrap=>{
      if(!e.target.closest('.cat-select')){ wrap.classList.remove('open'); resetCatDropdown(wrap); }
    });
    // Menu « ••• » d'un compte : tout clic hors de son bouton le referme (y compris le choix d'une action).
    if(!e.target.closest('.user-more')) closeUserActionMenus();

    const catToggle = e.target.closest('[data-cat-toggle]');
    if(catToggle){
      const wrap = catToggle.closest('.cat-select');
      const wasOpen = wrap.classList.contains('open');
      document.querySelectorAll('.cat-select.open').forEach(w=>{ w.classList.remove('open'); resetCatDropdown(w); });
      if(!wasOpen) wrap.classList.add('open');
      catToggle.setAttribute('aria-expanded', String(!wasOpen));
      return;
    }
    const rlPick = e.target.closest('[data-rl-pick]');
    if(rlPick){
      const menu = rlPick.closest('.rl-menu');
      const hidden = menu.querySelector('input[data-rl-champ]');
      const wrap = menu.querySelector('.cat-select');
      wrap.classList.remove('open'); resetCatDropdown(wrap);
      if(hidden.value!==rlPick.dataset.rlPick){
        hidden.value = rlPick.dataset.rlPick;
        menu.querySelector('.cat-select-label').textContent = rlPick.textContent;
        menu.querySelectorAll('[data-rl-pick]').forEach(b=>{ const on = b===rlPick; b.setAttribute('aria-selected', String(on)); b.parentElement.classList.toggle('is-selected', on); });
        await releveChangerChamp(hidden);
      }
      document.getElementById(hidden.id)?.closest('.rl-menu').querySelector('[data-cat-toggle]').focus();
      return;
    }
    const catSelectEl = e.target.closest('[data-cat-select]');
    if(catSelectEl){
      const field = catSelectEl.closest('.cat-field');
      const nom = catSelectEl.dataset.catSelect;
      const hidden = document.getElementById('f_'+field.dataset.catKey);
      hidden.value = nom;
      if(hidden.dataset.rlChamp) releveChangerChamp(hidden);
      const label = field.querySelector('.cat-select-label');
      label.textContent = nom; label.classList.remove('is-placeholder');
      const catWrap = field.querySelector('.cat-select');
      catWrap.classList.remove('open'); resetCatDropdown(catWrap);
      clearFieldError(field.dataset.catKey);
      return;
    }
    const catDelBtn = e.target.closest('[data-cat-delete]');
    if(catDelBtn){
      const field = catDelBtn.closest('.cat-field');
      const type = field.dataset.catType;
      const deleted = deleteCategory(type, catDelBtn.dataset.catDelete);
      if(deleted){
        releveRetirerCategorie(type, deleted.nom);
        await persist(); await render();
        // Une ligne du relevé est re-rendue : on reprend son menu, laissé ouvert.
        const live = catFieldVivant(field);
        const hidden = document.getElementById('f_'+live.dataset.catKey);
        if(hidden.value===deleted.nom){
          hidden.value = '';
          const label = live.querySelector('.cat-select-label');
          label.textContent = hidden.dataset.rlChamp ? 'Sans catégorie' : 'Choisir une catégorie'; label.classList.add('is-placeholder');
        }
        live.querySelector('.cat-dropdown').innerHTML = categoryDropdownListHTML(type, hidden.value);
        live.querySelector('.cat-select').classList.add('open');
        toast('Catégorie supprimée — les lignes concernées repassent sans catégorie');
      }
      return;
    }
    const catAddToggle = e.target.closest('[data-cat-add-toggle]');
    if(catAddToggle){
      const dropdown = catAddToggle.closest('.cat-dropdown');
      catAddToggle.hidden = true;
      const inputRow = dropdown.querySelector('.cat-add-input-row');
      inputRow.hidden = false;
      const inp = inputRow.querySelector('.cat-add-input');
      inp.value = ''; inp.focus();
      return;
    }
    const catAddCancel = e.target.closest('[data-cat-add-cancel]');
    if(catAddCancel){
      resetCatDropdown(catAddCancel.closest('.cat-select'));
      return;
    }
    const catAddConfirm = e.target.closest('[data-cat-add-confirm]');
    if(catAddConfirm){
      const field = catAddConfirm.closest('.cat-field');
      const type = field.dataset.catType;
      const inp = catAddConfirm.closest('.cat-add-input-row').querySelector('.cat-add-input');
      const result = addCategory(type, inp.value);
      if(!result.ok){ toast(result.msg); return; }
      const rlHidden = document.getElementById('f_'+field.dataset.catKey);
      if(rlHidden.dataset.rlChamp){ rlHidden.value = result.cat.nom; releveChangerChamp(rlHidden); }
      await persist(); await render();
      const live = catFieldVivant(field);
      const hidden = document.getElementById('f_'+live.dataset.catKey);
      hidden.value = result.cat.nom;
      const label = live.querySelector('.cat-select-label');
      label.textContent = result.cat.nom; label.classList.remove('is-placeholder');
      live.querySelector('.cat-dropdown').innerHTML = categoryDropdownListHTML(type, hidden.value);
      const catWrap = live.querySelector('.cat-select');
      catWrap.classList.remove('open'); resetCatDropdown(catWrap);
      clearFieldError(field.dataset.catKey);
      toast('Catégorie ajoutée');
      return;
    }

    const navBtn = e.target.closest('[data-nav]');
    if(navBtn){ closeSidebarMobile(); await navigateTo(navBtn.dataset.nav); return; }

    const stepBtn = e.target.closest('[data-stepper]');
    if(stepBtn){ const dir = Number(stepBtn.dataset.dir); await changeMonth(addMonths(state.selectedMonth, dir), dir); return; }

    const monthBtn = e.target.closest('[data-goto-month]');
    if(monthBtn){ await changeMonth(monthBtn.dataset.gotoMonth); return; }

    const yearBtn = e.target.closest('[data-year-step]');
    if(yearBtn){
      const t = yearBtn.dataset.yearTarget || 'annuelle';
      const dir = Number(yearBtn.dataset.yearStep);
      if(t==='analyse'){ state.analyseYear = (state.analyseYear||new Date().getFullYear()) + dir; }
      else{ state.selectedYear += dir; }
      persist(); await withTransition('month', dir, ()=>render()); return;
    }

    const burger = e.target.closest('#burger');
    if(burger){ document.getElementById('sidebar').classList.toggle('open'); document.getElementById('overlay-scrim').classList.toggle('show'); return; }
    if(e.target.id==='overlay-scrim'){ closeSidebarMobile(); return; }

    if(e.target.closest('#claude-fab')){ toggleChat(); return; }
    if(e.target.closest('[data-action="close-chat"]')){ toggleChat(false); return; }
    if(e.target.closest('[data-action="close-notif"]')){ toggleNotifPanel(false); return; }
    const pwToggle = e.target.closest('[data-toggle-pw]');
    if(pwToggle){
      const input = document.getElementById(pwToggle.dataset.togglePw);
      if(input){
        const showing = input.type==='text';
        input.type = showing ? 'password' : 'text';
        pwToggle.innerHTML = icon(showing ? 'eye' : 'eyeOff');
      }
      return;
    }
    if(e.target.closest('[data-action="open-parametres"]')){ toggleNotifPanel(false); setCurrentView('parametres'); await render(); return; }

    const actionEl = e.target.closest('[data-action]');
    if(!actionEl) return;
    const action = actionEl.dataset.action, id = actionEl.dataset.id;
    await handleAction(action, id, actionEl);
  });
}
// Import de relevé : le fichier peut aussi être glissé sur la zone de dépôt.
// Entrée dans le libellé d'une ligne du relevé : valide cette ligne.
// Lignes de tableau et notifications cliquables : activables au clavier (Entrée / Espace),
// et le focus est rendu à l'élément équivalent une fois la vue redessinée.
// Tableau de bord : ← et → changent de mois, sans animation (une action
// répétée au clavier ne s'anime jamais).

// Tableau de bord : un double-clic sur un poste (ou son segment) ouvre l'Analyse
// filtrée sur cette catégorie, avec toutes ses lignes de l'année.

// Le lien « Aller au contenu » déplace le focus sans toucher à l'adresse (qui porte la vue courante).
export function closeSidebarMobile(){ document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlay-scrim').classList.remove('show'); }
