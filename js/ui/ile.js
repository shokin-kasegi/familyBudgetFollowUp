/* L'île : menu flottant sur mobile. */
import { currentUser, isAdmin } from '../auth.js';
import { VIEW_COLORS } from '../calculs.js';
import { notifBadgeCount, toggleNotifPanel } from '../notifications.js';
import { MONTH_VIEWS } from '../routeur.js';
import { authState, currentView, state } from '../store.js';
import { avatarHTML } from './avatars.js';
import { icon } from './icones.js';
import { markSVG } from './marque.js';
import { motionOff, navigateTo } from './mouvement.js';
import { orderedNavItems } from './nav.js';
import { setTheme, themeSwatchesHTML } from './themes.js';
import { attrEsc, esc } from '../utils.js';

/* ============================== L'ÎLE ============================== */
let islandOpen = false;
let islandPicking = false;
let islandLastView = null;
function islandItems(){ return [...orderedNavItems(), {id:'parametres', label:'Paramètres', icon:'settings'}]; }
export function renderIsland(){
  const isl = document.getElementById('island');
  if(!isl || islandPicking) return;
  const me = currentUser();
  const badge = notifBadgeCount();
  const item = islandItems().find(n=>n.id===currentView) || {label:'Solde', icon:'dashboard'};
  const color = VIEW_COLORS[currentView];
  const showMonth = typeof MONTH_VIEWS!=='undefined' && MONTH_VIEWS.has(currentView) && state.selectedMonth;
  const changed = islandLastView!==null && islandLastView!==currentView;
  islandLastView = currentView;
  isl.innerHTML = `
    <button class="isl-compact" id="isl-toggle" aria-expanded="${islandOpen}" aria-controls="isl-panel" aria-label="Menu — ${attrEsc(item.label)}">
      ${markSVG()}
      <span class="isl-label${changed?' swap-in':''}">${color?`<i class="dot" style="background:${color}" aria-hidden="true"></i>`:''}<span>${esc(item.label)}</span></span>
      ${showMonth ? `<span class="isl-month">${esc(new Date(Number(state.selectedMonth.slice(0,4)), Number(state.selectedMonth.slice(5,7))-1, 1).toLocaleDateString('fr-FR',{month:'short', year:'numeric'}))}</span>` : `<span class="isl-month"></span>`}
      ${badge>0 ? `<span class="isl-badge" aria-label="${badge} notifications">${badge}</span>` : ''}
      <span class="isl-chev" aria-hidden="true">${icon('chevD')}</span>
    </button>
    <div class="isl-panel" id="isl-panel" ${islandOpen?'':'inert'}>
      <div class="isl-head">${markSVG()}<b>Solde</b>
        <button class="icon-btn" data-island="close" aria-label="Fermer le menu">${icon('x')}</button></div>
      <div class="isl-grid">
        <span class="isl-blob" aria-hidden="true"></span>
        ${islandItems().map((n,i)=>`<button class="isl-item" style="--i:${i}" data-island-nav="${n.id}"${currentView===n.id?' aria-current="page"':''}>${icon(n.icon)}<span>${n.label}</span>${VIEW_COLORS[n.id]?`<i class="vdot" style="background:${VIEW_COLORS[n.id]}" aria-hidden="true"></i>`:''}</button>`).join('')}
      </div>
      <div class="isl-foot">
        <div class="who">${avatarHTML(me, 30)}<span class="n">${esc(me?me.displayName:'')}</span></div>
        ${themeSwatchesHTML()}
        <button class="icon-btn" data-island="notifs" aria-label="Notifications">${icon('bell')}${badge>0?`<span class="isl-badge">${badge}</span>`:''}</button>
        <button class="icon-btn" data-action="logout" aria-label="Se déconnecter">${icon('logout')}</button>
      </div>
    </div>`;
  sizeIsland(false);
  if(islandOpen) placeBlob(isl.querySelector('.isl-item[aria-current="page"]'), false);
}
// L'île passe d'une taille mesurée à l'autre : CSS anime largeur, hauteur et rayon avec un ressort.
function sizeIsland(){
  const isl = document.getElementById('island');
  if(!isl) return;
  const compact = isl.querySelector('.isl-compact');
  if(islandOpen){
    const pw = Math.min(innerWidth - 24, innerWidth <= 640 ? 440 : 600);
    isl.style.setProperty('--pw', pw+'px');
    const panel = isl.querySelector('.isl-panel');
    isl.style.setProperty('--iw', pw+'px');
    isl.style.setProperty('--ih', panel.scrollHeight+'px');
    isl.style.setProperty('--ir', '30px');
  }else{
    // Largeur naturelle du contenu compact, mesurée hors flux.
    compact.style.position='static'; compact.style.width='max-content';
    const w = Math.ceil(compact.getBoundingClientRect().width);
    compact.style.position=''; compact.style.width='';
    isl.style.setProperty('--iw', Math.min(innerWidth - 32, Math.max(180, w))+'px');
    isl.style.setProperty('--ih', '48px');
    isl.style.setProperty('--ir', '24px');
  }
}
function placeBlob(target, animate){
  const blob = document.querySelector('#island .isl-blob');
  if(!blob || !target) { if(blob) blob.style.opacity = 0; return null; }
  const to = {x:target.offsetLeft, y:target.offsetTop, w:target.offsetWidth, h:target.offsetHeight};
  const from = blob._at;
  blob.style.opacity = 1;
  blob.style.width = to.w+'px'; blob.style.height = to.h+'px';
  blob.style.transform = `translate(${to.x}px,${to.y}px)`;
  blob._at = to;
  if(!animate || !from || motionOff()) return null;
  // La goutte s'étire dans le sens du trajet, puis reprend sa forme en rebondissant.
  const dx = to.x - from.x, dy = to.y - from.y;
  const sx = 1 + Math.min(.45, Math.abs(dx)/600), sy = 1 + Math.min(.35, Math.abs(dy)/300);
  return blob.animate([
    {transform:`translate(${from.x}px,${from.y}px) scale(1,1)`},
    {transform:`translate(${from.x+dx*.55}px,${from.y+dy*.55}px) scale(${sx},${2-sx > .7 ? 2-sx : .7})`, offset:.45},
    {transform:`translate(${to.x}px,${to.y}px) scale(${1/sx*.98+.04},${sy})`, offset:.75},
    {transform:`translate(${to.x}px,${to.y}px) scale(1,1)`},
  ], {duration:440, easing:'cubic-bezier(.3,.7,.3,1)'}).finished.catch(()=>{});
}
function setIslandOpen(open, {focus=true}={}){
  if(open===islandOpen) return;
  islandOpen = open;
  const isl = document.getElementById('island');
  if(!isl) return;
  isl.classList.toggle('open', open);
  document.getElementById('island-scrim')?.classList.toggle('show', open);
  isl.querySelector('#isl-toggle')?.setAttribute('aria-expanded', open);
  const panel = isl.querySelector('.isl-panel');
  if(open){ panel.removeAttribute('inert'); toggleNotifPanel(false); }
  else panel.setAttribute('inert','');
  sizeIsland();
  if(open){
    const cur = isl.querySelector('.isl-item[aria-current="page"]');
    const blob = isl.querySelector('.isl-blob'); if(blob) blob._at = null;
    placeBlob(cur, false);
    if(focus) (cur || isl.querySelector('.isl-item'))?.focus({preventScroll:true});
  }else if(focus && isl.contains(document.activeElement)) isl.querySelector('#isl-toggle')?.focus({preventScroll:true});
}
async function pickIslandItem(btn){
  const view = btn.dataset.islandNav;
  if(islandPicking) return;
  if(view===currentView){ setIslandOpen(false); return; }
  islandPicking = true;
  const isl = document.getElementById('island');
  isl.querySelectorAll('.isl-item[aria-current]').forEach(b=>b.removeAttribute('aria-current'));
  btn.setAttribute('aria-current','page');
  btn.classList.add('picked');
  const travel = placeBlob(btn, true);
  if(travel && !motionOff()) await Promise.race([travel, new Promise(r=>setTimeout(r,480))]);
  islandPicking = false;
  setIslandOpen(false, {focus:false});
  isl.classList.remove('bump'); void isl.offsetWidth; if(!motionOff()) isl.classList.add('bump');
  await navigateTo(view);
  document.getElementById('isl-toggle')?.focus({preventScroll:true});
}

