/* Vue Tableau de bord : reste à vivre du mois, graphique annuel, filtre des graphiques, et leurs actions. */
import { categoriesHorsRevenu, dashboardData, depensesDuMois, echeancesDuMois, estHorsRevenu,
  revenusDuMoisListe } from '../calculs.js';
import { anneeData, CAT_AUTRES, catColorBtnHTML, catDot, catGroupesDuMois, catLabel, catPalette,
  openCatCouleur } from '../categories-couleurs.js';
import { myCategoriesDep } from '../categories.js';
import { redrawCurrentCharts, updateTableScrollHints } from '../evenements.js';
import { render } from '../routeur.js';
import { currentView, persist, state } from '../store.js';
import { colFilterSearch, setColFilterSearch } from '../ui/filtres.js';
import { pageHeadHTML } from '../ui/gabarits.js';
import { icon } from '../ui/icones.js';
import { toast } from '../ui/modale.js';
import { bigFmt, changeMonth, motionOff, navigateTo, pctFmt, reduceMotion, swapText, tween,
  tweenValues } from '../ui/mouvement.js';
import { addMonths, attrEsc, esc, fmtCount, fmtEUR, fmtEUR0, isFutureMonth, MONTH_NAMES, monthKey,
  monthLabel, monthName, niceCeil, sp, sumR2, ucfirst } from '../utils.js';

/* ============================== DASHBOARD ============================== */
// Les graphiques SVG sont dessinés à la largeur réelle (initiales des mois
// sous 560 px) : on les redessine après un redimensionnement, avec un léger
// anti-rebond pour ne pas recalculer pendant un redimensionnement continu.
let resizeChartsTimer = null;

// Écouteurs globaux du module : posés par main.js, dans l'ordre d'origine
// (plusieurs modules écoutent les mêmes événements du document).
export function ecouteursDashboard(){
  window.addEventListener('resize', ()=>{
    clearTimeout(resizeChartsTimer);
    resizeChartsTimer = setTimeout(()=>{
      // Un double requestAnimationFrame garantit qu'on attend un cycle de rendu
      // complet du navigateur — le redimensionnement peut faire basculer la mise
      // en page (barre latérale → barre mobile) de façon asynchrone, un peu après
      // le setTimeout lui-même ; sans ça, le graphique se redessine parfois sur
      // des dimensions transitoires, pas encore stabilisées.
      requestAnimationFrame(()=>{ requestAnimationFrame(()=>{ redrawCurrentCharts(); updateTableScrollHints(); }); });
    }, 250);
  });
  if(window.matchMedia){
    const mobileBreakpointQuery = window.matchMedia('(max-width: 880px)');
    mobileBreakpointQuery.addEventListener('change', ()=>{
      requestAnimationFrame(()=>{ requestAnimationFrame(()=>{ redrawCurrentCharts(); }); });
    });
  }
}
// Filet supplémentaire, plus précis qu'un minuteur arbitraire : redessine
// exactement au moment où le seuil mobile/desktop est franchi (correspond au
// point où la barre latérale bascule vers la barre mobile), plutôt que de
// deviner un délai qui couvre ce cas.

/* ---------- Tableau de bord : « combien me reste-t-il ce mois-ci ? » ---------- */
let dashFocusPoste = null;   // poste mis en avant par un clic (segment de la barre)
export function setDashFocusPoste(v){ dashFocusPoste = v; }
let dashEntered = false;     // l'animation d'entrée ne joue qu'une fois par chargement
let dashYearGrown = false;   // idem pour la pousse des colonnes de l'année
const dashPrevWidths = new Map(); // dernières largeurs affichées : les barres repartent de là
export function dashYear(){ return Number(state.selectedMonth.slice(0,4)); }

