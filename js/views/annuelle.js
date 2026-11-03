/* Vue annuelle. */
import { categoriesHorsRevenu, soldeAncre, soldeAu } from '../calculs.js';
import { anneeData } from '../categories-couleurs.js';
import { state } from '../store.js';
import { pageHeadHTML } from '../ui/gabarits.js';
import { bigFmt } from '../ui/mouvement.js';
import { currentMonthKey, esc, fmtEUR, fmtEUR0, monthName, r2, sumR2 } from '../utils.js';
import { yearForecastNote, yearLegendHTML, yearStepperHTML } from './dashboard.js';

/* ============================== VUE ANNUELLE ============================== */
// Montant de cellule : au centime, et à l'euro sur téléphone (seule exception).
function amtCell(v, extra, label){ return `<td class="num${extra?' '+extra:''}${v<-0.004 && /key/.test(extra||'')?' neg':''}" data-v="${r2(v)}"${label?` data-label="${label}"`:''}><span class="amt-full">${fmtEUR(v)}</span><span class="amt-short">${fmtEUR0(v)}</span></td>`; }

export function renderAnnuelle(){
  const year = state.selectedYear;
  const {months, totals} = anneeData(year);
  const cur = currentMonthKey();
  const past = months.filter(m=>m.key<=cur);
  const lastPast = past.length ? past[past.length-1].key : null;
  const pastRev = sumR2(past,m=>m.revenu), pastDep = sumR2(past,m=>m.totalDepenses), pastSolde = sumR2(past,m=>m.solde);
  const allFuture = past.length===0, allPast = past.length===12;
  // Solde du compte connu : les soldes affichés sont ceux du compte (report compris),
  // sinon la somme des soldes mensuels de l'année.
  const compte = !!soldeAncre();
  const finAnnee = compte ? soldeAu(`${year}-12-31`) : totals.solde;
  const label = allPast ? (compte ? `Solde du compte fin ${year}` : `Solde de l’année ${year}`) : allFuture ? `Prévision ${year}` : `Solde ${compte?'du compte ':''}à fin ${monthName(lastPast)}`;
  const shown = allFuture ? finAnnee : compte ? soldeAu(`${lastPast}-31`) : pastSolde;
  const finding = allPast ? `${fmtEUR0(totals.revenu)} de revenus et ${fmtEUR0(totals.depenses)} de dépenses sur l’année.`
    : allFuture ? `Année entièrement prévisionnelle, d’après les revenus, dépenses et échéances déjà saisis.`
    : `Prévision fin d’année : <strong>${fmtEUR0(finAnnee)}</strong>${compte?' sur le compte':''}, si rien d’autre n’est ajouté.`;
  return `
    ${pageHeadHTML({title:'Vue annuelle', finding, stepper:yearStepperHTML(year)})}
    <section class="card hero mb16" aria-labelledby="an-l">
      <div class="hero-top">
        <div>
          <div class="hero-label" id="an-l">${label}</div>
          <div class="big fig${shown<0?' over':''}" data-tween="an:solde:${year}" data-fmt="big" data-v="${shown}">${bigFmt(shown)}</div>
        </div>
        <dl class="kv" style="min-width:min(100%,300px);font-size:15px;">
          <dt>Revenus${allFuture||allPast?'':` à fin ${monthName(lastPast)}`}</dt><dd>${fmtEUR(allFuture?totals.revenu:pastRev)}</dd>
          <dt>Dépenses${allFuture||allPast?'':` à fin ${monthName(lastPast)}`}</dt><dd>${fmtEUR(allFuture?totals.depenses:pastDep)}</dd>
          ${allFuture||allPast ? '' : `<dt>Prévision fin d’année</dt><dd>${fmtEUR(finAnnee)}</dd>`}
        </dl>
      </div>
    </section>
    <section class="card ychart mb16" aria-labelledby="an-h">
      <div class="chart-head"><h2 id="an-h">Dépenses par catégorie, ${year}</h2><span class="side-note">Touchez un mois pour l’ouvrir</span></div>
      ${yearLegendHTML(year, false)}
      <div class="ychart-host" data-year="${year}" data-sel="" data-tall="1" data-revfilter="0"></div>
      <div class="note-ex">${yearForecastNote(year)}</div>
    </section>
    <div class="card">
      <div class="table-wrap"><table class="rtable" data-total-col="2" data-name="dépenses">
        <thead><tr><th>Mois</th><th class="num">Revenus</th><th class="num">Dépenses</th><th class="num">Solde</th></tr></thead>
        <tbody>
          ${months.map(m=>{ const fut = m.key>cur; return `<tr class="${m.key===cur?'is-current':''}${fut?' is-future':''}">
            <td><span style="text-transform:capitalize;">${monthName(m.key)}</span>${fut?' <span class="pill pill-dim">prévu</span>':''}</td>
            ${amtCell(m.revenu,'sub first-sub','Revenus')}${amtCell(m.totalDepenses,'sub','Dépenses')}
            ${amtCell(m.solde, 'key')}
          </tr>`; }).join('')}
        </tbody>
        <tfoot><tr><td>Total ${year}</td>${amtCell(totals.revenu,'sub first-sub','Revenus')}${amtCell(totals.depenses,'sub','Dépenses')}${amtCell(totals.solde,'key')}</tr></tfoot>
      </table></div>
      ${totals.horsRevenu>0.004 ? `<p class="field-note" style="margin-top:10px;">Revenus hors ${esc([...categoriesHorsRevenu()].join(', '))} (${fmtEUR(totals.horsRevenu)} sur l’année), comptés dans le solde.</p>` : ''}
    </div>
  `;
}
