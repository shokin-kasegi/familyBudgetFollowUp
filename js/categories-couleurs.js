/* Catégories dans les graphiques : regroupement et couleur de chaque catégorie, choix de la couleur. */
import { categoriesHorsRevenu, dashboardData, mesSorties } from './calculs.js';
import { render } from './routeur.js';
import { mine, persist, state } from './store.js';
import { icon } from './ui/icones.js';
import { closeModal, openModal, toast } from './ui/modale.js';
import { attrEsc, esc, monthKey, r2, sumR2 } from './utils.js';
import { dashYear } from './views/dashboard.js';

/* ---------- Catégories dans les graphiques ---------- */
/* Une couleur suit une catégorie, jamais son rang du mois : les six catégories
   qui pèsent le plus sur l'année affichée gardent leur teinte d'un mois à
   l'autre, les autres sont réunies sous « Autres ».
   Une catégorie peut aussi recevoir sa propre couleur (champ `couleur` de la
   catégorie) : elle sort alors du classement, et les catégories qui partagent
   exactement la même couleur sont réunies en un seul poste (« Restaurant + Courses »). */
export const CAT_AUTRES = 'Autres';
// Mêmes teintes que --cat-1…6 (thème sombre), en clair pour pouvoir les comparer aux couleurs choisies.
const CAT_DEFAUTS = ['#3987e5','#d95926','#199e70','#c98500','#d55181','#9085e9'];
export function catLabel(d){ return String(d.categorie||'').trim() || 'Sans catégorie'; }
function catCouleurPerso(nom){
  const c = mine(state.categoriesDepenses).find(x=>x.nom===nom);
  return c && /^#[0-9a-f]{6}$/i.test(c.couleur||'') ? c.couleur.toLowerCase() : null;
}
export function catPalette(year){
  const totaux = new Map();
  mesSorties().forEach(d=>{ if(d.date && d.date.slice(0,4)===String(year)){ const c = catLabel(d); totaux.set(c, (totaux.get(c)||0) + (Number(d.montant)||0)); } });
  const ordre = [...totaux.entries()].filter(([,v])=>v>0.004).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0],'fr')).map(([c])=>c);
  // Couleurs choisies : un poste par couleur, qui réunit ses catégories.
  const parCouleur = new Map();
  const libres = [];
  ordre.forEach(c=>{ const k = catCouleurPerso(c); if(k){ if(!parCouleur.has(k)) parCouleur.set(k, []); parCouleur.get(k).push(c); } else libres.push(c); });
  const couleurs = new Map(), groupeDeCat = new Map(), totalDe = new Map();
  parCouleur.forEach((cats,k)=>{ const g = cats.join(' + '); couleurs.set(g, k); totalDe.set(g, cats.reduce((s,c)=>s+totaux.get(c),0)); cats.forEach(c=>groupeDeCat.set(c, g)); });
  // Les autres catégories gardent la palette par défaut, sans reprendre une teinte déjà choisie.
  const dispo = CAT_DEFAUTS.map((hex,i)=>({hex, v:`var(--cat-${i+1})`})).filter(x=>!parCouleur.has(x.hex));
  const tetes = libres.length>dispo.length+1 ? libres.slice(0, dispo.length) : libres.slice(0, dispo.length+1);
  tetes.forEach((c,i)=>{ couleurs.set(c, i<dispo.length ? dispo[i].v : 'var(--cat-autre)'); groupeDeCat.set(c, c); totalDe.set(c, totaux.get(c)); });
  const groupes = [...totalDe.keys()].sort((a,b)=>totalDe.get(b)-totalDe.get(a));
  if(tetes.length<libres.length) groupes.push(CAT_AUTRES);
  const groupeDe = c => groupeDeCat.get(c) || CAT_AUTRES;
  // Catégories d'un poste (pour choisir laquelle recolorer) : celles de l'année qui y tombent.
  const categoriesDe = g => ordre.filter(c=>groupeDe(c)===g);
  return {groupes, groupeDe, categoriesDe, couleur: g => couleurs.get(g) || 'var(--cat-autre)'};
}
// Montants d'un mois regroupés comme dans la palette : [{label, value, nb}], dans l'ordre de la palette.
export function catGroupesDuMois(parCat, pal){
  const m = new Map();
  parCat.forEach((v,c)=>{ const g = pal.groupeDe(c); const e = m.get(g) || {label:g, value:0, cats:0}; e.value = r2(e.value + v); e.cats++; m.set(g, e); });
  return pal.groupes.filter(g=>m.has(g) && m.get(g).value>0.004).map(g=>m.get(g));
}
// Pastille posée sur le point de couleur d'un poste : ouvre le choix de couleur.
export function catColorBtnHTML(groupe, year){
  return `<button type="button" class="poste-color" data-action="cat-couleur" data-g="${attrEsc(groupe)}" data-year="${year}" aria-label="Changer la couleur de ${attrEsc(groupe)}" title="Changer la couleur"></button>`;
}
/* ---------- Choix de la couleur d'une catégorie ---------- */
/* Pastilles proposées (les seules sur mobile, où il n'y a pas de pipette), une
   intensité de pâle à intense, une couleur libre et, si le navigateur le permet,
   la pipette pour prendre une couleur à l'écran. Reprendre la couleur d'une autre
   catégorie les réunit en un seul poste dans les graphiques : la fenêtre le dit. */