// Phrase de constat, calculée depuis les chiffres du mois (jamais écrite en dur).
function dashFinding(key, d){
  const mois = monthName(key);
  if(d.entrees<=0.01 && d.report==null) return `Aucun revenu saisi pour ${monthLabel(key)}. <button class="link" data-action="add-revexc">Ajouter un revenu</button>`;
  const resteTxt = v => v<0 ? `<strong>${fmtEUR0(-v)}</strong> de dépassement` : `<strong>${fmtEUR0(v)}</strong> de reste à vivre`;
  if(isFutureMonth(key)) return `Prévision pour ${mois} : ${resteTxt(d.reste)} si rien d’autre n’est ajouté.`;
  const prev = [1,2,3].map(i=>dashboardData(addMonths(key,-i)));
  const avg = prev.reduce((s,p)=>s+p.totalDepenses,0)/3;
  if(avg<=0.01) return `${ucfirst(mois)} : ${resteTxt(d.reste)}.`;
  const diff = d.totalDepenses - avg;
  if(diff > avg*0.15) return `${ucfirst(mois)} : <strong>${fmtEUR0(diff)} de dépenses en plus</strong> que la moyenne des trois mois précédents.`;
  if(diff < -avg*0.15) return `${ucfirst(mois)} : <strong>${fmtEUR0(-diff)} de dépenses en moins</strong> que la moyenne des trois mois précédents.`;
  return `Mois dans la moyenne : ${resteTxt(d.reste)}.`;
}