// Écouteurs globaux du module : posés par main.js, dans l'ordre d'origine
// (plusieurs modules écoutent les mêmes événements du document).
export function ecouteursIle(){
  document.addEventListener('click', async (e)=>{
    const t = e.target;
    if(t.closest && t.closest('#isl-toggle')){ setIslandOpen(!islandOpen); return; }
    const nav = t.closest && t.closest('[data-island-nav]');
    if(nav){ e.stopPropagation(); await pickIslandItem(nav); return; }
    const sw = t.closest && t.closest('[data-theme-pick]');
    if(sw){ e.stopPropagation(); await setTheme(sw.dataset.themePick); return; }
    const act = t.closest && t.closest('[data-island]');
    if(act){
      e.stopPropagation();
      if(act.dataset.island==='close') setIslandOpen(false);
      if(act.dataset.island==='notifs'){ setIslandOpen(false, {focus:false}); toggleNotifPanel(true); }
      return;
    }
    if(t.id==='island-scrim') setIslandOpen(false);
  }, true);
  document.addEventListener('keydown', (e)=>{
    if(!islandOpen) return;
    if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); setIslandOpen(false); return; }
    // Flèches : on se déplace dans la grille des onglets.
    const items = [...document.querySelectorAll('#island .isl-item')];
    const i = items.indexOf(document.activeElement);
    if(i<0 || !/^Arrow/.test(e.key)) return;
    const cols = getComputedStyle(document.querySelector('#island .isl-grid')).gridTemplateColumns.split(' ').length;
    const d = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-cols, ArrowDown:cols}[e.key];
    const next = items[Math.max(0, Math.min(items.length-1, i+d))];
    e.preventDefault(); next.focus();
  }, true);
  document.addEventListener('focusin', (e)=>{
    if(islandOpen && !e.target.closest('#island')) setIslandOpen(false, {focus:false});
  });
  document.addEventListener('pointermove', (e)=>{
    const isl = document.getElementById('island');
    if(!isl || e.pointerType!=='mouse') return;
    const r = isl.getBoundingClientRect();
    if(e.clientY > r.bottom + 120) return;
    isl.style.setProperty('--mx', Math.round(((e.clientX - r.left)/r.width)*100)+'%');
  }, {passive:true});
  window.addEventListener('resize', ()=>{ sizeIsland(); if(islandOpen) placeBlob(document.querySelector('#island .isl-item[aria-current="page"]'), false); });
}
// Le focus qui quitte l'île la referme.
export function initials(u){
  if(!u) return '?';
  const name = (u.displayName||u.username||'').trim();
  const words = name.split(/\s+/).filter(w=>/\p{L}/u.test(w)); // ignore les mots sans lettre (emoji seul…)
  if(!words.length) return '?';
  const first = w => [...w].find(ch=>/\p{L}/u.test(ch)) || '';
  const pick = words.length>1 ? [words[0], words[words.length-1]] : [words[0]];
  return pick.map(first).join('').toUpperCase();
}
export function visibleUserRows(me){
  // Un admin voit tout le monde. Un membre ne voit que son propre compte.
  if(isAdmin()) return authState.users;
  return authState.users.filter(u=>u.id===me.id);
}
