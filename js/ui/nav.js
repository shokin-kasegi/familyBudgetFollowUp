/* Navigation : menu latéral, ordre des onglets (glisser-déposer), espaces, et ses actions. */
import { currentUser } from '../auth.js';
import { VIEW_COLORS } from '../calculs.js';
import { notifBadgeCount } from '../notifications.js';
import { render } from '../routeur.js';
import { currentView, persist, setCurrentView, state } from '../store.js';
import { avatarColor } from './avatars.js';
import { icon } from './icones.js';
import { initials, renderIsland } from './ile.js';
import { markSVG } from './marque.js';
import { withTransition } from './mouvement.js';
import { attrEsc, esc } from '../utils.js';
import { setParamSection } from '../views/parametres.js';

/* ============================== SIDEBAR / NAV ============================== */
var currentSpace = 'finance'; // espace actif, non persisté (comme currentView) — repart sur Finance à chaque connexion
export function setCurrentSpace(v){ currentSpace = v; }
export const NAV_FINANCE = [
  {id:'dashboard', label:'Tableau de bord', icon:'dashboard'},
  {id:'revenus', label:'Revenus', icon:'income'},
  {id:'depenses', label:'Dépenses', icon:'wallet'},
  {id:'echeancier', label:'Échéancier', icon:'calendar'},
  {id:'releve', label:'Import relevé', icon:'fileIn'},
  {id:'annuelle', label:'Vue annuelle', icon:'chart'},
  {id:'analyse', label:'Analyse', icon:'search'},
];
const NAV_GROUPES = [
  {id:'groupesListe', label:'Mes groupes', icon:'users'},
];
function navForSpace(space){ return space==='groupes' ? NAV_GROUPES : NAV_FINANCE; }
function defaultViewForSpace(space){ return space==='groupes' ? 'groupesListe' : 'dashboard'; }
export function spaceOfView(view){ return NAV_GROUPES.some(n=>n.id===view) ? 'groupes' : 'finance'; }
export function orderedNavItems(space){
  space = space || currentSpace;
  const nav = navForSpace(space);
  const savedOrder = (state.navOrder && state.navOrder[space]) || [];
  const order = savedOrder.length ? savedOrder : nav.map(n=>n.id);
  const byId = {}; nav.forEach(n=>byId[n.id]=n);
  const ordered = order.filter(id=>byId[id]).map(id=>byId[id]);
  nav.forEach(n=>{ if(!order.includes(n.id)) ordered.push(n); }); // tout nouvel onglet non encore rangé va à la fin
  return ordered;
}
let dragNavId = null, dragOverId = null, dragOverPos = null, dragGhostEl = null;
let dragPending = null;      // { id, el, startX, startY } — clic maintenu, pas encore un vrai glissement
export let dragJustHappened = false; // empêche le clic de navigation juste après un glissement réel
export function setDragJustHappened(v){ dragJustHappened = v; }
const NAV_DRAG_THRESHOLD = 6; // px de mouvement avant de considérer que c'est un glissement, pas un clic
// Au doigt, un glissement immédiat se confond avec le défilement de la barre latérale :
// on attend un appui long (comme pour réorganiser les applis d'un téléphone).
const NAV_LONG_PRESS_MS = 350;
const NAV_LONG_PRESS_TOLERANCE = 10; // px de mouvement tolérés pendant l'appui long avant d'y voir un défilement
function setupNavDragAndDrop(){
  const draggableIds = new Set(navForSpace(currentSpace).map(n=>n.id));
  const items = Array.from(document.querySelectorAll('#sidebar .nav-item[data-nav]')).filter(el=>draggableIds.has(el.dataset.nav));
  items.forEach(el=>{
    el.addEventListener('pointerdown', (e)=>{
      if(e.pointerType==='mouse'){
        if(e.button!==0) return; // clic gauche uniquement
        dragPending = { id: el.dataset.nav, el, startX: e.clientX, startY: e.clientY };
        return;
      }
      cancelNavLongPress();
      dragPending = { id: el.dataset.nav, el, startX: e.clientX, startY: e.clientY, touch: true };
      dragPending.timer = setTimeout(()=>{
        if(!dragPending || dragPending.el!==el) return;
        startNavDrag(dragPending.startX, dragPending.startY);
        if(navigator.vibrate) navigator.vibrate(15);
      }, NAV_LONG_PRESS_MS);
    });
    // Alt + ↑ / ↓ : même réorganisation, au clavier.
    el.addEventListener('keydown', async (e)=>{
      if(!e.altKey || (e.key!=='ArrowUp' && e.key!=='ArrowDown')) return;
      e.preventDefault();
      const ids = orderedNavItems().map(n=>n.id);
      const idx = ids.indexOf(el.dataset.nav);
      const target = ids[idx + (e.key==='ArrowUp' ? -1 : 1)];
      if(!target) return;
      await moveNavItem(el.dataset.nav, target, e.key==='ArrowUp' ? 'before' : 'after');
      document.querySelector(`#sidebar .nav-item[data-nav="${el.dataset.nav}"]`)?.focus();
    });
  });
}
function cancelNavLongPress(){ if(dragPending && dragPending.timer) clearTimeout(dragPending.timer); }
function startNavDrag(x, y){
  dragNavId = dragPending.id;
  dragPending.el.classList.add('nav-dragging');
  createNavDragGhost(dragPending.el, x, y);
}
async function moveNavItem(from, overId, pos){
  const items = orderedNavItems().map(n=>n.id);
  items.splice(items.indexOf(from),1);
  let toIdx = items.indexOf(overId);
  if(pos==='after') toIdx += 1;
  items.splice(toIdx,0,from);
  if(!state.navOrder) state.navOrder = {};
  state.navOrder[currentSpace] = items;
  await persist();
  await render();
}
function createNavDragGhost(el, x, y){
  const rect = el.getBoundingClientRect();
  dragGhostEl = el.cloneNode(true);
  dragGhostEl.classList.remove('nav-dragging');
  dragGhostEl.classList.add('nav-drag-ghost');
  dragGhostEl.style.width = rect.width+'px';
  dragGhostEl.style.left = x+'px';
  dragGhostEl.style.top = y+'px';
  document.body.appendChild(dragGhostEl);
}