export function renderDashboard(){
  const key = state.selectedMonth;
  const d = dashboardData(key);
  const enter = dashEntered || reduceMotion.matches ? '' : ' enter';
  const pal = catPalette(dashYear());
  // Du plus gros poste du mois au plus petit, « Autres » en dernier ; chaque catégorie garde sa couleur de l'année.
  const groupes = catGroupesDuMois(d.parCat, pal).sort((a,b)=>(a.label===CAT_AUTRES)-(b.label===CAT_AUTRES) || b.value-a.value);
  // Contrôle : les catégories, les échéances à venir et le solde du mois redonnent exactement les entrées du mois.
  console.assert(Math.abs(sumR2(groupes, g=>g.value) + d.aVenir + d.solde - d.entrees) < 0.005, 'Tableau de bord : catégories + à venir + solde ≠ entrées', key, d);

  // Sans revenu ni solde du compte connu, il n'y a pas de reste à vivre à montrer.
  const noRev = d.entrees<=0.01 && d.report==null;
  const ressources = Math.max(0, d.report||0) + d.entrees;
  const base = Math.max(ressources, d.totalDepenses + d.aVenir) || 1;
  const horsNote = d.horsRevenu>0.004 ? `<div class="hero-hors">+ <b class="num">${fmtEUR(d.horsRevenu)}</b> hors revenu total (${esc([...new Set(revenusDuMoisListe(key).filter(r=>estHorsRevenu(r)).map(r=>r.categorie))].join(', '))}), inclus dans le reste à vivre</div>` : '';
  const mois = monthName(key);
  const nbDe = g => depensesDuMois(key).filter(x=>pal.groupeDe(catLabel(x))===g.label).length;
  const kOf = g => 'cat:'+g.label;
  const widthOf = g => motionOff() || !dashPrevWidths.has(kOf(g)) ? g.value/base : dashPrevWidths.get(kOf(g));
  const n = groupes.length + (d.aVenir>0.004 ? 1 : 0);
  const segs = groupes.map((g,i)=>`<div class="seg${dashFocusPoste===kOf(g)?' hl':''}" data-k="${attrEsc(kOf(g))}" data-w="${g.value/base}" style="background:${pal.couleur(g.label)};width:calc((100% - ${n*3}px) * ${widthOf(g)||0});transition-delay:${motionOff()?0:i*45}ms" title="${attrEsc(g.label)} : ${fmtEUR(g.value)}"></div>`).join('')
    + (d.aVenir>0.004 ? `<div class="seg" data-k="avenir" data-w="${d.aVenir/base}" style="width:calc((100% - ${n*3}px) * ${motionOff() || !dashPrevWidths.has('avenir') ? d.aVenir/base : dashPrevWidths.get('avenir')})" title="À venir : ${fmtEUR(d.aVenir)}"></div>` : '')
    + `<div class="seg${d.reste<0?' over':''}" data-k="reste" title="${d.reste<0?'Dépassement':'Reste à vivre'} : ${fmtEUR(Math.abs(d.reste))}"></div>`;
  const flowLabel = `Répartition ${d.report==null ? 'du revenu' : 'du compte'} en ${mois} : ${groupes.length ? groupes.map(g=>`${g.label} ${fmtEUR(g.value)}`).join(', ') : 'aucune dépense'}${d.aVenir>0.004 ? `, à venir ${fmtEUR(d.aVenir)}` : ''}, ${d.reste<0?'dépassement':'reste'} ${fmtEUR(Math.abs(d.reste))}`;
  // Solde reporté du mois précédent (solde du compte), ou invitation à l'indiquer.
  const moisPrec = monthName(addMonths(key,-1));
  const soldeNote = d.report!=null
    ? `<div class="hero-solde">${d.report<0?'−':'+'} <b class="num" data-dash="report">${fmtEUR(Math.abs(d.report))}</b> ${d.report<0?'de découvert':'restant'} fin ${moisPrec} sur le compte, inclus dans le reste à vivre. <button class="link" data-action="solde-compte">Corriger le solde</button></div>`
    : `<div class="hero-solde">Seules les opérations de ${mois} sont comptées. <button class="link" data-action="solde-compte">Indiquer le solde du compte</button> pour que le reste à vivre corresponde à ta banque.</div>`;

  const postes = groupes.length ? groupes.map(g=>{
    const nb = nbDe(g);
    const sub = `${pctFmt(d.totalDepenses>0 ? g.value/d.totalDepenses : 0)} · ${g.label===CAT_AUTRES ? fmtCount(g.cats,'catégorie','catégories') : fmtCount(nb,'dépense','dépenses')}`;
    return `
    <div class="poste-cell">
    <button class="poste" data-action="focus-poste" data-k="${attrEsc(kOf(g))}" aria-pressed="${dashFocusPoste===kOf(g)}" title="Double-clic : voir les lignes dans Analyse">
      <span class="lbl">${catDot(pal.couleur(g.label))}<span>${esc(g.label)}</span></span>
      <span class="val" data-tween="${attrEsc('poste:'+kOf(g))}" data-v="${g.value}">${fmtEUR(motionOff()||!tweenValues.has('poste:'+kOf(g)) ? g.value : tweenValues.get('poste:'+kOf(g)))}</span>
      <span class="sub">${sub}</span>
    </button>
    ${catColorBtnHTML(g.label, dashYear())}
    </div>`; }).join('') : `<div class="empty-line">Aucune dépense en ${monthLabel(key)}. <button class="link" data-action="add-depense">Ajouter une dépense</button></div>`;

  // Échéances du mois (abonnements, mensualités, charges) : celles à venir sont
  // déduites du reste à vivre ; une prévision passée non validée ne l'est pas.
  const echeances = echeancesDuMois(key);
  const noteEch = (genre, ic, un, plusieurs, fem, nav) => {
    const l = echeances.filter(e=>e.genre===genre); if(!l.length) return '';
    const v = l.filter(e=>e.aVenir), pl = l.length>1 ? 's' : '', e_ = fem ? 'e' : '';
    const compte = !v.length ? `compté${e_}${pl} une fois validé${e_}${pl}`
      : v.length===l.length ? `déduit${e_}${pl} du reste à vivre`
      : `${fmtEUR(sumR2(v,x=>x.montant))} à venir déduits du reste à vivre, le reste compté une fois validé`;
    return `<div class="hero-note">${icon(ic).replace('<svg','<svg style="width:14px;height:14px;vertical-align:-2px;stroke:currentColor;fill:none;stroke-width:1.8;margin-right:6px"')}${fmtCount(l.length,un,plusieurs)} (${fmtEUR(sumR2(l,x=>x.montant))}), ${compte}. <button class="link" data-nav="${nav}">Voir</button></div>`;
  };
  const noteAbos = noteEch('abo', 'repeat', 'abonnement prévu', 'abonnements prévus', false, 'depenses');
  const notePpf = noteEch('ppf', 'calendar', 'mensualité prévue', 'mensualités prévues', true, 'echeancier');
  const noteChg = noteEch('chg', 'home', 'charge prévue', 'charges prévues', true, 'echeancier');

  return `
    <div class="dash">
      <div class="${enter.trim()}">${pageHeadHTML({
        title:'Tableau de bord', finding: dashFinding(key, d), findingKey:'dash-finding',
        stepper: monthStepperHTML(key,'dashboard'),
        action: `<button class="btn btn-primary" data-action="add-depense">${icon('plus')}Ajouter une dépense</button>`,
      })}</div>

      <section class="card hero mb16${enter}" aria-labelledby="hero-l">
        <div class="hero-top">
          <div>
            <div class="hero-label" id="hero-l">${d.reste<0 && !noRev ? 'Reste à vivre · dépassé' : 'Reste à vivre'}</div>
            ${noRev
              ? `<div class="big fig none" data-dash="reste" aria-label="Aucun revenu">—</div>
                 <div class="hero-norev">Aucun revenu saisi pour ${monthLabel(key)}. <button class="link" data-action="add-revexc">Ajouter un revenu</button></div>${soldeNote}`
              : `<div class="big fig${d.reste<0?' over':''}" data-dash="reste" data-tween="reste" data-v="${d.reste}">${bigFmt(motionOff()||!tweenValues.has('reste') ? d.reste : tweenValues.get('reste'))}</div>
                 ${d.entrees>0.01 ? `<div class="hero-of">sur <b class="num" data-dash="revenu">${fmtEUR(d.revenu)}</b> de revenu en ${mois}</div>` : `<div class="hero-of">Aucun revenu saisi en ${mois} pour l’instant. <button class="link" data-action="add-revexc">Ajouter un revenu</button></div>`}${horsNote}${soldeNote}`}
          </div>
          ${noRev || d.revenu<=0.01 ? '' : `<div class="ratio"><div class="pct fig" data-tween="pct" data-v="${(d.totalDepenses+d.aVenir)/d.revenu}">${pctFmt(motionOff()||!tweenValues.has('pct') ? (d.totalDepenses+d.aVenir)/d.revenu : tweenValues.get('pct'))}</div><small>${d.totalDepenses+d.aVenir>d.revenu?'du revenu, dépassé':'du revenu engagé'}</small></div>`}
        </div>
        <div class="flow${dashFocusPoste?' has-focus':''}" data-n="${n}" role="img" aria-label="${attrEsc(flowLabel)}">${segs}</div>
        <h2 class="sr-only">Dépenses par catégorie</h2>
        <div class="postes">${postes}</div>
        ${noteAbos}${notePpf}${noteChg}
      </section>

      <section class="card ychart${enter}${dashYearGrown||reduceMotion.matches?'':' first'}" aria-labelledby="year-h">
        <div class="chart-head">
          <h2 id="year-h">Dépenses par catégorie, ${dashYear()}</h2>
          <div class="chart-head-right"><span class="side-note">Touchez un mois pour l’afficher</span>${chartFilterButtonHTML('revAnnuel', 'Nom du revenu')}</div>
        </div>
        ${chartFilterActive('revAnnuel') ? chartFilterActiveBarHTML('revAnnuel') : ''}
        ${yearLegendHTML(dashYear(), chartFilterActive('revAnnuel'))}
        <div class="ychart-host" data-year="${dashYear()}" data-sel="${key}"></div>
        <div class="note-ex">${yearForecastNote(dashYear())}</div>
      </section>
    </div>`;
}
// Légende du graphique annuel : les catégories de l'année, puis le repère du revenu.
export function yearLegendHTML(year, revFiltre){
  const pal = catPalette(year);
  return `<div class="legend">${pal.groupes.map(g=>`<button type="button" class="legend-item" data-action="cat-couleur" data-g="${attrEsc(g)}" data-year="${year}" title="Changer la couleur">${catDot(pal.couleur(g))}${esc(g)}</button>`).join('')}<span><i class="ln" aria-hidden="true"></i>Revenu${revFiltre?' (filtré)':''}</span></div>`;
}
export function yearForecastNote(year){
  const fut = []; for(let m=1;m<=12;m++){ const k = monthKey(year,m); if(isFutureMonth(k)) fut.push(MONTH_NAMES[m-1]); }
  if(!fut.length) return '';
  if(fut.length===12) return `${year} : prévision`;
  return fut.length===1 ? `${ucfirst(fut[0])} : prévision` : `${ucfirst(fut[0])} à ${fut[fut.length-1]} : prévision`;
}

