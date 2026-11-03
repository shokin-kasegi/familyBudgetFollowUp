/* Mouvement : transitions de vue et animation des chiffres d'un mois à l'autre. */
import { render } from '../routeur.js';
import { currentView, persist, setCurrentView, state } from '../store.js';
import { setCurrentSpace, spaceOfView } from './nav.js';
import { NF_INT, sp } from '../utils.js';

/* ============================== MOUVEMENT ============================== */
/* Le mouvement montre ce qui change d'un mois à l'autre : les chiffres
   défilent depuis la valeur affichée, les barres se redimensionnent, le mois
   glisse dans le sens du déplacement. Rien ne s'anime au clavier ni avec
   « réduire les animations », et aucune animation ne bloque une action. */
export const reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : {matches:false};
let motionInstant = false; // vrai pendant un changement déclenché au clavier
export function setMotionInstant(v){ motionInstant = v; }
export function motionOff(){ return reduceMotion.matches || motionInstant; }
const easeOutQuart = t => 1-Math.pow(1-t,4);
// Dernière valeur affichée par clé : le rendu reconstruit le DOM, le défilement
// repart donc de la valeur visible (y compris en plein milieu d'un défilement).
export const tweenValues = new Map();
const tweenFrames = new Map();
export function tween(el, key, to, fmt, dur=650){
  if(!el) return;
  cancelAnimationFrame(tweenFrames.get(key));
  const from = tweenValues.has(key) ? tweenValues.get(key) : (motionOff() ? to : 0);
  if(motionOff() || from===to){ el.innerHTML = fmt(to); tweenValues.set(key,to); return; }
  const t0 = performance.now();
  el.innerHTML = fmt(from);
  const step = now => {
    const p = Math.min(1,(now-t0)/dur);
    const v = from + (to-from)*easeOutQuart(p);
    tweenValues.set(key, p<1 ? v : to);
    if(el.isConnected) el.innerHTML = fmt(p<1 ? v : to);
    if(p<1 && el.isConnected) tweenFrames.set(key, requestAnimationFrame(step));
  };
  tweenFrames.set(key, requestAnimationFrame(step));
}
// Grand chiffre : les centimes et le symbole € en exposant.
export function bigFmt(v){
  const neg = v < -0.004, a = Math.abs(v), e = Math.floor(a+1e-9), c = Math.round((a-e)*100);
  const ent = c===100 ? e+1 : e, cts = c===100 ? 0 : c;
  return `${neg?'−':''}${sp(NF_INT.format(ent))}<span class="cents">,${String(cts).padStart(2,'0')}\u00A0€</span>`;
}
export const pctFmt = x => sp(NF_INT.format(Math.round((Number(x)||0)*100))) + '\u00A0%';
// La phrase de constat s'efface puis réapparaît quand elle change.
const swapMemo = new Map();
export function swapText(el, key, html){
  if(!el) return;
  const prev = swapMemo.get(key); swapMemo.set(key, html);
  if(motionOff() || prev===undefined || prev===html){ el.innerHTML = html; return; }
  el.innerHTML = prev; el.classList.add('out');
  setTimeout(()=>{ if(!el.isConnected) return; el.innerHTML = html; el.classList.remove('out'); }, 160);
}
// Transition de vue (fondu + montée) ou de mois (glissement du libellé), si le navigateur sait faire.
export async function withTransition(kind, dir, update){
  const root = document.documentElement;
  if(dir) root.style.setProperty('--dir', dir);
  if(!document.startViewTransition || motionOff()){ await update(); return; }
  root.classList.toggle('vt-view', kind==='view');
  try{
    const t = document.startViewTransition(update);
    await t.updateCallbackDone;
    t.finished.finally(()=>root.classList.remove('vt-view'));
  }catch(e){ root.classList.remove('vt-view'); await update(); }
}
export async function changeMonth(key, dir){
  if(!key || key===state.selectedMonth) return;
  const d = dir || (key > state.selectedMonth ? 1 : -1);
  state.selectedMonth = key;
  persist();
  await withTransition('month', d, ()=>render());
}
export async function navigateTo(view){
  if(view===currentView){ await render(); return; }
  setCurrentView(view);
  if(currentView!=='parametres') setCurrentSpace(spaceOfView(currentView));
  await withTransition('view', 0, ()=>render());
}