// Écouteurs globaux du module : posés par main.js, dans l'ordre d'origine
// (plusieurs modules écoutent les mêmes événements du document).
export function ecouteursNav(){
  document.addEventListener('pointermove', (e)=>{
    if(dragPending && !dragNavId){
      const dx = e.clientX-dragPending.startX, dy = e.clientY-dragPending.startY;
      const dist = Math.sqrt(dx*dx+dy*dy);
      if(dragPending.touch){
        // le doigt a bougé avant la fin de l'appui long : c'est un défilement, pas un glissement
        if(dist > NAV_LONG_PRESS_TOLERANCE){ cancelNavLongPress(); dragPending = null; }
        return;
      }
      if(dist > NAV_DRAG_THRESHOLD){
        // le mouvement dépasse le seuil : ce n'est plus un simple clic, on démarre le glissement
        startNavDrag(e.clientX, e.clientY);
      }
    }
    if(!dragNavId) return;
    if(dragGhostEl){ dragGhostEl.style.left = e.clientX+'px'; dragGhostEl.style.top = e.clientY+'px'; }
    let found = null;
    const draggableIds = new Set(navForSpace(currentSpace).map(n=>n.id));
    document.querySelectorAll('#sidebar .nav-item[data-nav]').forEach(el=>{
      if(!draggableIds.has(el.dataset.nav)) return;
      const rect = el.getBoundingClientRect();
      if(e.clientX>=rect.left && e.clientX<=rect.right && e.clientY>=rect.top && e.clientY<=rect.bottom) found = el;
    });
    if(found){
      const rect = found.getBoundingClientRect();
      dragOverId = found.dataset.nav;
      dragOverPos = e.clientY < rect.top + rect.height/2 ? 'before' : 'after';
      updateNavDropIndicators();
    }
  });
  document.addEventListener('touchmove', (e)=>{ if(dragNavId) e.preventDefault(); }, {passive:false});
  document.addEventListener('contextmenu', (e)=>{ if(dragPending && dragPending.touch && e.target.closest('#sidebar .nav-item')) e.preventDefault(); });
  document.addEventListener('pointerup', ()=>endNavDrag(false));
  document.addEventListener('pointercancel', ()=>endNavDrag(true));
}
function updateNavDropIndicators(){
  document.querySelectorAll('#sidebar .nav-item').forEach(el=>{
    el.classList.remove('drop-before','drop-after');
    if(el.dataset.nav===dragOverId && el.dataset.nav!==dragNavId){
      el.classList.add(dragOverPos==='before' ? 'drop-before' : 'drop-after');
    }
  });
}
// Pendant un glissement au doigt, le navigateur ne doit ni faire défiler ni zoomer.
// L'appui long ne doit pas ouvrir le menu contextuel (Android) pendant qu'on réorganise.
async function endNavDrag(cancelled){
  cancelNavLongPress();
  dragPending = null;
  if(!dragNavId) return;
  const from = dragNavId, overId = dragOverId, pos = dragOverPos;
  dragNavId = null; dragOverId = null; dragOverPos = null;
  dragJustHappened = true; // le 'click' qui va suivre ce relâchement ne doit pas déclencher de navigation
  setTimeout(()=>{ dragJustHappened = false; }, 400); // au doigt, aucun 'click' ne suit toujours
  if(dragGhostEl){ dragGhostEl.remove(); dragGhostEl = null; }
  if(!cancelled && overId && overId!==from){ await moveNavItem(from, overId, pos); return; }
  await render();
}