/* Après insertion : les barres et chiffres partent de leur valeur
   précédente et vont vers la nouvelle (transitions CSS + tween). */
export function dashAfterRender(){
  const view = document.getElementById('view');
  const apply = ()=>{
    const n = Number(view.querySelector('.flow')?.dataset.n)||0;
    view.querySelectorAll('.seg[data-w]').forEach(sg=>{ const w = Number(sg.dataset.w); sg.style.width = `calc((100% - ${n*3}px) * ${w})`; dashPrevWidths.set(sg.dataset.k, w); });
  };
  if(motionOff()) apply(); else requestAnimationFrame(()=>requestAnimationFrame(apply));
  view.querySelectorAll('[data-tween]').forEach(el=>{
    const k = el.dataset.tween, v = Number(el.dataset.v);
    const fmt = k==='reste' ? bigFmt : k==='pct' ? pctFmt : fmtEUR;
    if(!isFinite(v)) return;
    tween(el, k, v, fmt, k==='reste' ? 700 : 600);
  });
  const finding = view.querySelector('[data-swap]');
  if(finding){ const html = finding.innerHTML; swapText(finding, finding.dataset.swap, html); }
  drawYearCharts();
  dashEntered = true;
}

// Toutes les vues : les chiffres marqués data-tween défilent depuis leur valeur précédente.
export function animateView(){
  document.querySelectorAll('#view [data-tween]').forEach(el=>{
    const k = el.dataset.tween, v = Number(el.dataset.v), f = el.dataset.fmt;
    tween(el, k, v, f==='big' ? bigFmt : f==='pct' ? pctFmt : fmtEUR, f==='big' ? 700 : 600);
  });
}

