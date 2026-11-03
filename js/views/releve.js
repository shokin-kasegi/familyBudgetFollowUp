/* Vue Import de relevé : lignes à vérifier, filtres, regroupements, apprentissage. */
import { releveJoli, releveSansAccents } from '../releve-lecture.js';
import { RELEVE_TRANCHE, releveAffichees, releveChargerSession, releveFiltre, releveFocusApres,
  releveModele, releveMontantSaisie, relevePrecision, releveReglesQ, releveSaisieSoldesHTML,
  releveSession, releveSoldesHTML, setReleveFocusApres } from '../releve.js';
import { aboSerieOptions } from '../series/abonnements.js';
import { CHG_PERIODES, chgPeriode, chgSerie, chgSerieOptions } from '../series/charges.js';
import { ppfEtat, ppfSerieOptions } from '../series/ppf.js';
import { mine, state } from '../store.js';
import { pageHeadHTML } from '../ui/gabarits.js';
import { icon } from '../ui/icones.js';
import { categoryDropdownListHTML } from '../ui/modale.js';
import { attrEsc, esc, fmtCount, fmtDate } from '../utils.js';
import { emptyRow } from './revenus.js';

/* ---------- Vue ---------- */
const RELEVE_BADGES = {sur:['pill-teal','Reconnue'], appris:['pill-amber','Apprise'], devine:['pill-dim','Devinée'], nouveau:['pill-dim','Nouvelle']};
const RELEVE_TYPES = [{value:'depense', label:'Dépense'}, {value:'revenu', label:'Rentrée'}, {value:'ignorer', label:'Ne pas importer'}];
function releveLigneHTML(l){
  const [cls, lbl] = l.suivi ? ['pill-dim','Déjà suivie'] : RELEVE_BADGES[l.confiance] || RELEVE_BADGES.nouveau;
  const ign = l.v.type==='ignorer';
  const nomLigne = attrEsc(l.v.libelle || l.brut);
  return `<li class="rl-row${ign?' is-ignored':''}${l.maj?' is-maj':''}" data-rl-row="${l.id}">
    <div class="rl-date">${fmtDate(l.date)}</div>
    <div class="rl-lib">
      <input class="rl-ctl" data-rl-id="${l.id}" data-rl-champ="libelle" value="${attrEsc(l.v.libelle)}" aria-label="Libellé" ${ign?'disabled':''}>
      <span class="rl-brut" title="${attrEsc(l.brut)}">${esc(l.brut)}</span>
    </div>
    ${releveMenuHTML(l, 'type', RELEVE_TYPES, l.v.type, `Type de l’opération ${nomLigne}`)}
    ${ign ? '<span class="rl-cat"></span>' : releveCategorieHTML(l, nomLigne)}
    <div class="rl-amt num${l.montant>0?' pos':''}">
      <button type="button" class="rl-signe" data-action="releve-signe" data-id="${l.id}" title="Inverser le sens (+ / −)" aria-label="${l.montant>0?'Rentrée':'Dépense'} — inverser le sens">${l.montant>0?'+':'−'}</button>
      <input class="rl-ctl rl-montant" data-rl-id="${l.id}" data-rl-champ="montant" value="${releveMontantSaisie(l.montant)}" inputmode="decimal" autocomplete="off" aria-label="Montant de ${nomLigne}, en euros" ${ign?'disabled':''}><span class="rl-amt-eur" aria-hidden="true">€</span>
    </div>
    ${ign ? '' : `<input class="rl-ctl rl-note" data-rl-id="${l.id}" data-rl-champ="notes" value="${attrEsc(l.v.notes||'')}" placeholder="Ajouter un commentaire…" aria-label="Commentaire sur ${nomLigne}" maxlength="200">`}
    <div class="rl-meta"><span class="pill ${cls}">${lbl}</span>${l.erreur ? `<span class="rl-raison rl-erreur" role="alert">${esc(l.erreur)}</span>` : l.confiance==='nouveau' && !l.suivi ? '' : `<span class="rl-raison">${esc(l.raison)}</span>`}</div>
    <div class="rl-actions">
      ${l.v.type==='depense' ? `<button type="button" class="rl-abo" data-action="releve-abo" data-id="${l.id}" aria-pressed="${!!l.v.abo}" title="${l.aboPrevId ? 'Valide le prélèvement prévu' : 'Prévoit le même prélèvement le mois suivant'}">${icon('repeat')}Abonnement</button>
      ${l.v.abo ? releveAboMenuHTML(l, nomLigne) : ''}
      <button type="button" class="rl-abo rl-ppf" data-action="releve-ppf" data-id="${l.id}" aria-pressed="${!!l.v.ppf}" title="${l.ppfPrevId ? 'Valide la mensualité prévue' : 'Mensualité d’un paiement en plusieurs fois'}">${icon('calendar')}En plusieurs fois</button>
      ${l.v.ppf ? relevePpfMenuHTML(l, nomLigne) : ''}
      ${l.v.ppf ? `<span class="rl-ppf-total"><input class="rl-ctl" data-rl-id="${l.id}" data-rl-champ="ppfTotal" value="${attrEsc(l.v.ppfTotal||'')}" inputmode="decimal" autocomplete="off" placeholder="Total" aria-label="Montant total à payer pour ${nomLigne}, en euros"><span aria-hidden="true">€</span></span>` : ''}
      <button type="button" class="rl-abo rl-chg" data-action="releve-chg" data-id="${l.id}" aria-pressed="${!!l.v.chg}" title="${l.chgPrevId ? 'Valide l’échéance prévue' : 'Charge : prévoit la prochaine échéance'}">${icon('home')}Charge</button>
      ${l.v.chg ? releveChgMenuHTML(l, nomLigne) : ''}` : ''}
      <button class="btn btn-ghost btn-sm" data-action="releve-valider" data-id="${l.id}">${icon('check')}${ign?'Confirmer':'Valider'}</button>
      ${ign ? '' : `<button class="icon-btn del" data-action="releve-ignorer" data-id="${l.id}" aria-label="Ne pas importer ${nomLigne}">${icon('x')}</button>`}
    </div>
  </li>`;
}
// Choix de la charge d'une ligne marquée charge : nouvelle (avec sa périodicité), ou une en cours.
function releveChgMenuHTML(l, nomLigne){
  const options = chgSerieOptions();
  if(l.chgSerieId && !options.some(o=>o.value===l.chgSerieId)){
    const ref = chgSerie(l.chgSerieId)[0];
    if(ref) options.push({value:l.chgSerieId, label:ref.libelle||'Sans nom'});
  }
  const serie = options.length>1 ? releveMenuHTML(l, 'chgSerie', options, l.chgSerieId||'', `Charge à laquelle correspond ${nomLigne}`) : '';
  const periode = l.chgSerieId ? '' : releveMenuHTML(l, 'chgPeriode', CHG_PERIODES, String(chgPeriode(l.v.chgPeriode)), `Périodicité de la charge ${nomLigne}`);
  return serie + periode;
}
// Choix de l'abonnement d'une ligne marquée abonnement : nouveau, ou un en cours.
function releveAboMenuHTML(l, nomLigne){
  const options = aboSerieOptions();
  if(l.aboSerieId && !options.some(o=>o.value===l.aboSerieId)){
    const ref = mine(state.depenses).find(d=>d.aboId===l.aboSerieId);
    if(ref) options.push({value:l.aboSerieId, label:ref.libelle||'Sans nom'});
  }
  if(options.length<2) return '';
  return releveMenuHTML(l, 'aboSerie', options, l.aboSerieId||'', `Abonnement auquel correspond ${nomLigne}`);
}
// Choix du paiement en plusieurs fois d'une ligne : nouveau, ou un en cours.
function relevePpfMenuHTML(l, nomLigne){
  const options = ppfSerieOptions();
  if(l.ppfSerieId && !options.some(o=>o.value===l.ppfSerieId)){
    const e = ppfEtat(l.ppfSerieId);
    if(e.libelle) options.push({value:l.ppfSerieId, label:e.libelle});
  }
  if(options.length<2) return '';
  return releveMenuHTML(l, 'ppfSerie', options, l.ppfSerieId||'', `Paiement en plusieurs fois auquel correspond ${nomLigne}`);
}
// Menu Type d'une ligne : même liste déroulante que la
// catégorie (la liste native du navigateur détonnait à côté).
function releveMenuHTML(l, champ, options, val, label){
  const cur = options.find(o=>o.value===val) || options[0];
  return `<div class="rl-menu rl-${champ}">
    <input type="hidden" id="rl_${champ}_${l.id}" value="${attrEsc(cur.value)}" data-rl-id="${l.id}" data-rl-champ="${champ}">
    <div class="cat-select">
      <button type="button" class="cat-select-btn rl-ctl" data-cat-toggle aria-haspopup="listbox" aria-expanded="false" aria-label="${label}">
        <span class="cat-select-label">${esc(cur.label)}</span>
        ${icon('chevD')}
      </button>
      <div class="cat-dropdown" role="listbox">${options.map(o=>`<div class="cat-option${o.value===cur.value?' is-selected':''}"><button type="button" class="cat-option-label" role="option" aria-selected="${o.value===cur.value}" data-rl-pick="${attrEsc(o.value)}">${esc(o.label)}</button></div>`).join('')}</div>
    </div>
  </div>`;
}
// Même menu de catégorie que dans les formulaires : on y choisit, ajoute
// (« Autre… ») ou supprime une catégorie sans quitter la ligne du relevé.
function releveCategorieHTML(l, nomLigne){
  const key = 'rlcat_'+l.id, val = l.v.categorie || '';
  return `<div class="cat-field rl-cat" data-cat-type="${l.v.type==='revenu' ? 'revenus' : 'depenses'}" data-cat-key="${key}">
    <input type="hidden" id="f_${key}" value="${attrEsc(val)}" data-rl-id="${l.id}" data-rl-champ="categorie">
    <div class="cat-select">
      <button type="button" class="cat-select-btn rl-ctl" data-cat-toggle aria-expanded="false" aria-label="Catégorie de ${nomLigne}">
        <span class="cat-select-label ${val?'':'is-placeholder'}">${val?esc(val):'Sans catégorie'}</span>
        ${icon('chevD')}
      </button>
      <div class="cat-dropdown">${categoryDropdownListHTML(l.v.type==='revenu' ? 'revenus' : 'depenses', val)}</div>
    </div>
  </div>`;
}
function releveColonnesHTML(s){
  const {entete, nbCol, rows, col} = s.csv;
  const nomCol = i => entete && entete[i] ? entete[i] : `Colonne ${i+1}${rows[0] && rows[0][i] ? ` (${String(rows[0][i]).slice(0,18)})` : ''}`;
  const sel = (champ, val, label, vide) => `<div class="field"><label for="rl-col-${champ}">${label}</label><select id="rl-col-${champ}" data-rl-col="${champ}">${vide?`<option value="-1"${val<0?' selected':''}>Aucune</option>`:''}${[...Array(nbCol).keys()].map(i=>`<option value="${i}"${i===val?' selected':''}>${esc(nomCol(i))}</option>`).join('')}</select></div>`;
  const deux = col.montant<0;
  return `<details class="rl-cols"${s.formatConnu?'':' open'}>
    <summary>${s.formatConnu ? 'Format reconnu — colonnes utilisées' : 'Nouveau format : vérifie les colonnes'}</summary>
    <div class="rl-cols-grid">
      ${sel('date', col.date, 'Date')}
      ${sel('libelle', col.libelle, 'Libellé')}
      ${sel('libelle2', col.libelle2, 'Complément de libellé', true)}
      <div class="field"><label for="rl-col-montantMode">Montant</label><select id="rl-col-montantMode" data-rl-col="montantMode"><option value="un"${deux?'':' selected'}>Une colonne (signée)</option><option value="deux"${deux?' selected':''}>Débit et Crédit séparés</option></select></div>
      ${deux ? sel('debit', col.debit, 'Débit') + sel('credit', col.credit, 'Crédit') : sel('montant', col.montant, 'Colonne du montant')}
    </div>
    <div class="field-note">Ton choix est retenu : les prochains relevés de ce format seront lus directement.</div>
  </details>`;
}
function releveApprentissageHTML(modele){
  const regles = Object.entries(modele.regles).sort((a,b)=>(b[1].maj||'').localeCompare(a[1].maj||'') || b[1].n-a[1].n);
  const nbFormats = Object.keys(modele.formats).length;
  const h = modele.historique;
  const recente = relevePrecision(h, 30), debut = h.length>=60 ? h.slice(0,30).reduce((a,b)=>a+b,0)/30 : null;
  if(!regles.length && !nbFormats) return `<div class="card"><div class="section-head"><h2>Ce que Solde apprend</h2></div>
    <p class="field-note" style="margin:0;">À chaque ligne validée, Solde retient comment lire le fichier de ta banque, le nom et la catégorie que tu donnes à chaque commerçant, et les lignes que tu préfères ne pas importer. Au fil des relevés, il y a de moins en moins à corriger.</p></div>`;
  return `<div class="card">
    <div class="section-head"><h2>Ce que Solde a appris</h2>
      <button class="btn btn-text btn-sm danger" data-action="releve-oublier-tout">Tout oublier</button></div>
    <dl class="kv" style="max-width:520px;margin-bottom:16px;">
      <dt>Commerçants reconnus</dt><dd>${regles.filter(([,r])=>r.type!=='ignorer').length}</dd>
      <dt>Lignes ignorées d’office</dt><dd>${regles.filter(([,r])=>r.type==='ignorer').length}</dd>
      <dt>Formats de fichier</dt><dd>${nbFormats}</dd>
      ${recente!==null ? `<dt>Suggestions justes</dt><dd>${Math.round(recente*100)} %${debut!==null ? ` <span class="side-note">(${Math.round(debut*100)} % au début)</span>` : ''}</dd>` : ''}
    </dl>
    ${regles.length ? `<input type="search" class="rl-ctl rl-recherche" id="releve-regles-recherche" value="${attrEsc(releveReglesQ)}" placeholder="Chercher un commerçant ou une catégorie…" aria-label="Chercher dans ce que Solde a appris" autocomplete="off" enterkeyhint="search">
    <div id="rl-regles">${releveReglesHTML(modele)}</div>` : ''}
  </div>`;
}
// Commerçants appris, regroupés par catégorie (rentrées et lignes ignorées à part).
function releveReglesHTML(modele){
  const q = releveNorm(releveReglesQ);
  const groupeDe = r => r.type==='ignorer' ? 'Ne pas importer' : `${r.categorie||'Sans catégorie'}${r.type==='revenu' ? ' · rentrées' : ''}`;
  const regles = Object.entries(modele.regles)
    .filter(([cle,r])=>!q || q.split(/\s+/).every(m=>[cle, r.libelle, r.categorie, groupeDe(r)].some(c=>releveNorm(c).includes(m))))
    .sort((a,b)=>String(a[1].libelle||releveJoli(a[0])).localeCompare(String(b[1].libelle||releveJoli(b[0])),'fr'));
  if(!regles.length) return `<div class="empty-line">Aucun commerçant appris ne correspond à « ${esc(releveReglesQ)} ».</div>`;
  const m = new Map();
  regles.forEach(e=>{ const g = groupeDe(e[1]); if(!m.has(g)) m.set(g, []); m.get(g).push(e); });
  const rang = g => g==='Ne pas importer' ? 2 : /rentrées$/.test(g) ? 1 : 0;
  return [...m.entries()].sort((a,b)=>rang(a[0])-rang(b[0]) || a[0].localeCompare(b[0],'fr')).map(([g, es])=>`<section class="rl-groupe" aria-label="${attrEsc(g)}">
    <div class="rl-groupe-head"><h3>${esc(g)}</h3><span class="side-note">${fmtCount(es.length, 'commerçant', 'commerçants')}</span></div>
    <ul class="rl-rules">${es.map(([cle,r])=>`<li>
      <span class="rl-rule-key">${esc(cle)}</span>
      <span class="rl-rule-val">${r.type==='ignorer' ? '<span class="nil">ne pas importer</span>' : `${esc(r.libelle||releveJoli(cle))}${r.abo?' · abonnement':''}`}</span>
      <span class="side-note">${r.n>1 ? r.n+' fois' : '1 fois'}</span>
      <button class="icon-btn del" data-action="releve-oublier" data-cle="${attrEsc(cle)}" aria-label="Oublier ${attrEsc(cle)}">${icon('trash')}</button>
    </li>`).join('')}</ul></section>`).join('');
}
/* ---------- Filtrer, regrouper et chercher ---------- */
// Badge d'une ligne, tel qu'affiché (« Déjà suivie » à part).
function releveBadge(l){ return l.suivi ? 'suivi' : RELEVE_BADGES[l.confiance] ? l.confiance : 'nouveau'; }
const RELEVE_FILTRES = [{conf:'sur', label:'Reconnues'}, {conf:'appris', label:'Apprises'}, {conf:'devine', label:'Devinées'}, {conf:'nouveau', label:'Nouvelles'}, {conf:'suivi', label:'Déjà suivies'}];
function releveNorm(t){ return releveSansAccents(t).toLowerCase().trim(); }
// Une recherche trouve le libellé, le texte de la banque, la catégorie, le commentaire ou le montant.
function releveCorrespond(l, q){
  if(!q) return true;
  const montant = releveMontantSaisie(l.montant);
  const champs = [l.v.libelle, l.brut, l.v.categorie, l.v.notes, montant, montant.replace(',', '.')];
  return releveNorm(q).split(/\s+/).every(m=>champs.some(c=>releveNorm(c).includes(m)));
}
export function releveLignesFiltrees(attente){
  return attente.filter(l=>(!releveFiltre.conf || releveBadge(l)===releveFiltre.conf) && releveCorrespond(l, releveFiltre.q));
}
// Par défaut les lignes restent dans l'ordre du relevé : une ligne ne bouge pas pendant
// qu'on la corrige. Sur demande, elles sont triées par libellé ou par montant, ou
// regroupées par catégorie (« Ne pas importer » et « Sans catégorie » en dernier).
const RELEVE_TRIS = [{tri:'', label:'Ordre du relevé'}, {tri:'categorie', label:'Par catégorie'}, {tri:'libelle', label:'Par libellé'}, {tri:'montant', label:'Par montant'}];
export function releveGroupeDe(l){ return l.v.type==='ignorer' ? 'Ne pas importer' : (String(l.v.categorie||'').trim() || 'Sans catégorie'); }
function releveGroupes(lignes){
  const parDate = (a,b)=>a.date.localeCompare(b.date);
  if(releveFiltre.tri==='libelle') return [{nom:'', lignes: [...lignes].sort((a,b)=>String(a.v.libelle||'').localeCompare(String(b.v.libelle||''),'fr') || parDate(a,b))}];
  if(releveFiltre.tri==='montant') return [{nom:'', lignes: [...lignes].sort((a,b)=>Math.abs(b.montant)-Math.abs(a.montant) || parDate(a,b))}];
  if(releveFiltre.tri!=='categorie') return [{nom:'', lignes: [...lignes].sort(parDate)}];
  const m = new Map();
  lignes.forEach(l=>{ const g = releveGroupeDe(l); if(!m.has(g)) m.set(g, []); m.get(g).push(l); });
  const rang = g => g==='Ne pas importer' ? 2 : g==='Sans catégorie' ? 1 : 0;
  return [...m.entries()].sort((a,b)=>rang(a[0])-rang(b[0]) || a[0].localeCompare(b[0],'fr'))
    .map(([nom, ls])=>({nom, lignes: ls.sort(parDate)}));
}
function releveFiltresHTML(attente){
  const nb = c => attente.filter(l=>releveBadge(l)===c).length;
  const chips = RELEVE_FILTRES.filter(f=>nb(f.conf)).map(f=>`<button type="button" class="chip rl-chip" data-action="releve-filtre" data-conf="${f.conf}" aria-pressed="${releveFiltre.conf===f.conf}">${f.label}<span class="amt">${nb(f.conf)}</span></button>`).join('');
  return `<div class="rl-filtres">
    <input type="search" class="rl-ctl rl-recherche" id="releve-recherche" value="${attrEsc(releveFiltre.q)}" placeholder="Chercher un libellé, une catégorie, un montant…" aria-label="Chercher dans les lignes à vérifier" autocomplete="off" enterkeyhint="search">
    <div class="chips" role="group" aria-label="Filtrer par badge"><button type="button" class="chip rl-chip" data-action="releve-filtre" data-conf="" aria-pressed="${!releveFiltre.conf}">Toutes<span class="amt">${attente.length}</span></button>${chips}</div>
    <div class="chips" role="group" aria-label="Ordre des lignes">${RELEVE_TRIS.map(t=>`<button type="button" class="chip rl-chip" data-action="releve-tri" data-tri="${t.tri}" aria-pressed="${(releveFiltre.tri||'')===t.tri}">${t.label}</button>`).join('')}</div>
  </div>`;
}
function releveLignesHTML(attente){
  const filtrees = releveLignesFiltrees(attente);
  const filtre = !!(releveFiltre.q || releveFiltre.conf);
  if(!filtrees.length) return `<div class="empty-line">Aucune ligne ne correspond${releveFiltre.q ? ` à « ${esc(releveFiltre.q)} »` : ''}. <button class="link" data-action="releve-filtre-effacer">Tout afficher</button></div>`;
  const ordre = releveGroupes(filtrees);
  const visibles = new Set(ordre.flatMap(g=>g.lignes).slice(0, releveAffichees).map(l=>l.id));
  const groupes = ordre.map(g=>({...g, vis: g.lignes.filter(l=>visibles.has(l.id))})).filter(g=>g.vis.length);
  return `${filtre ? `<div class="rl-filtre-res"><span class="side-note">${fmtCount(filtrees.length, 'ligne affichée', 'lignes affichées')} sur ${attente.length}</span>
      ${filtrees.length>1 ? `<button class="btn btn-ghost btn-sm" data-action="releve-valider-affichees">${icon('check')}Valider les ${filtrees.length} affichées</button>` : ''}</div>` : ''}
    ${groupes.map(g=>!g.nom ? `<ul class="rl-list">${g.vis.map(l=>releveLigneHTML(l)).join('')}</ul>` : `<section class="rl-groupe" aria-label="${attrEsc(g.nom)}">
      <div class="rl-groupe-head"><h3>${esc(g.nom)}</h3><span class="side-note">${fmtCount(g.lignes.length, 'ligne', 'lignes')}</span>
        ${g.lignes.length>1 ? `<button class="btn btn-text btn-sm" data-action="releve-valider-groupe" data-groupe="${attrEsc(g.nom)}">${g.nom==='Ne pas importer' ? 'Tout confirmer' : 'Tout valider'}</button>` : ''}</div>
      <ul class="rl-list">${g.vis.map(l=>releveLigneHTML(l)).join('')}</ul>
    </section>`).join('')}
    ${filtrees.length>releveAffichees ? `<div class="rl-plus">
      <button class="btn btn-ghost btn-sm" data-action="releve-plus">${icon('chevD')}Afficher ${Math.min(RELEVE_TRANCHE, filtrees.length-releveAffichees)} lignes de plus</button>
      <span class="side-note">${releveAffichees} sur ${filtrees.length} affichées</span>
    </div>` : ''}`;
}
// Pendant la frappe, seule la liste est redessinée : le champ de recherche garde le focus.
export function releveRedessinerLignes(){
  const el = document.getElementById('rl-lignes');
  if(!el || !releveSession) return;
  el.innerHTML = releveLignesHTML(releveSession.lignes.filter(l=>l.etat==='attente'));
}
export function releveRedessinerRegles(){
  const el = document.getElementById('rl-regles');
  if(el) el.innerHTML = releveReglesHTML(releveModele(false));
}
export function renderReleve(){
  releveChargerSession();
  const s = releveSession;
  const modele = releveModele(false);
  if(!s){
    return `
      ${pageHeadHTML({title:'Import de relevé', finding:'Dépose le relevé de ta banque : chaque opération est pré-remplie, tu n’as plus qu’à valider.'})}
      <div class="card mb16">
        <input type="file" id="releve-file" class="sr-only" accept=".csv,.txt,.tsv,.ofx,.qfx,.qif,.pdf,text/csv,application/pdf">
        <label class="rl-drop" for="releve-file">
          ${icon('fileIn')}
          <span class="rl-drop-t">Choisir ou déposer un relevé</span>
          <span class="field-note">CSV, OFX, QIF ou PDF — le fichier est lu sur ton appareil, il n’est envoyé nulle part.</span>
        </label>
        <details class="rl-paste">
          <summary>Ou coller le texte du relevé</summary>
          <textarea id="releve-texte" rows="6" placeholder="12/10/2026  CB CARREFOUR 10/10   -45,30"></textarea>
          <button class="btn btn-ghost btn-sm" data-action="releve-coller">${icon('search')}Analyser le texte</button>
        </details>
      </div>
      ${releveApprentissageHTML(modele)}`;
  }
  const attente = s.lignes.filter(l=>l.etat==='attente');
  const validees = s.lignes.filter(l=>l.etat==='validee').length, ignorees = s.lignes.filter(l=>l.etat==='ignoree').length;
  const surs = attente.filter(l=>l.confiance==='sur');
  const FORMATS = {csv:'CSV', ofx:'OFX', qif:'QIF', pdf:'PDF', texte:'texte collé'};
  const finding = attente.length
    ? `${fmtCount(attente.length, 'ligne à vérifier', 'lignes à vérifier')}${surs.length ? ` · <strong>${surs.length}</strong> reconnue${surs.length>1?'s':''} d’après tes saisies précédentes` : ''}.`
    : `Import terminé : ${fmtCount(validees, 'opération ajoutée', 'opérations ajoutées')}${ignorees ? `, ${fmtCount(ignorees, 'ignorée', 'ignorées')}` : ''}.`;
  return `
    ${pageHeadHTML({title:'Import de relevé', finding,
      action: surs.length ? `<button class="btn btn-primary" data-action="releve-valider-surs">${icon('check')}${surs.length>1 ? `Valider les ${surs.length} reconnues` : 'Valider la ligne reconnue'}</button>` : ''})}
    <div class="card mb16 rl-carte">
      <div class="section-head">
        <h2>${icon('fileIn')}<span class="rl-file">${esc(s.nom)}</span><span class="side-note">${FORMATS[s.format]||''}</span></h2>
        <div class="row-actions">
          ${attente.length>1 ? `<button class="btn btn-ghost btn-sm" data-action="releve-valider-tout">Tout valider (${attente.length})</button>` : ''}
          <button class="btn btn-text btn-sm" data-action="releve-fermer">${attente.length ? 'Abandonner' : 'Importer un autre relevé'}</button>
        </div>
      </div>
      ${validees+ignorees ? `<div class="field-note" style="margin:-4px 0 12px;">${fmtCount(validees, 'ajoutée', 'ajoutées')} · ${fmtCount(ignorees, 'ignorée', 'ignorées')}</div>` : ''}
      ${s.csv ? releveColonnesHTML(s) : ''}
      ${releveSaisieSoldesHTML(s)}
      ${attente.length ? `${releveFiltresHTML(attente)}<div id="rl-lignes">${releveLignesHTML(attente)}</div>`
        : `<div id="rl-controle">${releveSoldesHTML(s)}</div>` + emptyRow('Toutes les lignes ont été traitées.', 'releve-fermer', 'Importer un autre relevé')}
    </div>
    ${releveApprentissageHTML(modele)}`;
}
export function releveAfterRender(){
  // Le surlignage des lignes mises à jour ne se joue qu'une fois.
  (releveSession?.lignes||[]).forEach(l=>{ l.maj = false; });
  if(releveFocusApres===null) return;
  const btns = [...document.querySelectorAll('.rl-row [data-action="releve-valider"]')];
  const b = btns[Math.min(releveFocusApres, btns.length-1)];
  setReleveFocusApres(null);
  if(b) b.focus({preventScroll:false});
}
export function releveIndexLigne(id){ return [...document.querySelectorAll('.rl-row')].findIndex(r=>r.dataset.rlRow===id); }
