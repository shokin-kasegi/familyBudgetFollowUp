/* Gabarits des prévisions de séries (abonnements, charges, mensualités) dans les listes. */
import { aboPrevisionsDuMois } from './abonnements.js';
import { chgParMois, chgPeriode, chgPeriodeInfo, chgPrevisionsDuMois } from './charges.js';
import { ppfAvancement, ppfEtat, ppfPrevisionsDuMois } from './ppf.js';
import { icon } from '../ui/icones.js';
import { addMonths, attrEsc, esc, fmtDate, fmtEUR, moisDe, monthLabel, sumR2, ucfirst } from '../utils.js';

// Message après une échéance de charge : la suivante annoncée.
export function chgToast(prev, debut){ return `${debut} · prochaine échéance (${fmtEUR(prev.montant)}) prévue en ${monthLabel(moisDe(prev.date))}`; }
// Message après une mensualité : clôture, ou prochaine mensualité annoncée.
export function ppfToast(e, debut){
  if(e.termine) return `${e.libelle} : payé en entier, paiement clôturé`;
  return `${debut} · reste ${fmtEUR(e.reste)}${e.prevu ? ` · prochaine mensualité (${fmtEUR(e.prevu.montant)}) prévue en ${monthLabel(moisDe(e.prevu.date))}` : ''}`;
}
// Mensualités attendues ce mois-ci : affichées à part, hors des totaux.
export function ppfPrevusHTML(key){
  const prevus = ppfPrevisionsDuMois(key);
  if(!prevus.length) return '';
  return `<div class="card mb16">
    <div class="section-head"><h2>${icon('calendar')}Mensualités prévues</h2><span class="side-note num">${fmtEUR(sumR2(prevus,x=>x.montant))}</span></div>
    <p class="field-note" style="margin:-4px 0 8px;">Pas encore comptées : valide chaque mensualité quand elle passe, ou importe ton relevé. <button class="link" data-nav="echeancier">Voir l’échéancier</button></p>
    <ul class="abo-list">${prevus.map(p=>ppfPrevuLigneHTML(p)).join('')}</ul>
  </div>`;
}
function ppfPrevuLigneHTML(p){
  const e = ppfEtat(p.ppfId);
  return `<li class="abo-row">
      <div><span class="cell-main">${esc(p.libelle)}</span><span class="cell-sub">${fmtDate(p.date)} · ${ppfAvancement(e)} · reste ${fmtEUR(e.reste)}</span></div>
      <span class="num">${fmtEUR(p.montant)}</span>
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm" data-action="ppf-valider" data-id="${p.id}">${icon('check')}Valider</button>
        <button class="btn btn-text btn-sm" data-action="ppf-total" data-id="${p.ppfId}">Montant total</button>
        <button class="icon-btn del" data-action="ppf-arreter" data-id="${p.ppfId}" aria-label="Arrêter le paiement en plusieurs fois ${attrEsc(p.libelle)}">${icon('x')}</button>
      </div>
    </li>`;
}
// Une échéance de charge à valider ; `a` (échéancier) ajoute ce qui a déjà été payé.
export function chgLigneHTML(p, a){
  const per = chgPeriodeInfo(p);
  return `<li class="abo-row" data-chg="${p.chgId}">
      <div><span class="cell-main">${esc(p.libelle)}</span><span class="cell-sub">${a ? 'Prochaine échéance le ' : ''}${fmtDate(p.date)} · ${ucfirst(per.nom)}${p.categorie?` · ${esc(p.categorie)}`:''}${a && a.versees.length?` · depuis ${monthLabel(moisDe(a.versees[0].date))}, ${fmtEUR(a.paye)} payés`:''}</span></div>
      <span class="num">${fmtEUR(p.montant)}<span class="cell-sub">${per.par}${chgPeriode(p)>1 ? ` · ${fmtEUR(chgParMois(p))} par mois` : ''}</span></span>
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm" data-action="chg-valider" data-id="${p.id}">${icon('check')}Valider</button>
        <button class="btn btn-text btn-sm" data-action="chg-montant" data-id="${p.id}">Nouveau montant</button>
        <button class="icon-btn del" data-action="chg-arreter" data-id="${p.id}" aria-label="Arrêter la charge ${attrEsc(p.libelle)}">${icon('x')}</button>
      </div>
    </li>`;
}
// Échéances de charges attendues ce mois-ci : affichées à part, hors des totaux.
export function chgPrevusHTML(key){
  const prevus = chgPrevisionsDuMois(key);
  if(!prevus.length) return '';
  return `<div class="card mb16">
    <div class="section-head"><h2>${icon('home')}Charges prévues</h2><span class="side-note num">${fmtEUR(sumR2(prevus,x=>x.montant))}</span></div>
    <p class="field-note" style="margin:-4px 0 8px;">Pas encore comptées : valide chaque échéance quand elle passe, ou importe ton relevé. Sans validation, elle reste due et passe au mois suivant. <button class="link" data-nav="echeancier">Voir l’échéancier</button></p>
    <ul class="abo-list">${prevus.map(p=>chgLigneHTML(p)).join('')}</ul>
  </div>`;
}
// Prélèvements d'abonnement attendus ce mois-ci : affichés à part, hors des totaux.
export function aboPrevusHTML(key){
  const prevus = aboPrevisionsDuMois(key);
  if(!prevus.length) return '';
  return `<div class="card mb16">
    <div class="section-head"><h2>${icon('repeat')}Abonnements prévus</h2><span class="side-note num">${fmtEUR(sumR2(prevus,x=>x.montant))}</span></div>
    <p class="field-note" style="margin:-4px 0 8px;">Pas encore comptés : valide chaque prélèvement quand il passe, ou importe ton relevé. Sans validation, il est retiré le 1<sup>er</sup> ${monthLabel(addMonths(key,1))}.</p>
    <ul class="abo-list">${prevus.map(p=>`<li class="abo-row">
      <div><span class="cell-main">${esc(p.libelle)}</span><span class="cell-sub">${fmtDate(p.date)}${p.categorie?` · ${esc(p.categorie)}`:''}</span></div>
      <span class="num">${fmtEUR(p.montant)}</span>
      <div class="row-actions">
        <button class="btn btn-ghost btn-sm" data-action="abo-valider" data-id="${p.id}">${icon('check')}Valider</button>
        <button class="btn btn-text btn-sm" data-action="abo-prix" data-id="${p.id}">Nouveau prix</button>
        <button class="icon-btn del" data-action="abo-arreter" data-id="${p.id}" aria-label="Arrêter l’abonnement ${attrEsc(p.libelle)}">${icon('x')}</button>
      </div>
    </li>`).join('')}</ul>
  </div>`;
}