/* ---------- Graphique annuel en SVG : colonnes empilées par poste, revenu en
   repère (trait blanc), mois futurs hachurés. Réutilisé par la Vue annuelle. ---------- */
export const MONTH_SHORT = ['Janv.','Févr.','Mars','Avr.','Mai','Juin','Juil.','Août','Sept.','Oct.','Nov.','Déc.'];
function yearChartSVG(host){
  const year = Number(host.dataset.year), sel = host.dataset.sel, tall = host.dataset.tall==='1';
  const {months} = anneeData(year);
  const pal = catPalette(year);
  const revOf = m => host.dataset.revfilter==='0' ? m.revenu : revAnnuelFilteredTotalForMonth(m.key);
  const narrow = host.clientWidth < 560;
  const W = narrow ? Math.max(300, host.clientWidth) : 1100, H = narrow ? (tall?300:230) : (tall?400:300);
  const padL = narrow ? 34 : 48, padB = 28, padT = 10, plotH = H-padB-padT, plotW = W-padL;
  const step4 = niceCeil(Math.max(...months.map(m=>Math.max(revOf(m), m.totalDepenses)), 1)/4), max = step4*4;
  const step = plotW/12, bw = Math.min(46, step*(narrow?0.62:0.56));
  const y = v => padT + plotH*(1-Math.min(v,max)/max);
  const tick = v => v===0 ? '0' : v>=1000 ? `${sp(String(v/1000).replace('.',','))} k` : String(v);
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="Dépenses de chaque mois de ${year}, par catégorie, avec le revenu en repère"><defs><pattern id="hatch-${year}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#050506" stroke-width="2.4" stroke-opacity=".55"/></pattern></defs><g class="axis">`;
  for(let i=0;i<=4;i++){ const v = step4*i; svg += `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL-10}" y="${y(v)+4}" text-anchor="end">${tick(v)}</text>`; }
  svg += `</g>`;
  months.forEach((mm,i)=>{
    const cx = padL + step*i + step/2, x = cx-bw/2, future = isFutureMonth(mm.key), selected = mm.key===sel;
    let acc = 0, rects = '';
    catGroupesDuMois(mm.parCat, pal).forEach(g=>{ const v = g.value; const y0 = y(acc+v), h = y(acc)-y(acc+v); rects += `<rect class="b" x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(0,h-1.5).toFixed(1)}" rx="3" fill="${pal.couleur(g.label)}" style="animation-delay:${i*35}ms"><title>${esc(g.label)} : ${fmtEUR(v)}</title></rect>`; acc += v; });
    const hatch = future && acc>0 ? `<rect x="${x.toFixed(1)}" y="${y(acc).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(0)-y(acc)).toFixed(1)}" fill="url(#hatch-${year})" pointer-events="none"/>` : '';
    const rev = revOf(mm);
    const label = narrow ? 'JFMAMJJASOND'[i] : MONTH_SHORT[i];
    svg += `<g class="col${sel && !selected?' dim':''}" data-action="goto-month" data-k="${mm.key}" tabindex="0" role="button" aria-pressed="${selected}" aria-label="${monthLabel(mm.key)} : ${fmtEUR(mm.totalDepenses)} de dépenses, ${fmtEUR(rev)} de revenu${future?' (prévision)':''}">
      <rect class="hit" x="${(cx-step/2).toFixed(1)}" y="${padT}" width="${step.toFixed(1)}" height="${plotH+padB}" fill="transparent" rx="8"/>
      ${rects}${hatch}
      ${rev>0 ? `<line class="revline" x1="${(x-6).toFixed(1)}" x2="${(x+bw+6).toFixed(1)}" y1="${y(rev).toFixed(1)}" y2="${y(rev).toFixed(1)}"/>` : ''}
      <text class="mlabel${selected?' sel':''}" x="${cx.toFixed(1)}" y="${H-8}">${label}</text>
    </g>`;
  });
  return svg + `</svg>`;
}
export function drawYearCharts(){
  document.querySelectorAll('#view .ychart-host').forEach(host=>{ host.innerHTML = yearChartSVG(host); });
  if(document.querySelector('#view .ychart.first')) setTimeout(()=>{ document.querySelectorAll('.ychart.first').forEach(c=>c.classList.remove('first')); dashYearGrown = true; }, 1300);
}
export function monthStepperHTML(key, target){
  return `<div class="stepper" role="group" aria-label="Choisir le mois">
    <button data-stepper="${target}" data-dir="-1" aria-label="Mois précédent">${icon('chevL')}</button>
    <span class="label vt-month" aria-live="polite">${monthLabel(key)}${isFutureMonth(key)?'<span class="tag">prévision</span>':''}</span>
    <button data-stepper="${target}" data-dir="1" aria-label="Mois suivant">${icon('chevR')}</button>
  </div>`;
}
export function yearStepperHTML(year, target){
  target = target || 'annuelle';
  return `<div class="stepper" role="group" aria-label="Choisir l\u2019année">
    <button data-year-step="-1" data-year-target="${target}" aria-label="Année précédente">${icon('chevL')}</button>
    <span class="label vt-month" aria-live="polite">${year}</span>
    <button data-year-step="1" data-year-target="${target}" aria-label="Année suivante">${icon('chevR')}</button>
  </div>`;
}