export function renderSidebar(){
  const sb = document.getElementById('sidebar');
  const me = currentUser();
  const badge = notifBadgeCount();
  document.getElementById('shell').classList.toggle('nav-collapsed', !!state.navCollapsed);
  sb.innerHTML = `
    <div class="brand">
      ${markSVG()}
      <div><div class="brand-name">Solde</div></div>
      <button class="icon-btn" data-action="toggle-sidebar-collapse" title="Masquer la navigation" style="margin-left:auto;" aria-label="Masquer la navigation">${icon('chevL')}</button>
    </div>
    ${/* L'espace Groupes reste masqué tant que la fonction n'existe pas. */''}
    ${orderedNavItems().map(n=>`<button class="nav-item ${currentView===n.id?'active':''}" data-nav="${n.id}"${currentView===n.id?' aria-current="page"':''}>${icon(n.icon)}<span>${n.label}</span>${currentView===n.id && VIEW_COLORS[n.id] ? `<span class="nav-dot" style="background:${VIEW_COLORS[n.id]}" aria-hidden="true"></span>` : ''}</button>`).join('')}
    <div class="nav-spacer"></div>
    <button class="nav-item ${currentView==='parametres'?'active':''}" data-nav="parametres">${icon('settings')}<span>Paramètres</span></button>
    <button class="nav-item" data-action="toggle-notif-panel" style="position:relative;">${icon('bell')}<span>Notifications</span>${badge>0?`<span class="notif-badge">${badge}</span>`:''}</button>
    <div class="sidebar-user">
      <div class="avatar" style="background:${avatarColor(me)}">${initials(me)}</div>
      <div class="info"><div class="name" title="${attrEsc(me?me.displayName:'')}">${esc(me?me.displayName:'')}</div><div class="role">${me?esc(me.role):''}</div></div>
      <button class="icon-btn" data-action="logout" title="Se déconnecter" aria-label="Se déconnecter">${icon('logout')}</button>
    </div>
    <div class="sidebar-foot">Données stockées sur cet appareil, synchronisées via GitHub si connecté.</div>
  `;
  // La barre mobile porte le logo et le nom de l'app : chaque vue a déjà son h1.
  const mobileMark = document.querySelector('.mobile-topbar .mark');
  if(mobileMark && !mobileMark.childElementCount) mobileMark.outerHTML = markSVG();
  setupNavDragAndDrop();
  renderIsland();
}

/* ---- Navigation : espaces, menu latéral, sections des paramètres ---- */
async function actionSwitchSpace(id, el){
  currentSpace = el.dataset.space; setCurrentView(defaultViewForSpace(currentSpace)); await render();
}
async function actionParamSection(id, el){
  setParamSection(el.dataset.sec); await withTransition('view', 0, ()=>render());
}
async function actionToggleSidebarCollapse(){
  state.navCollapsed = !state.navCollapsed; await persist(); await render();
}
async function actionNavMove(id, el){
  const ids = orderedNavItems().map(n=>n.id), i = ids.indexOf(id), j = i + Number(el.dataset.dir);
  if(i<0 || j<0 || j>=ids.length) return;
  await moveNavItem(id, ids[j], Number(el.dataset.dir)>0 ? 'after' : 'before');
  document.querySelector(`[data-action="nav-move"][data-id="${id}"][data-dir="${el.dataset.dir}"]:not(:disabled)`)?.focus();
}
async function actionResetNavOrder(id, el){
  if(state.navOrder) state.navOrder[el.dataset.space||currentSpace] = null; await persist(); await render();
}
export const actionsNavigation = {
  'switch-space': actionSwitchSpace,
  'param-section': actionParamSection,
  'toggle-sidebar-collapse': actionToggleSidebarCollapse,
  'nav-move': actionNavMove,
  'reset-nav-order': actionResetNavOrder,
};