const CAT_PROPOSEES = [...CAT_DEFAUTS, '#e5484d','#2bb3c0','#7fae3a','#a0662f','#6e7bf2','#8a8f98'];
function hexRgb(h){ const n = parseInt(h.slice(1),16); return [n>>16&255, n>>8&255, n&255]; }
function rgbHex(rgb){ return '#'+rgb.map(v=>Math.round(Math.min(255,Math.max(0,v))).toString(16).padStart(2,'0')).join(''); }
// Intensité 0–100 : 50 garde la couleur, en dessous elle pâlit (vers le blanc), au-dessus elle fonce.
function couleurIntensite(hex, t){
  const rgb = hexRgb(hex);
  if(t<50){ const k = (50-t)/50*0.65; return rgbHex(rgb.map(v=>v+(255-v)*k)); }
  const k = (t-50)/50*0.45; return rgbHex(rgb.map(v=>v*(1-k)));
}
// Teinte affichée aujourd'hui pour une catégorie (choisie, ou celle de la palette automatique).
function catCouleurActuelle(nom){
  const perso = catCouleurPerso(nom);
  if(perso) return perso;
  const pal = catPalette(dashYear());
  const v = pal.couleur(pal.groupeDe(nom));
  const m = /^var\((--[\w-]+)\)$/.exec(v);
  const hex = m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim().toLowerCase() : v;
  return /^#[0-9a-f]{6}$/.test(hex) ? hex : '#5c5c63';
}
export function openCatCouleur(cats){
  let nom = cats[0], base, t, finale;
  const autres = () => mine(state.categoriesDepenses).filter(c=>c.nom!==nom && catCouleurPerso(c.nom));
  const nomsDe = hex => autres().filter(c=>catCouleurPerso(c.nom)===hex).map(c=>c.nom);
  openModal('Couleur de la catégorie', [], {}, ()=>{}, `
    <div class="cc-head"><span class="cc-preview" id="cc-preview" aria-hidden="true"></span>
      <div class="cc-head-txt"><div class="cc-name" id="cc-name"></div><div class="cc-assoc" id="cc-assoc" aria-live="polite"></div></div></div>
    ${cats.length>1 ? `<div class="field"><label>Catégorie</label><div class="cc-cats" role="group" aria-label="Catégorie à colorer">${cats.map(c=>`<button type="button" class="chip" data-cc-cat="${attrEsc(c)}">${esc(c)}</button>`).join('')}</div></div>` : ''}
    <div class="field"><label>Couleurs proposées</label><div class="cc-swatches" id="cc-swatches"></div></div>
    <div class="field" id="cc-used-wrap"><label>Déjà associées à une catégorie</label><div class="cc-used" id="cc-used"></div>
      <div class="field-note">Choisir la même couleur réunit les catégories en un seul poste dans les graphiques.</div></div>
    <div class="field"><label for="cc-int">Intensité</label>
      <div class="cc-int-row"><span class="cc-int-end" id="cc-int-a" aria-hidden="true"></span><span>Pâle</span><input type="range" id="cc-int" min="0" max="100" step="1"><span>Intense</span><span class="cc-int-end" id="cc-int-b" aria-hidden="true"></span></div></div>
    <div class="cc-tools">
      <label class="btn btn-ghost cc-libre"><span class="cc-libre-dot" id="cc-libre-dot" aria-hidden="true"></span>Autre couleur<input type="color" id="cc-input"></label>
      ${'EyeDropper' in window ? `<button type="button" class="btn btn-ghost" id="cc-pipette">${icon('pipette')}Pipette</button>` : ''}
    </div>
    <div class="modal-actions cc-actions">
      <button type="button" class="btn btn-text" id="cc-auto">Couleur automatique</button>
      <button type="button" class="btn btn-ghost" id="cc-cancel">Annuler</button>
      <button type="button" class="btn btn-primary" id="cc-save">${icon('check')}Enregistrer</button>
    </div>`);
  const $ = id => document.getElementById(id);
  const swatchBtn = (hex, label) => `<button type="button" class="cc-sw" data-cc-hex="${hex}" style="background:${hex}" aria-label="${attrEsc(label)}" title="${attrEsc(label)}"></button>`;
  function maj(){
    finale = couleurIntensite(base, t);
    $('cc-preview').style.background = finale;
    $('cc-libre-dot').style.background = finale;
    $('cc-name').textContent = nom;
    $('cc-int').value = t;
    $('cc-int').style.setProperty('--cc-c', finale);
    $('cc-int-a').style.background = couleurIntensite(base, 0);
    $('cc-int-b').style.background = couleurIntensite(base, 100);
    $('cc-input').value = finale;
    const avec = nomsDe(finale);
    $('cc-assoc').textContent = avec.length ? `Même couleur que ${avec.join(', ')} : réunies dans le graphique` : (catCouleurPerso(nom) ? 'Couleur choisie' : 'Couleur automatique');
    $('cc-assoc').classList.toggle('on', avec.length>0);
    $('cc-swatches').innerHTML = CAT_PROPOSEES.map(hex=>{ const n = nomsDe(hex); return swatchBtn(hex, n.length ? `${hex}, déjà : ${n.join(', ')}` : hex).replace('class="cc-sw"', `class="cc-sw${n.length?' used':''}"`); }).join('');
    const usees = [...new Set(autres().map(c=>catCouleurPerso(c.nom)))];
    $('cc-used-wrap').hidden = !usees.length;
    $('cc-used').innerHTML = usees.map(hex=>`<button type="button" class="cc-used-row" data-cc-hex="${hex}"><span class="dot" style="background:${hex}" aria-hidden="true"></span><span>${esc(nomsDe(hex).join(', '))}</span></button>`).join('');
    document.querySelectorAll('#modal-root [data-cc-hex]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.ccHex===finale)));
    document.querySelectorAll('#modal-root [data-cc-cat]').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.ccCat===nom)));
    $('cc-auto').hidden = !catCouleurPerso(nom);
  }
  function charger(n){ nom = n; base = catCouleurActuelle(n); t = 50; maj(); }
  const modal = document.querySelector('#modal-root .modal');
  modal.addEventListener('click', e=>{
    const sw = e.target.closest('[data-cc-hex]');
    if(sw){ base = sw.dataset.ccHex; t = 50; maj(); return; }
    const ch = e.target.closest('[data-cc-cat]');
    if(ch) charger(ch.dataset.ccCat);
  });
  $('cc-int').addEventListener('input', e=>{ t = Number(e.target.value); maj(); });
  $('cc-input').addEventListener('input', e=>{ base = e.target.value.toLowerCase(); t = 50; maj(); });
  $('cc-pipette')?.addEventListener('click', async ()=>{
    // La fenêtre s'efface le temps de viser, pour prendre la vraie couleur de l'écran.
    const root = $('modal-root');
    root.style.visibility = 'hidden';
    try{ const r = await new window.EyeDropper().open(); if(/^#[0-9a-f]{6}$/i.test(r.sRGBHex)){ base = r.sRGBHex.toLowerCase(); t = 50; maj(); } }
    catch(e){ /* annulé (Échap) */ }
    finally{ root.style.visibility = ''; }
  });
  const enregistrer = async couleur => {
    const c = mine(state.categoriesDepenses).find(x=>x.nom===nom);
    if(!c){ closeModal(); return; }
    if(couleur) c.couleur = couleur; else delete c.couleur;
    const avec = couleur ? nomsDe(couleur) : [];
    closeModal();
    await persist(); await render();
    toast(avec.length ? `« ${nom} » réunie avec ${avec.join(', ')}` : couleur ? `Couleur de « ${nom} » enregistrée` : `« ${nom} » reprend une couleur automatique`);
  };
  $('cc-cancel').onclick = closeModal;
  $('cc-save').onclick = ()=>enregistrer(finale);
  $('cc-auto').onclick = ()=>enregistrer(null);
  charger(nom);
}
export function catDot(color){ return `<span class="dot" style="background:${color}" aria-hidden="true"></span>`; }
export function anneeData(year){
  const months = [], hors = categoriesHorsRevenu();
  for(let m=1;m<=12;m++){
    const key = monthKey(year,m);
    const d = dashboardData(key, hors);
    months.push({key, ...d});
  }
  const totals = {revenu:sumR2(months,m=>m.revenu), horsRevenu:sumR2(months,m=>m.horsRevenu), depenses:sumR2(months,m=>m.totalDepenses), solde:sumR2(months,m=>m.solde)};
  return {months, totals};
}