/* ---------- Filtre des graphiques du tableau de bord ---------- */
/* Permet de choisir la dimension de regroupement (catégorie ou nom) et
   d'exclure certaines valeurs de cette dimension, indépendamment pour
   chaque graphique. Même mécanique "Excel" (panneau à cases à cocher,
   validé par OK) que le filtre des tableaux, mais l'état confirmé vit
   dans state.chartFilters plutôt que state.tableFilters. */
export let chartFilterOpen = null;          // clé du graphique dont le panneau est ouvert ('revAnnuel')
export function setChartFilterOpen(v){ chartFilterOpen = v; }
let chartFilterPendingDim = null;    // dimension en cours d'édition dans le panneau ouvert
export function setChartFilterPendingDim(v){ chartFilterPendingDim = v; }
let chartFilterPendingChecked = null; // Set des valeurs cochées (= incluses) pour cette dimension, en cours d'édition
export function setChartFilterPendingChecked(v){ chartFilterPendingChecked = v; }

function chartFilterState(chartKey){
  if(!state.chartFilters) state.chartFilters = {};
  if(!state.chartFilters[chartKey]) state.chartFilters[chartKey] = { dim:'categorie', excluded:{categorie:[], libelle:[]} };
  if(!state.chartFilters[chartKey].excluded) state.chartFilters[chartKey].excluded = {categorie:[], libelle:[]};
  return state.chartFilters[chartKey];
}
function chartFilterActive(chartKey){
  const f = chartFilterState(chartKey);
  return (f.excluded[f.dim]||[]).length>0;
}
function chartValueLabel(item, dim){
  const v = item[dim] && String(item[dim]).trim();
  if(v) return v;
  return dim==='categorie' ? 'Sans catégorie' : (item.libelle || 'Sans nom');
}
function revAnnuelItemsForMonth(key){
  const hors = categoriesHorsRevenu();
  return revenusDuMoisListe(key).filter(r=>!estHorsRevenu(r, hors)).map(r=>({libelle:r.libelle, categorie:r.categorie, montant:Number(r.montant)||0}));
}
function revAnnuelItemsForYear(year){
  const items = [];
  for(let m=1;m<=12;m++) items.push(...revAnnuelItemsForMonth(monthKey(year,m)));
  return items;
}
function chartItemsFor(chartKey){
  if(chartKey==='revAnnuel') return revAnnuelItemsForYear(Number(state.selectedMonth.slice(0,4)));
  return [];
}
function chartDistinctValuesForDim(items, dim){
  const set = new Set(items.map(it=>chartValueLabel(it, dim)));
  return Array.from(set).sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
}
function revAnnuelFilteredTotalForMonth(key){
  const f = chartFilterState('revAnnuel');
  const excluded = new Set(f.excluded[f.dim]||[]);
  return revAnnuelItemsForMonth(key).reduce((s,it)=> excluded.has(chartValueLabel(it, f.dim)) ? s : s + it.montant, 0);
}
function chartFilterButtonHTML(chartKey, secondDimLabel){
  const active = chartFilterActive(chartKey);
  const isOpen = chartFilterOpen === chartKey;
  return `<span class="th-filter-wrap chart-filter-wrap">
    <button class="th-filter-btn ${active?'active':''}" data-action="toggle-chart-filter" data-chart="${chartKey}" title="Filtrer le graphique" aria-label="Filtrer le graphique">${icon('filterDown')}</button>
    ${isOpen ? chartFilterPanelHTML(chartKey, secondDimLabel) : ''}
  </span>`;
}
function chartFilterPanelHTML(chartKey, secondDimLabel){
  const dim = chartFilterPendingDim;
  const values = chartDistinctValuesForDim(chartItemsFor(chartKey), dim);
  const shown = colFilterSearch ? values.filter(v=>v.toLowerCase().includes(colFilterSearch.toLowerCase())) : values;
  const allChecked = shown.length>0 && shown.every(v=>chartFilterPendingChecked.has(v));
  return `
    <div class="col-filter-panel chart-filter-panel" data-chart="${chartKey}">
      <div class="cf-dim-row">
        <button type="button" class="${dim==='categorie'?'active':''}" data-action="chart-filter-set-dim" data-chart="${chartKey}" data-dim="categorie">Catégorie</button>
        <button type="button" class="${dim==='libelle'?'active':''}" data-action="chart-filter-set-dim" data-chart="${chartKey}" data-dim="libelle">${secondDimLabel}</button>
      </div>
      <input type="text" class="cf-search" data-action="col-filter-search" placeholder="Rechercher…" value="${colFilterSearch.replace(/"/g,'&quot;')}">
      <div class="cf-list">
        <label class="cf-item"><input type="checkbox" data-action="chart-filter-toggle-all" data-chart="${chartKey}" ${allChecked?'checked':''}> <strong>(Tout sélectionner)</strong></label>
        ${shown.map(v=>`<label class="cf-item" data-value-row="${attrEsc(v)}"><input type="checkbox" data-action="chart-filter-toggle-value" data-chart="${chartKey}" data-value="${attrEsc(v)}" ${chartFilterPendingChecked.has(v)?'checked':''}> ${esc(v)}</label>`).join('')}
      </div>
      <div class="cf-actions">
        <button class="btn btn-primary btn-sm" data-action="chart-filter-ok" data-chart="${chartKey}">${icon('check')}OK</button>
        <button class="btn btn-ghost btn-sm" data-action="chart-filter-cancel">Annuler</button>
      </div>
    </div>`;
}
function chartFilterActiveBarHTML(chartKey){
  return `<div class="row-actions" style="justify-content:flex-start;margin-bottom:10px;"><button class="btn btn-ghost btn-sm" data-action="clear-chart-filter" data-chart="${chartKey}">${icon('x')}Réinitialiser le filtre</button></div>`;
}

