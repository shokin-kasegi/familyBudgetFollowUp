/* Vue Analyse : dépenses par libellé sur l'année. */
import { depenseMontantDuMois, mesSorties, POSTE_BY_KEY, posteDot } from '../calculs.js';
import { catLabel } from '../categories-couleurs.js';
import { render } from '../routeur.js';
import { persist, state } from '../store.js';
import { pageHeadHTML } from '../ui/gabarits.js';
import { icon } from '../ui/icones.js';
import { bigFmt, pctFmt } from '../ui/mouvement.js';
import { attrEsc, currentMonthKey, dash, esc, fmtCount, fmtDate, fmtEUR, fmtEUR0, isFutureMonth,
  moisDe, monthKey, monthLabel, monthName, NF_INT, niceCeil, r2, sp, sumR2 } from '../utils.js';
import { MONTH_SHORT, yearStepperHTML } from './dashboard.js';

/* ============================== ANALYSE PAR POSTE DE DÉPENSE ============================== */
/* Vue transversale : combien a été dépensé pour un libellé donné (ex. "Netflix",
   "Tabac"), mois par mois sur une année. */
function analyseSearchableTerms(){
  return Array.from(new Set(mesSorties().map(d=>d.libelle))).filter(Boolean).sort((a,b)=>a.localeCompare(b));
}
function analyseMatchingEntries(term){
  const t = (term||'').trim().toLowerCase();
  if(!t) return [];
  return mesSorties().filter(d=>(d.libelle||'').toLowerCase().includes(t));
}
// Recherche par catégorie (double-clic sur un poste du tableau de bord) :
// state.analyseCats liste les catégories retenues (plusieurs pour « Autres »),
// state.analyseCatLabel le nom affiché. Vide = recherche par libellé.
function analyseCatsActives(){ return Array.isArray(state.analyseCats) && state.analyseCats.length ? state.analyseCats : null; }
function analyseCourantes(){
  const cats = analyseCatsActives();
  if(!cats) return analyseMatchingEntries(state.analyseTerm);
  const set = new Set(cats);
  return mesSorties().filter(d=>set.has(catLabel(d)));
}
function analyseMonthlyTotals(term, year, matches = analyseMatchingEntries(term)){
  const months = [];
  for(let m=1;m<=12;m++){
    const key = monthKey(year,m);
    months.push({key, total: sumR2(matches, d=>depenseMontantDuMois(d, key))});
  }
  return months;
}
/* Moyenne mensuelle sur l'année : on compte à partir du premier mois où le poste
   apparaît (pas les mois d'avant, ni les mois à venir). Un trou de 3 mois ou plus
   sans dépense ne compte pas (le poste avait cessé) ; un trou plus court, si. */
function analyseMoisActifs(months){
  const first = months.findIndex(m=>m.total>0);
  if(first<0) return 0;
  // Les mois à venir ne comptent que jusqu'à la dernière dépense déjà prévue.
  let last = months.length-1;
  while(last>first && isFutureMonth(months[last].key) && !(months[last].total>0)) last--;
  let count = 0, gap = 0;
  for(const m of months.slice(first, last+1)){
    if(m.total>0){ count += 1 + (gap<3 ? gap : 0); gap = 0; }
    else gap++;
  }
  return count + (gap<3 ? gap : 0);
}
function analyseMoyenneMensuelle(months){
  const n = analyseMoisActifs(months);
  return n ? sumR2(months, m=>m.total)/n : 0;
}

/* ---- Analyse ---- */
async function actionRunAnalyse(){
  const val = document.getElementById('analyse-search').value;
  state.analyseTerm = val; state.analyseCats = []; await persist(); await render();
}
async function actionAnalysePick(id, el){
  state.analyseTerm = el.dataset.term; state.analyseCats = []; await persist(); await render();
}
async function actionAnalyseClearCat(){
  state.analyseCats = []; state.analyseCatLabel = ''; await persist(); await render();
}
export const actionsAnalyse = {
  'run-analyse': actionRunAnalyse,
  'analyse-pick': actionAnalysePick,
  'analyse-clear-cat': actionAnalyseClearCat,
};

