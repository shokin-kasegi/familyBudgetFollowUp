/* Relevé : lecture du fichier (CSV, OFX/QFX, QIF, texte de PDF) en opérations. Fonctions pures, sans DOM ni état : testées directement sous Node (tests/releve-lecture.mjs). */
import { r2 } from './utils.js';

/* ======================= RELEVÉ : LECTURE DU FICHIER =======================
   Tout ce qui transforme le contenu d'un relevé (CSV, OFX, QIF, texte collé ou
   lignes d'un PDF) en opérations {date, libelle, montant} : découpage du CSV,
   détection des colonnes, dates, montants, soldes annoncés.
   Ce module ne dépend que d'utils.js (fonctions pures) : il n'écrit aucune
   donnée, et les tests l'importent seul, sans navigateur
   (node tests/releve-lecture.mjs). Garder cette règle : pas de state,
   document, window ni import d'un autre module que utils.js ici. */

/* ---------- Lecture des valeurs : libellés, montants, dates ---------- */
// Mots sans valeur pour reconnaître un commerçant : moyens de paiement,
// mentions SEPA, articles… « CB CARREFOUR 12/10 » et « CARTE X1234 CARREFOUR »
// donnent tous deux la clé « CARREFOUR » (les deux premiers mots qui restent).
const RELEVE_BRUIT = new Set(['CB','CARTE','CARTES','PAIEMENT','PAIEMT','PAI','PAR','PRLV','PRELEVEMENT','PRELEVT','PREL','SEPA','VIR','VIREMENT','VIRT','RECU','EMIS','INST','INSTANTANE','FACTURE','FACT','ACHAT','DU','LE','LA','LES','DE','DES','ET','EN','AU','AUX','SUR','POUR','CHEZ','REF','REFERENCE','MOTIF','ECH','ECHEANCE','MANDAT','ID','EMETTEUR','NUM','NO','DONNEUR','ORDRE','BENEF','BENEFICIAIRE','TPE','CONTACTLESS','SANS','CONTACT','EUR','EUROS','FR','SAS','SARL','SA','WWW','COM','HTTPS','HTTP','DATE','OPERATION','OPE','TRANSACTION','RUM','ICS','LIB']);
const RELEVE_HORS_OPS = /^(nouveau |ancien )?solde|^total|^sous[- ]total|^report|^montant (total|net)/i;
export function releveSansAccents(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,''); }
export function releveMots(lib){
  return releveSansAccents(lib).toUpperCase()
    .replace(/\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b/g,' ')
    .split(/[^A-Z0-9]+/)
    .filter(w=>w.length>=2 && !/\d/.test(w) && !RELEVE_BRUIT.has(w));
}
export function releveCle(lib){
  const mots = releveMots(lib);
  if(mots.length) return mots.slice(0,2).join(' '); // deux mots : la ville ou le n° de magasin qui suivent varient d'un paiement à l'autre
  return releveSansAccents(lib).toUpperCase().replace(/[^A-Z]+/g,' ').trim().split(' ').slice(0,2).join(' ') || '?';
}
export function releveJoli(cle){ return String(cle||'').toLowerCase().replace(/(^|\s)\S/g, c=>c.toUpperCase()); }
// « 1 234,56 », « -12,30 », « 1,234.56 », « 12.30- », « (12,30) », « 45,00 € » → nombre signé.
export function releveMontant(s){
  if(s==null) return NaN;
  let t = String(s).replace(/[\s  €]|EUR/gi,'');
  if(!t) return NaN;
  let neg = false;
  if(/^\(.*\)$/.test(t)){ neg = true; t = t.slice(1,-1); }
  if(/[-−–]$/.test(t)){ neg = true; t = t.slice(0,-1); }
  if(/^[-−–]/.test(t)){ neg = true; t = t.slice(1); }
  else if(t[0]==='+') t = t.slice(1);
  if(!/^\d[\d.,']*$/.test(t)) return NaN;
  t = t.replace(/'/g,'');
  const lc = t.lastIndexOf(','), ld = t.lastIndexOf('.');
  if(lc>-1 && ld>-1) t = lc>ld ? t.replace(/\./g,'').replace(',','.') : t.replace(/,/g,'');
  else if(lc>-1) t = t.split(',').length>2 ? t.replace(/,/g,'') : t.replace(',','.');
  else if(ld>-1 && t.split('.').length>2) t = t.replace(/\./g,'');
  const n = parseFloat(t);
  return isNaN(n) ? NaN : (neg ? -n : n);
}
const RELEVE_MOIS = {JAN:1,JANV:1,JANVIER:1,FEB:2,FEV:2,FEVR:2,FEVRIER:2,MAR:3,MARS:3,APR:4,AVR:4,AVRIL:4,MAY:5,MAI:5,JUN:6,JUIN:6,JUL:7,JUIL:7,JUILLET:7,AUG:8,AOU:8,AOUT:8,SEP:9,SEPT:9,SEPTEMBRE:9,OCT:10,OCTOBRE:10,NOV:11,NOVEMBRE:11,DEC:12,DECEMBRE:12};
function releveIso(y,m,d){
  if(!(m>=1 && m<=12 && d>=1 && d<=31 && y>=1990 && y<=2100)) return null;
  const dt = new Date(y, m-1, d);
  if(dt.getMonth()!==m-1) return null;
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
// ordre : 'dmy' (France) ou 'mdy'. anneeDefaut permet les dates sans année
// (« 12/10 » dans un PDF) ; sans elle, une date doit être complète — sinon un
// montant « 12.50 » passerait pour le 12 mai.
export function releveDate(s, ordre, anneeDefaut){
  const t = String(s||'').trim();
  let m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?!\d)/.exec(t);
  if(m) return releveIso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-\/.](\d{1,2})(?:[-\/.](\d{2,4}))?(?![\d.,])/.exec(t);
  if(m && (m[3] || anneeDefaut)){
    let y = m[3] ? +m[3] : anneeDefaut;
    if(y<100) y += 2000;
    return ordre==='mdy' ? releveIso(y, +m[1], +m[2]) : releveIso(y, +m[2], +m[1]);
  }
  m = /^(\d{1,2})[\s-]+([A-Za-zÀ-ÿ]{3,9})\.?(?:[\s-]+(\d{2,4}))?/.exec(t);
  if(m){
    const mo = RELEVE_MOIS[releveSansAccents(m[2]).toUpperCase()];
    let y = m[3] ? +m[3] : anneeDefaut;
    if(mo && y){ if(y<100) y += 2000; return releveIso(y, mo, +m[1]); }
  }
  return null;
}
// Jour/mois ou mois/jour ? Un premier nombre > 12 tranche pour jour/mois, un
// second > 12 pour mois/jour ; à défaut, l'usage français.
export function releveOrdre(valeurs){
  let dmy = 0, mdy = 0;
  valeurs.forEach(v=>{
    const m = /^(\d{1,2})[-\/.](\d{1,2})/.exec(String(v||'').trim());
    if(!m || /^\d{4}/.test(String(v).trim())) return;
    if(+m[1]>12) dmy++;
    if(+m[2]>12) mdy++;
  });
  return mdy>dmy ? 'mdy' : 'dmy';
}

/* ---------- Soldes annoncés par le relevé ---------- */
// « Ancien solde au 30/09/2026 1 234,56 », « Solde précédent », « Nouveau solde
// débiteur au 31/10 » ou « Solde de clôture » : le relevé donne le solde du
// compte au début et à la fin de la période. En fin d'import, le premier plus
// les opérations doit donner le second (releveControleSoldes).
const RELEVE_SOLDE_FIN = /\b(nouveau|nouvel|final|cloture|fin|actuel)\b/;
const RELEVE_SOLDE_DEBUT = /\b(ancien|precedent|initial|ouverture|debut|anterieur|report)/;
// texte : la ligne entière ; montant : le dernier montant de la ligne, déjà signé
// s'il était sous la colonne Débit. Une opération qui parle de solde (« VIR SOLDE
// DE TOUT COMPTE ») n'est pas une ligne de solde : le libellé doit commencer par lui.
function releveSoldeLigne(texte, montant){
  const n = releveNormEntete(texte).replace(/^(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\s+)+/, '');
  if(!/^((ancien|nouveau|nouvel)\s+)?solde\b/.test(n) || /tout compte/.test(n) || !isFinite(montant)) return null;
  const m = /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/.exec(n) || /\b\d{1,2} [a-z]{3,9}\.? \d{4}\b/.exec(n);
  return {quand: RELEVE_SOLDE_FIN.test(n) ? 'fin' : RELEVE_SOLDE_DEBUT.test(n) ? 'debut' : null,
    montant: r2(/debiteur/.test(n) ? -Math.abs(montant) : montant), date: m ? releveDate(m[0], 'dmy') : null};
}
// Le premier solde de début et le dernier solde de fin (un relevé de plusieurs
// pages répète le « solde reporté ») ; à défaut de mot-clé, « Solde au … » le
// plus ancien et le plus récent.
function releveSoldesRetenir(trouves){
  let debut = trouves.find(t=>t.quand==='debut'), fin = [...trouves].reverse().find(t=>t.quand==='fin');
  const dates = trouves.filter(t=>!t.quand && t.date).sort((a,b)=>a.date.localeCompare(b.date));
  if(dates.length>=2 && dates[0].date!==dates[dates.length-1].date){ debut = debut || dates[0]; fin = fin || dates[dates.length-1]; }
  return debut && fin ? {debut: debut.montant, fin: fin.montant, dateFin: fin.date || null} : null;
}

/* ---------- Formats de fichier ---------- */
export function releveDecoder(buffer){
  let texte;
  try{ texte = new TextDecoder('utf-8', {fatal:true}).decode(buffer); }
  catch(e){ texte = new TextDecoder('windows-1252').decode(buffer); } // exports bancaires « Excel » en Latin-1
  return texte.replace(/^﻿/, '');
}
function releveCsvDecoupe(ligne, sep){
  const out = []; let cur = '', q = false;
  for(let i=0;i<ligne.length;i++){
    const c = ligne[i];
    if(q){ if(c==='"'){ if(ligne[i+1]==='"'){ cur+='"'; i++; } else q = false; } else cur += c; }
    else if(c==='"') q = true;
    else if(c===sep){ out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(c=>c.trim());
}
// Séparateur : celui qui donne le plus souvent le même nombre de colonnes.
function releveCsvLignes(texte){
  const lignes = texte.split(/\r\n|\n|\r/).filter(l=>l.trim());
  let best = ';', bestScore = -1;
  [';', '\t', ',', '|'].forEach(sep=>{
    const freq = {};
    lignes.slice(0, 60).forEach(l=>{ const n = releveCsvDecoupe(l, sep).length; if(n>1) freq[n] = (freq[n]||0)+1; });
    const top = Object.entries(freq).sort((a,b)=>b[1]-a[1] || b[0]-a[0])[0];
    const score = top ? top[1]*100 + Number(top[0]) : 0;
    if(score>bestScore){ bestScore = score; best = sep; }
  });
  return lignes.map(l=>releveCsvDecoupe(l, best));
}
// Une date jour/mois ou mois/jour (« 09/14/2026 » dans un export américain) : l'ordre
// est tranché ensuite sur toute la colonne (releveOrdre).
const releveEstDateCsv = c => !!(releveDate(c, 'dmy') || releveDate(c, 'mdy'));
const releveEstMontant = c => c!=='' && !releveEstDateCsv(c) && !isNaN(releveMontant(c));
function releveNormEntete(h){ return releveSansAccents(h).toLowerCase().replace(/\s+/g,' ').trim(); }
// Repère l'en-tête et les lignes d'opérations (les banques ajoutent souvent
// quelques lignes d'informations sur le compte avant le tableau), puis la
// signature du format, qui sert à retrouver les colonnes apprises.
function releveCsvStructure(texte){
  const rows = releveCsvLignes(texte);
  const estDonnee = r => r.some(releveEstDateCsv) && r.some(releveEstMontant);
  // Une ligne « Date ; … Libellé / Montant / Débit » annonce le tableau ; à défaut, la première ligne d'opération.
  const iEntete = rows.findIndex((r,i)=>r.some(c=>/^date/.test(releveNormEntete(c))) && r.some(c=>/libelle|label|montant|amount|debit|credit|description/.test(releveNormEntete(c))) && rows.slice(i+1).some(estDonnee));
  const premiere = iEntete>=0 ? rows.findIndex((r,i)=>i>iEntete && estDonnee(r)) : rows.findIndex(estDonnee);
  if(premiere<0) return null;
  // Les lignes « Solde au … » annoncent le solde du compte : ce ne sont pas des opérations.
  const soldeDe = (r, montant) => { const c = r.find(c=>releveSoldeLigne(c, 0)); return c ? releveSoldeLigne([c, ...r.filter(x=>x!==c)].join(' '), montant) : null; };
  const soldes = rows.map(r=>soldeDe(r, releveMontant(r.filter(releveEstMontant).pop()))).filter(Boolean);
  const donnees = rows.slice(premiere).filter(r=>r.some(releveEstDateCsv) && !soldeDe(r, 0));
  const freq = {}; donnees.forEach(r=>{ freq[r.length] = (freq[r.length]||0)+1; });
  const nbCol = Number(Object.entries(freq).sort((a,b)=>b[1]-a[1])[0][0]);
  let entete = iEntete>=0 ? rows[iEntete] : null;
  for(let i=premiere-1;i>=0 && !entete;i--){
    if(!rows[i].some(releveEstDateCsv) && Math.abs(rows[i].length-nbCol)<=1 && rows[i].filter(Boolean).length>=2){ entete = rows[i]; break; }
  }
  const sig = entete ? 'csv:'+entete.map(releveNormEntete).join('|') : 'csv:sans-entete:'+nbCol;
  return {rows: donnees, entete, nbCol, sig, soldes};
}
// Devine les colonnes : d'abord par les noms d'en-tête, puis par le contenu.
function releveCsvDeviner(st){
  const {rows, entete, nbCol} = st;
  const col = {date:-1, libelle:-1, libelle2:-1, montant:-1, debit:-1, credit:-1, solde:-1};
  (entete||[]).forEach((h,i)=>{
    const n = releveNormEntete(h);
    if(/date/.test(n)){ if(col.date<0 && !/valeur/.test(n)) col.date = i; }
    else if(/solde|balance/.test(n)){ if(col.solde<0) col.solde = i; } // solde après l'opération : sert au contrôle des soldes
    else if(/^type|categor|devise|currency|^account|^compte|^iban|^rib\b/.test(n)){ /* ni libellé ni montant de l'opération (« accountLabel » : le nom du compte, pas de l'opération) */ }
    else if(/debit|sortie|depense/.test(n)){ if(col.debit<0) col.debit = i; }
    else if(/credit|entree|recette/.test(n)){ if(col.credit<0) col.credit = i; }
    else if(/montant|amount|somme|^eur|euros?$|valeur/.test(n)){ if(col.montant<0) col.montant = i; }
    else if(/libelle|label|description|intitule|detail|operation|nature|beneficiaire|tiers|payee|memo|communication|commentaire/.test(n)){
      if(col.libelle<0) col.libelle = i; else if(col.libelle2<0) col.libelle2 = i;
    }
  });
  const part = (i, test) => rows.filter(r=>test(r[i]||'')).length / Math.max(rows.length,1);
  const idx = [...Array(nbCol).keys()];
  if(col.date<0) col.date = idx.sort((a,b)=>part(b,releveEstDateCsv)-part(a,releveEstDateCsv))[0];
  if(col.montant<0 && (col.debit<0 || col.credit<0)){
    const nums = [...Array(nbCol).keys()].filter(i=>i!==col.date && part(i, releveEstMontant)>0.15);
    // Deux colonnes numériques qui ne sont presque jamais remplies ensemble : Débit / Crédit.
    const exclusives = nums.length>=2 && rows.filter(r=>releveEstMontant(r[nums[0]]||'') && releveEstMontant(r[nums[1]]||'')).length < rows.length*0.1;
    if(col.debit>=0 || col.credit>=0){ /* une seule des deux nommée : on garde la colonne Montant devinée ci-dessous */ col.debit = col.credit = -1; }
    if(exclusives){ col.debit = nums[0]; col.credit = nums[1]; }
    else if(nums.length) col.montant = nums.sort((a,b)=>part(b,releveEstMontant)-part(a,releveEstMontant))[0];
  }
  if(col.montant>=0){ col.debit = col.credit = -1; }
  if(col.libelle<0){
    const longueur = i => rows.reduce((s,r)=>s+((r[i]||'').length),0);
    col.libelle = [...Array(nbCol).keys()].filter(i=>![col.date,col.montant,col.debit,col.credit,col.solde].includes(i) && part(i, releveEstMontant)<0.5)
      .sort((a,b)=>longueur(b)-longueur(a))[0] ?? -1;
  }
  return col;
}
export function releveCsvOps(st, col){
  const ordre = releveOrdre(st.rows.map(r=>r[col.date]));
  return st.rows.map(r=>{
    const lib = [r[col.libelle], col.libelle2>=0 ? r[col.libelle2] : ''].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
    let montant;
    if(col.montant>=0) montant = releveMontant(r[col.montant]);
    else{
      const d = releveMontant(r[col.debit]), c = releveMontant(r[col.credit]);
      montant = !isNaN(d) && d!==0 ? -Math.abs(d) : (!isNaN(c) ? Math.abs(c) : NaN);
    }
    return {date: releveDate(r[col.date], ordre), libelle: lib, montant};
  });
}
// Colonne « Solde » d'un CSV (solde après chaque opération) : le solde de début
// est celui de la première opération moins son montant. Les banques listent
// les opérations dans un sens ou dans l'autre.
export function releveCsvSoldeColonne(rows, col, ops){
  if(!(col.solde>=0)) return null;
  const l = rows.map((r,i)=>({date: ops[i].date, montant: ops[i].montant, solde: releveMontant(r[col.solde])}))
    .filter(x=>x.date && isFinite(x.montant) && isFinite(x.solde));
  if(!l.length) return null;
  if(l[0].date > l[l.length-1].date) l.reverse();
  return {debut: r2(l[0].solde - l[0].montant), fin: r2(l[l.length-1].solde), dateFin: l[l.length-1].date, colonne: true};
}
function releveHtmlEntites(s){ return String(s||'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'"); }
export function releveOfx(texte){
  return texte.split(/<STMTTRN>/i).slice(1).map(b=>{
    const champ = n => { const m = new RegExp('<'+n+'>([^<\\r\\n]*)','i').exec(b); return m ? releveHtmlEntites(m[1].trim()) : ''; };
    const d = /^(\d{4})(\d{2})(\d{2})/.exec(champ('DTPOSTED'));
    const nom = champ('NAME'), memo = champ('MEMO');
    return {date: d ? releveIso(+d[1], +d[2], +d[3]) : null, libelle: [nom, memo && memo!==nom ? memo : ''].filter(Boolean).join(' '), montant: releveMontant(champ('TRNAMT'))};
  });
}
export function releveQif(texte){
  const ops = []; let cur = {};
  texte.split(/\r\n|\n|\r/).forEach(l=>{
    const k = l[0], v = l.slice(1).trim();
    if(k==='^'){ if(cur.dateBrute) ops.push(cur); cur = {}; }
    else if(k==='D') cur.dateBrute = v.replace(/'/g,'/').replace(/\s/g,'');
    else if(k==='T' || k==='U'){ if(cur.montant===undefined) cur.montant = releveMontant(v); }
    else if(k==='P') cur.libelle = v + (cur.libelle ? ' '+cur.libelle : '');
    else if(k==='M') cur.libelle = (cur.libelle ? cur.libelle+' ' : '') + v;
  });
  const ordre = releveOrdre(ops.map(o=>o.dateBrute));
  return ops.map(o=>({date: releveDate(o.dateBrute, ordre), libelle: o.libelle||'', montant: o.montant}));
}

/* ---------- PDF et texte collé : lignes « date … libellé … montant » ---------- */
// Texte collé : les morceaux sont séparés par une tabulation ou au moins deux espaces ;
// leur position est le numéro de caractère, ce qui garde l'alignement des colonnes.
function releveTexteEnLignes(texte){
  return texte.split(/\r\n|\n|\r/).map(l=>{
    const items = []; const re = /[^\t]+?(?=\t| {2,}|$)/g; let m;
    while((m = re.exec(l))){ const str = m[0].trim(); if(str) items.push({str, x: m.index + m[0].indexOf(str), w: str.length}); if(re.lastIndex===m.index) re.lastIndex++; }
    return items;
  }).filter(items=>items.length);
}
const RELEVE_ARGENT = /^[-+−]?(?:\d{1,3}(?:[\s  .]\d{3})+|\d+),\d{2}\s?€?-?$|^[-+−]?\d+\.\d{2}\s?€?-?$|^[-+−]?\d{1,3}(?:,\d{3})+\.\d{2}\s?€?-?$/;
const RELEVE_DATE_DEBUT = /^(\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?|\d{1,2} [A-Za-zÀ-ÿ]{3,9}\.?(?: \d{4})?)\s+/;
const RELEVE_ENTREE = /\b(VIR(EMENT)?S? (SEPA )?(RECU|DE|INST RECU)|REMBOURSEMENT|REMB|SALAIRE|AVOIR|ALLOCATION|CAF|POLE EMPLOI|FRANCE TRAVAIL|PRIME|INTERETS)\b/i;
// Signature du format : les premières lignes, sans chiffres ni noms de mois
// (« Généré le 11 oct. 2026 »), pour reconnaître la même banque d'un mois à l'autre.
export function releveSigTexte(lignes){
  return 'pdf:' + releveSansAccents(lignes.slice(0,3).map(l=>l.map(i=>i.str).join(' ')).join(' ')).toUpperCase().replace(/[^A-Z]+/g,' ')
    .replace(/\b(JANV?(IER)?|FEVR?(IER)?|MARS|AVR(IL)?|MAI|JUIN|JUIL(LET)?|AOUT|SEPT?(EMBRE)?|OCT(OBRE)?|NOV(EMBRE)?|DEC(EMBRE)?)\b/g,' ').replace(/\s+/g,' ').trim().slice(0,60);
}
// Colonnes d'un relevé PDF ou collé : bords gauche (g) et droit (d) de « Débit »,
// « Crédit » et « Solde » ; les colonnes apprises avant ne gardaient que le bord droit.
// Un montant est rangé dans la colonne la plus proche, en comparant le même bord
// (alignés à droite, ou à gauche chez Revolut). Si l'on ne connaît qu'une colonne
// (apprise d'une correction), le montant doit être juste dessous.
function releveEcartColonne(c, p){ return typeof c==='number' ? Math.abs(c-p.d) : Math.min(Math.abs(c.d-p.d), Math.abs(c.g-p.g)); }
export function releveColonneDe(colonnes, p){
  const ks = ['debit','credit','solde'].filter(k=>colonnes && colonnes[k]!=null);
  if(!ks.length || !p) return null;
  const k = ks.sort((a,b)=>releveEcartColonne(colonnes[a],p)-releveEcartColonne(colonnes[b],p))[0];
  const complet = colonnes.debit!=null && colonnes.credit!=null;
  return complet || releveEcartColonne(colonnes[k], p) <= Math.max(2, (p.d-p.g)*0.6) ? k : null;
}
export function releveSigneColonne(colonnes, p){ const k = releveColonneDe(colonnes, p); return k==='debit' ? -1 : k==='credit' ? 1 : 0; }
export function releveDepuisLignes(lignes, format, colonnesApprises){
  // Année des dates sans année : la plus récente trouvée en toutes lettres dans le document.
  const datesCompletes = [];
  lignes.forEach(l=>l.forEach(i=>{ const m = i.str.match(/\b\d{1,2}[\/.-]\d{1,2}[\/.-](\d{4}|\d{2})\b/g); (m||[]).forEach(x=>{ const d = releveDate(x,'dmy'); if(d) datesCompletes.push(d); }); }));
  const fin = datesCompletes.sort().pop();
  const anneeFin = fin ? Number(fin.slice(0,4)) : new Date().getFullYear(), moisFin = fin ? Number(fin.slice(5,7)) : 12;
  const ordre = releveOrdre(lignes.map(l=>(l[0]||{}).str));
  let colonnes = colonnesApprises || null, colonnesVues = null;
  const ops = [];
  let dernier = null, dernierIndex = -2, horsCompte = false;
  const soldes = [];
  const posDe = i => ({g: i.x, d: i.x + i.w});
  lignes.forEach((items, idx)=>{
    const texte = items.map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();
    const norm = releveNormEntete(texte);
    // Revolut ajoute après le compte courant les paiements annulés (« Renvoyé de … »),
    // en attente, et le compte d'épargne (« Transactions de dépôt », les mêmes virements
    // internes vus de l'autre côté) : on ne lit que les sections du compte.
    if(/^(transactions (de depot|du compte|en attente)|renvoye de|annulee?s? de)\b/.test(norm)){ horsCompte = !/^transactions du compte/.test(norm); dernier = null; return; }
    if(horsCompte) return;
    // « Débit / Crédit », ou « Argent sortant / Argent entrant » (Revolut).
    if(/debit|sortant/.test(norm) && /credit|entrant/.test(norm)){
      // Colonnes déjà retenues pour ce format (éventuellement corrigées) : elles priment.
      if(colonnesApprises && colonnesApprises.debit!=null && colonnesApprises.credit!=null) return;
      colonnes = {};
      items.forEach(i=>{ const n = releveNormEntete(i.str); const k = /debit|sortant/.test(n) ? 'debit' : /credit|entrant/.test(n) ? 'credit' : /solde/.test(n) ? 'solde' : null; if(k) colonnes[k] = {g: i.x, d: i.x + i.w}; });
      colonnesVues = colonnes;
      return;
    }
    const md = RELEVE_DATE_DEBUT.exec(texte + ' ');
    const argent = items.filter(i=>RELEVE_ARGENT.test(i.str));
    if(argent.length){
      // Ligne de solde : son montant est le dernier de la ligne, négatif sous la colonne Débit.
      const a = argent[argent.length-1];
      const solde = releveSoldeLigne(texte, releveColonneDe(colonnes, posDe(a))==='debit' ? -Math.abs(releveMontant(a.str)) : releveMontant(a.str));
      if(solde){ soldes.push(solde); dernier = null; return; }
    }
    if(!md){
      // Suite du libellé de l'opération précédente (libellés sur deux lignes).
      if(dernier && dernierIndex===idx-1 && !argent.length && texte.length<70 && !RELEVE_HORS_OPS.test(texte)){ dernier.libelle += ' ' + texte; }
      return;
    }
    const brut = md[1];
    let date = releveDate(brut, ordre, anneeFin);
    const sansAnnee = /^\d{1,2}[\/.-]\d{1,2}$|^\d{1,2} [A-Za-zÀ-ÿ]{3,9}\.?$/.test(brut);
    if(date && sansAnnee && Number(date.slice(5,7)) > moisFin + 1) date = releveDate(brut, ordre, anneeFin-1); // relevé à cheval sur deux années
    if(!date || !argent.length) return;
    // Sans colonnes (ou hors d'elles) : le premier montant après le libellé (le solde, s'il y en a un, vient après).
    const choisi = argent.find(i=>releveColonneDe(colonnes, posDe(i))!=='solde') || argent[0];
    const pos = posDe(choisi), signe = releveSigneColonne(colonnes, pos);
    let montant = releveMontant(choisi.str);
    if(isNaN(montant) || montant===0) return;
    const explicite = /^[-+−]|-$/.test(choisi.str.trim());
    const signeIncertain = !signe && !explicite;
    if(signe) montant = signe * Math.abs(montant);
    else if(signeIncertain) montant = RELEVE_ENTREE.test(texte) ? Math.abs(montant) : -Math.abs(montant);
    let libelle = texte.slice(md[0].length);
    libelle = libelle.replace(RELEVE_DATE_DEBUT, ''); // date de valeur juste après la date d'opération
    argent.forEach(i=>{ const a = i.str.replace(/\s+/g,' '), k = libelle.lastIndexOf(a); if(k>=0) libelle = libelle.slice(0,k) + libelle.slice(k+a.length); });
    libelle = libelle.replace(/\s+/g,' ').trim();
    if(!libelle || RELEVE_HORS_OPS.test(libelle)) return;
    // La position du montant sert à apprendre les colonnes si l'utilisateur corrige le sens.
    dernier = {date, libelle, montant, signeIncertain, ...(explicite ? {} : {pos})}; dernierIndex = idx;
    ops.push(dernier);
  });
  return {format, ops, sig: releveSigTexte(lignes), colonnes: colonnesVues, soldes: releveSoldesRetenir(soldes)};
}

/* ---------- Empreinte d'une opération ---------- */
// Identifie une opération du relevé d'un import à l'autre : date, montant signé
// et libellé bancaire, plus son rang parmi les opérations identiques du même
// relevé (deux cafés à 4,30 € le même jour restent deux opérations). Le même
// relevé importé deux fois redonne les mêmes empreintes : c'est ce qui permet à
// l'écriture (releveEcrireLigne) de refuser un doublon. Seul un condensé est
// gardé dans les données, pas le libellé bancaire.
function releveCondense(t){
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for(let i=0;i<t.length;i++){ const c = t.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1>>>16), 2246822507) ^ Math.imul(h2 ^ (h2>>>13), 3266489909);
  h2 = Math.imul(h2 ^ (h2>>>16), 2246822507) ^ Math.imul(h1 ^ (h1>>>13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1>>>0)).toString(36);
}
export function releveEmpreintes(ops){
  const vus = new Map();
  return ops.map(o=>{
    const base = `${o.date}|${r2(o.montant).toFixed(2)}|${releveNormEntete(o.libelle)}`;
    const n = vus.get(base) || 0; vus.set(base, n+1);
    return `${releveCondense(base)}.${n}`;
  });
}

/* ---------- Point d'entrée : texte d'un fichier → opérations ---------- */
// modele : ce que Solde a appris (seuls ses formats servent ici, pour retrouver les colonnes).
export function releveAnalyserTexte(texte, modele){
  if(/<STMTTRN>/i.test(texte)) return {format:'ofx', ops: releveOfx(texte)};
  if(/^\s*!Type:/im.test(texte)) return {format:'qif', ops: releveQif(texte)};
  const st = releveCsvStructure(texte);
  if(st && st.nbCol>=3){
    const appris = modele.formats[st.sig];
    const col = appris && appris.colonnes ? {...appris.colonnes} : releveCsvDeviner(st);
    if(col.solde===undefined) col.solde = releveCsvDeviner(st).solde; // format appris avant le contrôle des soldes
    const ops = releveCsvOps(st, col);
    return {format:'csv', ops, sig: st.sig, csv:{rows: st.rows, entete: st.entete, nbCol: st.nbCol, col}, formatConnu: !!appris,
      soldes: releveSoldesRetenir(st.soldes) || releveCsvSoldeColonne(st.rows, col, ops)};
  }
  const lignes = releveTexteEnLignes(texte);
  const appris = modele.formats[releveSigTexte(lignes)];
  return releveDepuisLignes(lignes, 'texte', appris && appris.colonnes);
}