/* ---- Filtre des graphiques du tableau de bord (dimension + exclusion de valeurs) ---- */
async function actionToggleChartFilter(id, el){
  const chartKey = el.dataset.chart;
  if(chartFilterOpen === chartKey){ chartFilterOpen = null; }
  else{
    chartFilterOpen = chartKey;
    setColFilterSearch('');
    const f = chartFilterState(chartKey);
    chartFilterPendingDim = f.dim;
    const all = chartDistinctValuesForDim(chartItemsFor(chartKey), f.dim);
    const excluded = new Set(f.excluded[f.dim] || []);
    chartFilterPendingChecked = new Set(all.filter(v=>!excluded.has(v)));
  }
  await render();
}
async function actionChartFilterSetDim(id, el){
  const chartKey = el.dataset.chart, dim = el.dataset.dim;
  chartFilterPendingDim = dim;
  setColFilterSearch('');
  const f = chartFilterState(chartKey);
  const all = chartDistinctValuesForDim(chartItemsFor(chartKey), dim);
  const excluded = new Set(f.excluded[dim] || []);
  chartFilterPendingChecked = new Set(all.filter(v=>!excluded.has(v)));
  await render();
}
async function actionChartFilterToggleAll(id, el){
  const chartKey = el.dataset.chart;
  const all = chartDistinctValuesForDim(chartItemsFor(chartKey), chartFilterPendingDim);
  const shown = colFilterSearch ? all.filter(v=>v.toLowerCase().includes(colFilterSearch.toLowerCase())) : all;
  const allChecked = shown.every(v=>chartFilterPendingChecked.has(v));
  shown.forEach(v=>{ if(allChecked) chartFilterPendingChecked.delete(v); else chartFilterPendingChecked.add(v); });
  await render();
}
async function actionChartFilterToggleValue(id, el){
  const v = el.dataset.value;
  if(chartFilterPendingChecked.has(v)) chartFilterPendingChecked.delete(v); else chartFilterPendingChecked.add(v);
  await render();
}
async function actionChartFilterOk(id, el){
  const chartKey = el.dataset.chart;
  const dim = chartFilterPendingDim;
  const all = chartDistinctValuesForDim(chartItemsFor(chartKey), dim);
  const f = chartFilterState(chartKey);
  f.dim = dim;
  f.excluded[dim] = (chartFilterPendingChecked.size===all.length) ? [] : all.filter(v=>!chartFilterPendingChecked.has(v));
  chartFilterOpen = null; chartFilterPendingDim = null; chartFilterPendingChecked = null; setColFilterSearch('');
  await persist(); await render();
}
async function actionChartFilterCancel(){
  chartFilterOpen = null; chartFilterPendingDim = null; chartFilterPendingChecked = null; setColFilterSearch('');
  await render();
}
async function actionClearChartFilter(id, el){
  const f = chartFilterState(el.dataset.chart);
  f.excluded = {categorie:[], libelle:[]};
  await persist(); await render();
}
export const actionsGraphiques = {
  'toggle-chart-filter': actionToggleChartFilter,
  'chart-filter-set-dim': actionChartFilterSetDim,
  'chart-filter-toggle-all': actionChartFilterToggleAll,
  'chart-filter-toggle-value': actionChartFilterToggleValue,
  'chart-filter-ok': actionChartFilterOk,
  'chart-filter-cancel': actionChartFilterCancel,
  'clear-chart-filter': actionClearChartFilter,
};