/* ============================== PARAMÈTRES ============================== */
/* ============================== ANALYSE ============================== */
function analyseTopTerms(year){
  return analyseSearchableTerms()
    .map(t=>({t, total:sumR2(analyseMonthlyTotals(t, year), m=>m.total)}))
    .filter(x=>x.total>0).sort((a,b)=>b.total-a.total).slice(0,8);
}
export function renderAnalyse(){
  const cats = analyseCatsActives();
  const term = cats ? (state.analyseCatLabel || cats.join(', ')) : (state.analyseTerm || '');
  const year = state.analyseYear || new Date().getFullYear();
  const suggestions = analyseSearchableTerms();
  const hasResults = term.trim().length>0;
  const matches = hasResults ? analyseCourantes() : [];
  const months = hasResults ? analyseMonthlyTotals(term, year, matches) : [];
  const yearTotal = sumR2(months, m=>m.total);
  const prevTotal = hasResults ? sumR2(analyseMonthlyTotals(term, year-1, matches), m=>m.total) : 0;
  // Les lignes de l'année qui composent le total, de la plus récente à la plus ancienne.
  const lignes = matches.filter(d=>moisDe(d.date).slice(0,4)===String(year))
    .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const top = analyseTopTerms(year);
  const k = 'achats';
  const evo = !hasResults ? '' : prevTotal>0
    ? `${yearTotal>=prevTotal?'+':'−'}${pctFmt(Math.abs(yearTotal-prevTotal)/prevTotal)} par rapport à ${year-1} (${fmtEUR(prevTotal)})`
    : `Rien en ${year-1}`;
  return `
    ${pageHeadHTML({title:'Analyse', finding:'Combien tu as dépensé pour un poste précis, mois par mois.', stepper: hasResults ? yearStepperHTML(year, 'analyse') : ''})}

    <div class="card mb16">
      <div class="field" style="margin-bottom:12px;"><label for="analyse-search">Poste à analyser</label>
        <div class="kv-input-row">
          <input id="analyse-search" type="search" list="analyse-suggestions" placeholder="Courses, restaurant…" value="${cats ? '' : attrEsc(term)}" enterkeyhint="search" autocomplete="off">
          <button class="btn btn-ghost" data-action="run-analyse">${icon('search')}Chercher</button>
        </div>
        <datalist id="analyse-suggestions">${suggestions.map(x=>`<option value="${attrEsc(x)}">`).join('')}</datalist>
      </div>
      ${cats ? `<div class="chips" style="margin:0 0 12px;"><button class="chip" data-action="analyse-clear-cat" aria-label="Retirer le filtre catégorie ${attrEsc(term)}"><span class="t">Catégorie : ${esc(term)}</span>${icon('x').replace('<svg','<svg style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2"')}</button></div>` : ''}
      ${top.length ? `<div class="field-note" style="margin:0 0 8px;">Les plus coûteux en ${year}</div>
      <div class="chips">${top.map(x=>`<button class="chip" data-action="analyse-pick" data-term="${attrEsc(x.t)}">${posteDot(k)}<span class="t">${esc(x.t)}</span><span class="amt">${fmtEUR0(x.total)}</span></button>`).join('')}</div>` : `<div class="empty-line">Aucune dépense saisie en ${year} pour l’instant.</div>`}
    </div>

    ${!hasResults ? '' : `
    <section class="card hero mb16" aria-labelledby="ana-l">
      <div class="hero-top">
        <div>
          <div class="hero-label" id="ana-l">${cats ? `Catégorie ${esc(term)}` : `« ${esc(term)} »`} en ${year}</div>
          <div class="big fig" style="color:${POSTE_BY_KEY[k].color}" data-tween="ana:${attrEsc(term)}:${year}" data-fmt="big" data-v="${yearTotal}">${bigFmt(yearTotal)}</div>
          <div class="hero-of">${evo}</div>
        </div>
        <div class="ratio"><div class="pct fig">${fmtEUR0(analyseMoyenneMensuelle(months))}</div><small>en moyenne par mois</small></div>
      </div>
    </section>

    <section class="card mb16" aria-labelledby="ana-h">
      <div class="chart-head"><h2 id="ana-h">Mois par mois</h2><span class="side-note">${posteDot(k)} ${POSTE_BY_KEY[k].label}</span></div>
      <div class="ana-host" data-term="${attrEsc(term)}" data-year="${year}" data-k="${k}"></div>
    </section>

    <div class="card mb16">
      <div class="section-head"><h2>${posteDot(k)}Lignes ${year}</h2></div>
      ${lignes.length ? `<div class="table-wrap"><table class="rtable" data-total-col="2" data-name="lignes analysées">
        <thead><tr><th>Libellé</th><th>Catégorie</th><th class="num">Montant</th></tr></thead>
        <tbody>${lignes.map(x=>`<tr${isFutureMonth(moisDe(x.date))?' class="is-future"':''}><td><span class="cell-main">${dash(x.libelle)}</span>${x.date?`<span class="cell-sub">${fmtDate(x.date)}</span>`:''}</td><td class="sub first-sub">${dash(x.categorie)}</td><td class="num key" data-v="${r2(x.montant)}">${fmtEUR(x.montant)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>${fmtCount(lignes.length,'ligne','lignes')}</td><td></td><td class="num key" data-v="${sumR2(lignes,x=>x.montant)}">${fmtEUR(sumR2(lignes,x=>x.montant))}</td></tr></tfoot>
      </table></div>` : `<div class="empty-line">Aucune ligne en ${year}.</div>`}
    </div>

    <div class="card narrow">
      <div class="table-wrap"><table class="rtable" data-total-col="1" data-name="analyse">
        <thead><tr><th>Mois</th><th class="num">Montant</th></tr></thead>
        <tbody>${months.map(m=>`<tr class="${m.key===currentMonthKey()?'is-current':''}${isFutureMonth(m.key)?' is-future':''}"><td style="text-transform:capitalize;">${monthName(m.key)}</td><td class="num key" data-v="${r2(m.total)}">${fmtEUR(m.total)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total ${year}</td><td class="num key" data-v="${yearTotal}">${fmtEUR(yearTotal)}</td></tr></tfoot>
      </table></div>
    </div>
    `}
  `;
}
// Colonnes mensuelles dans la couleur du poste cherché (SVG, sans bibliothèque).
export function drawAnalyseChart(){
  const host = document.querySelector('#view .ana-host');
  if(!host) return;
  const months = analyseMonthlyTotals(host.dataset.term, Number(host.dataset.year), analyseCourantes());
  const color = POSTE_BY_KEY[host.dataset.k].color;
  const narrow = host.clientWidth < 560;
  const W = narrow ? Math.max(300, host.clientWidth) : 1100, H = narrow ? 220 : 260, padL = narrow ? 40 : 56, padB = 28, padT = 10, plotH = H-padB-padT, plotW = W-padL;
  const step4 = niceCeil(Math.max(...months.map(m=>m.total), 1)/4), max = step4*4, step = plotW/12, bw = Math.min(40, step*0.56);
  const y = v => padT + plotH*(1-v/max);
  const tick = v => v===0 ? '0' : v>=1000 ? `${sp(String(v/1000).replace('.',','))} k` : sp(NF_INT.format(v));
  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${attrEsc(host.dataset.term)}, montant de chaque mois de ${host.dataset.year}"><g class="axis">`;
  for(let i=0;i<=4;i++){ const v = step4*i; svg += `<line x1="${padL}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL-10}" y="${y(v)+4}" text-anchor="end">${tick(v)}</text>`; }
  svg += '</g>';
  months.forEach((m,i)=>{
    const cx = padL + step*i + step/2;
    if(m.total>0) svg += `<rect x="${(cx-bw/2).toFixed(1)}" y="${y(m.total).toFixed(1)}" width="${bw.toFixed(1)}" height="${(y(0)-y(m.total)).toFixed(1)}" rx="3" fill="${color}"${isFutureMonth(m.key)?' fill-opacity=".45"':''}><title>${monthLabel(m.key)} : ${fmtEUR(m.total)}</title></rect>`;
    svg += `<text class="mlabel" x="${cx.toFixed(1)}" y="${H-8}">${narrow ? 'JFMAMJJASOND'[i] : MONTH_SHORT[i]}</text>`;
  });
  host.innerHTML = svg + '</svg>';
}
