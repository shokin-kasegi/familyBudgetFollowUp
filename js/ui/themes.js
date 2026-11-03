/* Thèmes (Nuit, Givre, Lagon). */
import { render } from '../routeur.js';
import { motionOff } from './mouvement.js';

/* ============================== THÈMES ============================== */
// Préférence de l'appareil (pas des données du budget) : elle ne se synchronise pas.
export const THEMES = [
  {id:'nuit',  label:'Nuit',  desc:'Noir, verre neutre, coins ronds.', meta:'#050506'},
  {id:'givre', label:'Givre', desc:'Clair, verre dépoli, très arrondi.', meta:'#e8ecf2'},
  {id:'lagon', label:'Lagon', desc:'Bleu-vert, verre teinté, coins nets.', meta:'#031a1e'},
];
export function currentTheme(){ const t = document.documentElement.dataset.theme; return THEMES.some(x=>x.id===t) ? t : 'nuit'; }
export async function setTheme(id){
  if(!THEMES.some(x=>x.id===id) || id===currentTheme()) return;
  const apply = ()=>{
    document.documentElement.dataset.theme = id;
    try{ localStorage.setItem('solde_theme', id); }catch(e){}
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES.find(x=>x.id===id).meta);
    return render();
  };
  // Le nouveau thème s'ouvre en cercle depuis le centre de l'île.
  if(!document.startViewTransition || motionOff()){ await apply(); return; }
  const isl = document.getElementById('island')?.getBoundingClientRect();
  const x = isl ? isl.left + isl.width/2 : innerWidth/2, y = isl ? isl.top + isl.height/2 : 0;
  const r = Math.hypot(Math.max(x, innerWidth-x), Math.max(y, innerHeight-y));
  const t = document.startViewTransition(apply);
  await t.ready;
  document.documentElement.animate({clipPath:[`circle(0 at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`]},
    {duration:620, easing:'cubic-bezier(.23,1,.32,1)', pseudoElement:'::view-transition-new(root)'});
}
export function themeSwatchesHTML(){
  return `<div class="theme-swatches" role="group" aria-label="Thème">${THEMES.map(t=>`<button class="theme-sw" data-theme-pick="${t.id}" aria-pressed="${currentTheme()===t.id}" aria-label="Thème ${t.label}" title="${t.label}"></button>`).join('')}</div>`;
}

// Vignette d'un thème : son fond, son champ de couleur, une carte de verre et la pilule.
export function themePreviewHTML(id){
  const P = {
    nuit:  {bg:'#050506', a:'#4f7bd9', b:'#45b1ad', card:'rgba(255,255,255,.08)', ink:'#f5f5f7', r:10, isl:'#0b0b0e'},
    givre: {bg:'#e8ecf2', a:'#a9bfdc', b:'#e8d6ad', card:'rgba(255,255,255,.6)', ink:'#0c0e12', r:14, isl:'#ffffff'},
    lagon: {bg:'#031a1e', a:'#3f8fa8', b:'#6f9fc8', card:'rgba(110,230,240,.10)', ink:'#ecfdff', r:4, isl:'#06272d'},
  }[id];
  return `<i style="inset:0;background:${P.bg}"></i>
    <i style="width:90px;height:90px;border-radius:50%;left:-20px;top:-30px;background:${P.a};opacity:.55;filter:blur(22px)"></i>
    <i style="width:80px;height:80px;border-radius:50%;right:-10px;bottom:-30px;background:${P.b};opacity:.5;filter:blur(22px)"></i>
    <i style="left:50%;top:8px;width:64px;height:16px;margin-left:-32px;border-radius:9px;background:${P.isl};box-shadow:inset 0 0 0 1px rgba(127,127,127,.3)"></i>
    <i style="left:12px;right:12px;top:34px;bottom:12px;border-radius:${P.r}px;background:${P.card};backdrop-filter:blur(8px);box-shadow:inset 0 1px 0 rgba(255,255,255,.3)"></i>
    <i style="left:24px;top:46px;width:56px;height:20px;border-radius:3px;background:${{nuit:'#d6b77c',givre:'#86661f',lagon:'#e0c285'}[id]}"></i>
    <i style="left:24px;top:74px;width:60%;height:6px;border-radius:3px;background:${P.ink};opacity:.35"></i>`;
}