/* ---- Tableau de bord ---- */
function actionCatCouleur(id, el){
  const pal = catPalette(Number(el.dataset.year) || dashYear());
  const noms = new Set(myCategoriesDep().map(c=>c.nom));
  const cats = pal.categoriesDe(el.dataset.g).filter(c=>noms.has(c));
  if(!cats.length){ toast('Cette catégorie n’existe plus : crée-la pour lui donner une couleur'); return; }
  openCatCouleur(cats);
}
function actionFocusPoste(id, el){
  // Met en avant le segment du poste, sans redessiner la vue.
  dashFocusPoste = dashFocusPoste===el.dataset.k ? null : el.dataset.k;
  document.querySelectorAll('#view .poste').forEach(b=>b.setAttribute('aria-pressed', String(b.dataset.k===dashFocusPoste)));
  const flow = document.querySelector('#view .flow');
  if(flow){ flow.classList.toggle('has-focus', !!dashFocusPoste); flow.querySelectorAll('.seg').forEach(sg=>sg.classList.toggle('hl', sg.dataset.k===dashFocusPoste)); }
}
async function actionGotoMonth(id, el){
  // Colonne de l'année : affiche ce mois (depuis la Vue annuelle, ouvre son tableau de bord).
  if(currentView==='annuelle'){ state.selectedMonth = el.dataset.k; persist(); await navigateTo('dashboard'); }
  else await changeMonth(el.dataset.k);
}
export const actionsDashboard = {
  'cat-couleur': actionCatCouleur,
  'focus-poste': actionFocusPoste,
  'goto-month': actionGotoMonth,
};
