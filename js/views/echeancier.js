/* Vue Échéancier : charges, abonnements et paiements en plusieurs fois réunis. */
import { aboPrevisions } from '../series/abonnements.js';
import { chgParMois, chgSeriesActives } from '../series/charges.js';
import { ppfAvancement, ppfEtat, ppfIds } from '../series/ppf.js';
import { chgLigneHTML } from '../series/vues-series.js';
import { mine, state } from '../store.js';
import { pageHeadHTML } from '../ui/gabarits.js';
import { icon } from '../ui/icones.js';
import { attrEsc, esc, fmtCount, fmtDate, fmtEUR, moisDe, monthLabel, sumR2 } from '../utils.js';

/* ============================== ÉCHÉANCIER ============================== */
/* Charges, abonnements et paiements en plusieurs fois réunis : ce qui est en
   cours, la prochaine échéance à valider, l'avancement, et ce qui est terminé. */
function aboSeriesActives(){
  return aboPrevisions().map(p=>{
    const versees = mine(state.depenses).filter(d=>d.aboId===p.aboId && !d.prevu).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    return {prevu:p, versees, paye:sumR2(versees, d=>d.montant)};
  }).sort((a,b)=>a.prevu.date.localeCompare(b.prevu.date));
}
export function renderEcheancier(){
  const abos = aboSeriesActives();
  const chgs = chgSeriesActives();
  const chgParMoisTotal = sumR2(chgs, c=>chgParMois(c.prevu));
  const ppfs = ppfIds().map(ppfEtat).filter(e=>e.versees.length);
  const enCours = ppfs.filter(e=>!e.termine && !e.arrete).sort((a,b)=>String(a.prevu?.date||'').localeCompare(String(b.prevu?.date||'')));
  const finis = ppfs.filter(e=>e.termine || e.arrete).sort((a,b)=>String(b.derniere.date).localeCompare(String(a.derniere.date)));
  const parMois = sumR2(abos, a=>a.prevu.montant);
  const resteDu = sumR2(enCours, e=>Math.max(0, e.reste));
  const enTete = [
    chgs.length ? `${fmtCount(chgs.length,'charge','charges')} (<strong>${fmtEUR(chgParMoisTotal)}</strong> par mois)` : '',
    abos.length ? `${fmtCount(abos.length,'abonnement','abonnements')} (<strong>${fmtEUR(parMois)}</strong> par mois)` : '',
    enCours.length ? `${fmtCount(enCours.length,'paiement en plusieurs fois','paiements en plusieurs fois')} (reste <strong>${fmtEUR(resteDu)}</strong>)` : '',
  ].filter(Boolean);
  const finding = enTete.length ? `En cours : ${enTete.length>1 ? enTete.slice(0,-1).join(', ')+' et '+enTete[enTete.length-1] : enTete[0]}.` : 'Aucune charge, aucun abonnement ni paiement en plusieurs fois en cours.';
  const chgHTML = chgs.length ? `<ul class="abo-list">${chgs.map(c=>chgLigneHTML(c.prevu, c)).join('')}</ul>`
    : `<div class="empty-line">Aucune charge en cours. Coche « Charge » en ajoutant une dépense (loyer, énergie, assurance…), ou depuis l’import du relevé.</div>`;
  const aboHTML = abos.length ? `<ul class="abo-list">${abos.map(a=>{ const p = a.prevu; return `<li class="abo-row">
      <div><span class="cell-main">${esc(p.libelle)}</span><span class="cell-sub">Prochain prélèvement le ${fmtDate(p.date)}${p.categorie?` · ${esc(p.categorie)}`:''}${a.versees.length?` · depuis ${monthLabel(moisDe(a.versees[0].date))}, ${fmtEUR(a.paye)} payés`:''}</span></div>
      <span class="num">${fmtEUR(p.montant)}<span class="cell-sub">par mois</span></span>
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm" data-action="abo-valider" data-id="${p.id}">${icon('check')}Valider</button>
        <button class="btn btn-text btn-sm" data-action="abo-prix" data-id="${p.id}">Nouveau prix</button>
        <button class="icon-btn del" data-action="abo-arreter" data-id="${p.id}" aria-label="Arrêter l’abonnement ${attrEsc(p.libelle)}">${icon('x')}</button>
      </div>
    </li>`; }).join('')}</ul>`
    : `<div class="empty-line">Aucun abonnement en cours. Coche « Abonnement » en ajoutant une dépense, ou depuis l’import du relevé.</div>`;
  const ppfHTML = enCours.length ? `<ul class="abo-list">${enCours.map(e=>ppfCarteHTML(e)).join('')}</ul>`
    : `<div class="empty-line">Aucun paiement en plusieurs fois en cours. Coche « Paiement en plusieurs fois » en ajoutant une dépense, ou depuis l’import du relevé.</div>`;
  const finisHTML = finis.length ? `<div class="card mb16">
      <div class="section-head"><h2>${icon('check')}Terminés</h2><span class="side-note">${fmtCount(finis.length,'paiement','paiements')}</span></div>
      <ul class="abo-list">${finis.map(e=>ppfCarteHTML(e)).join('')}</ul>
    </div>` : '';
  return `
    ${pageHeadHTML({title:'Échéancier', finding,
      action:`<button class="btn btn-primary" data-action="add-depense">${icon('plus')}Ajouter une dépense</button>`})}
    <section class="card mb16" aria-labelledby="ech-chg">
      <div class="section-head"><h2 id="ech-chg">${icon('home')}Charges</h2>${chgs.length?`<span class="side-note num">${fmtEUR(chgParMoisTotal)} par mois</span>`:''}</div>
      <p class="field-note" style="margin:-4px 0 8px;">Chaque échéance ne compte qu’une fois validée, à la main ou par l’import du relevé. La suivante est prévue une période plus tard, au montant de la dernière validée ; non validée, elle reste due et passe au mois suivant.</p>
      ${chgHTML}
    </section>
    <section class="card mb16" aria-labelledby="ech-abo">
      <div class="section-head"><h2 id="ech-abo">${icon('repeat')}Abonnements</h2>${abos.length?`<span class="side-note num">${fmtEUR(parMois)} par mois</span>`:''}</div>
      ${aboHTML}
    </section>
    <section class="card mb16" aria-labelledby="ech-ppf">
      <div class="section-head"><h2 id="ech-ppf">${icon('calendar')}Paiements en plusieurs fois</h2>${enCours.length?`<span class="side-note num">reste ${fmtEUR(resteDu)}</span>`:''}</div>
      <p class="field-note" style="margin:-4px 0 8px;">Chaque mensualité ne compte qu’une fois validée, à la main ou par l’import du relevé. La suivante reprend le montant de la dernière validée ; le paiement se clôture quand le total est atteint.</p>
      ${ppfHTML}
    </section>
    ${finisHTML}`;
}
// Un paiement en plusieurs fois : avancement, prochaine mensualité, détail des mensualités validées.
function ppfCarteHTML(e){
  const part = e.total>0 ? Math.min(1, e.paye/e.total) : 0;
  const statut = e.depassement ? `<span class="pill pill-over">Dépassement de ${fmtEUR(e.depassement)}</span>`
    : e.termine ? '<span class="pill pill-teal">Payé</span>' : e.arrete ? '<span class="pill pill-dim">Arrêté</span>' : '';
  const prochain = e.prevu ? `Prochaine mensualité : ${fmtEUR(e.prevu.montant)} le ${fmtDate(e.prevu.date)}` : '';
  const actions = e.prevu ? `
        <button class="btn btn-ghost btn-sm" data-action="ppf-valider" data-id="${e.prevu.id}">${icon('check')}Valider</button>
        <button class="btn btn-text btn-sm" data-action="ppf-total" data-id="${e.ppfId}">Montant total</button>
        <button class="icon-btn del" data-action="ppf-arreter" data-id="${e.ppfId}" aria-label="Arrêter le paiement en plusieurs fois ${attrEsc(e.libelle)}">${icon('x')}</button>`
    : e.depassement ? `<button class="btn btn-text btn-sm" data-action="ppf-total" data-id="${e.ppfId}">Montant total</button>` : '';
  return `<li class="abo-row ppf-row" data-ppf="${e.ppfId}">
      <div><span class="cell-main">${esc(e.libelle)}</span>${statut}<span class="cell-sub">${ppfAvancement(e)}${e.categorie?` · ${esc(e.categorie)}`:''}</span>${prochain?`<span class="cell-sub">${prochain}</span>`:''}</div>
      <span class="num">${e.termine||e.arrete ? fmtEUR(e.paye) : `reste ${fmtEUR(e.reste)}`}</span>
      <div class="row-actions">${actions}</div>
      <span class="track" role="img" aria-label="${attrEsc(`${Math.round(part*100)} % payé`)}"><span class="fill" style="background:${e.depassement?'var(--c-over)':'var(--c-echeances)'};transform:scaleX(${part})"></span></span>
      ${e.depassement ? `<p class="ppf-alerte">Le total des mensualités dépasse le montant total : vérifie les montants saisis ci-dessous, ou corrige le montant total.</p>` : ''}
      <details class="ppf-detail"><summary>Voir les mensualités</summary><ol>${e.versees.map(d=>`<li><span>${fmtDate(d.date)}</span><span class="num">${fmtEUR(d.montant)}</span><button class="icon-btn" data-action="edit-depense" data-id="${d.id}" aria-label="Modifier la mensualité du ${attrEsc(fmtDate(d.date))}">${icon('edit')}</button></li>`).join('')}</ol></details>
    </li>`;
}
