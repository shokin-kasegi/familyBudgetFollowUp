/* Marque (logo animé). */

/* ============================== MARQUE ============================== */
// Logo : un anneau à cinq segments, dans les couleurs de la palette.
const MARK_COLORS = ['var(--c-fixe)','var(--c-achats)','var(--c-echeances)','var(--c-joint)','var(--c-epargne)'];
export function markSVG(extraClass){
  const C = 2*Math.PI*11, parts = [.18,.14,.1,.36,.12];
  let off = 0;
  const segs = parts.map((p,i)=>{
    const seg = `<circle cx="15" cy="15" r="11" fill="none" stroke="${MARK_COLORS[i]}" stroke-width="5" stroke-dasharray="${Math.max(0,C*p-2).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 15 15)" style="animation-delay:${i*90}ms"/>`;
    off += C*p; return seg;
  }).join('');
  return `<svg class="mark${extraClass?' '+extraClass:''}" viewBox="0 0 30 30" aria-hidden="true" focusable="false">${segs}</svg>`;
}
// Le logo se dessine segment par segment à la première ouverture de l'écran de connexion.
let authMarkDrawn = false;
export function authBrandHTML(){
  const cls = authMarkDrawn ? '' : 'draw'; authMarkDrawn = true;
  return `<div class="auth-brand">${markSVG(cls)}<div><div class="brand-name">Solde</div></div></div>`;
}
