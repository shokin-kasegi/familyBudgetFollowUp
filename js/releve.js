/* Import de relevé : suggestions, session d'import, écriture dans les données, et ses actions. */
import { currentUser } from './auth.js';
import { mesSorties, soldeCompteFixer } from './calculs.js';
import { myCategories } from './categories.js';
import { releveAnalyserTexte, releveCle, releveColonneDe, releveCsvOps, releveCsvSoldeColonne,
  releveDecoder, releveDepuisLignes, releveEmpreintes, releveJoli, releveMontant, releveMots,
  releveSigneColonne, releveSigTexte } from './releve-lecture.js';
import { render } from './routeur.js';
import { aboDemarrer, aboPrevisions, aboPrevisionsDuMois, aboRattacher, aboValider } from './series/abonnements.js';
import { chgDemarrer, chgPeriode, chgPrevisions, chgRattacher, chgSerie, chgValider } from './series/charges.js';
import { PPF_EPS, ppfDemarrer, ppfDepassement, ppfEtat, ppfFixerTotal, ppfMessageDepassement,
  ppfPrevisions, ppfRattacher, ppfSerie, ppfValider } from './series/ppf.js';
import { mine, persist, state } from './store.js';
import { icon } from './ui/icones.js';
import { confirmDelete, toast } from './ui/modale.js';
import { fmtCount, fmtDate, fmtEUR, moisDe, r2, sumR2, uid } from './utils.js';
import { releveGroupeDe, releveIndexLigne, releveLignesFiltrees } from './views/releve.js';

/* ---- Import de relevé ---- */
async function actionReleveValider(id){
  releveFocusApres = releveIndexLigne(id); await releveValider([id]);
}
async function actionReleveIgnorer(id){
  const l = releveSession && releveSession.lignes.find(x=>x.id===id);
  if(l){ l.v.type = 'ignorer'; releveFocusApres = releveIndexLigne(id); await releveValider([id]); }
}
async function actionReleveAbo(id){
  const l = releveSession && releveSession.lignes.find(x=>x.id===id);
  if(l && l.v.type==='depense'){
    l.v.abo = !l.v.abo;
    if(l.v.abo){
      l.v.ppf = false; l.v.chg = false;
      // Un prélèvement attendu chez ce commerçant est proposé d'office ; le menu permet d'en choisir un autre.
      if(!l.aboSerieId && !l.aboChoisi){
        const pris = new Set(releveSession.lignes.filter(x=>x!==l && x.etat==='attente' && x.aboPrevId).map(x=>x.aboPrevId));
        const attendu = releveAboAttendu({montant:-Math.abs(l.montant), date:l.date}, l.cle, l.v.libelle, pris);
        if(attendu) releveChoisirAbo(l, attendu.aboId);
      }
    }
    releveSauverSession(); await render(); document.querySelector(`[data-action="releve-abo"][data-id="${id}"]`)?.focus();
  }
}
async function actionReleveChg(id){
  const l = releveSession && releveSession.lignes.find(x=>x.id===id);
  if(l && l.v.type==='depense'){
    l.v.chg = !l.v.chg;
    if(l.v.chg){
      l.v.abo = false; l.v.ppf = false; delete l.erreur;
      // Une échéance attendue chez ce fournisseur est proposée d'office ; le menu permet d'en choisir une autre.
      if(!l.chgSerieId && !l.chgChoisi){
        const pris = new Set(releveSession.lignes.filter(x=>x!==l && x.etat==='attente' && x.chgPrevId).map(x=>x.chgPrevId));
        const attendue = releveChgAttendu({montant:-Math.abs(l.montant), date:l.date}, l.cle, l.v.libelle, pris);
        if(attendue) releveChoisirChg(l, attendue.chgId);
      }
    }
    releveSauverSession(); await render(); document.querySelector(`[data-action="releve-chg"][data-id="${id}"]`)?.focus();
  }
}
async function actionRelevePpf(id){
  // « En plusieurs fois » : le montant total est demandé aussitôt.
  const l = releveSession && releveSession.lignes.find(x=>x.id===id);
  if(l && l.v.type==='depense'){
    l.v.ppf = !l.v.ppf; if(l.v.ppf){ l.v.abo = false; l.v.chg = false; } delete l.erreur;
    // Une mensualité attendue chez ce commerçant est proposée d'office ; le menu permet d'en choisir une autre.
    if(l.v.ppf && !l.ppfSerieId && !l.ppfChoisi){
      const pris = new Set(releveSession.lignes.filter(x=>x!==l && x.etat==='attente' && x.ppfPrevId).map(x=>x.ppfPrevId));
      const attendue = relevePpfAttendu({montant:-Math.abs(l.montant), date:l.date}, l.cle, l.v.libelle, pris);
      if(attendue) releveChoisirPpf(l, attendue.ppfId);
    }
    releveSauverSession(); await render();
    document.querySelector(l.v.ppf && !l.v.ppfTotal ? `.rl-row[data-rl-row="${id}"] [data-rl-champ="ppfTotal"]` : `[data-action="releve-ppf"][data-id="${id}"]`)?.focus();
  }
}
async function actionReleveSigne(id){
  if(releveInverserSigne(id)){
    const n = releveApprendreColonne(id);
    releveFocusApres = null; await render(); document.querySelector(`[data-action="releve-signe"][data-id="${id}"]`)?.focus();
    if(n) toast(`Colonne corrigée · ${fmtCount(n, 'autre ligne inversée', 'autres lignes inversées')}`);
  }
}
async function actionReleveFiltre(id, el){
  releveFiltre.conf = releveFiltre.conf===el.dataset.conf ? '' : el.dataset.conf;
  releveAffichees = RELEVE_TRANCHE;
  await render();
  document.querySelector(`[data-action="releve-filtre"][data-conf="${releveFiltre.conf}"]`)?.focus();
}
async function actionReleveTri(id, el){
  releveFiltre.tri = el.dataset.tri;
  releveAffichees = RELEVE_TRANCHE;
  await render();
  document.querySelector(`[data-action="releve-tri"][data-tri="${releveFiltre.tri}"]`)?.focus();
}
async function actionReleveFiltreEffacer(){
  releveFiltre = {...releveFiltre, q:'', conf:''}; releveAffichees = RELEVE_TRANCHE;
  await render(); document.getElementById('releve-recherche')?.focus();
}
async function actionReleveValiderAffichees(){
  await releveValider(releveLignesFiltrees((releveSession?.lignes||[]).filter(l=>l.etat==='attente')).map(l=>l.id));
}
async function actionReleveValiderGroupe(id, el){
  await releveValider(releveLignesFiltrees((releveSession?.lignes||[]).filter(l=>l.etat==='attente')).filter(l=>releveGroupeDe(l)===el.dataset.groupe).map(l=>l.id));
}
async function actionReleveValiderSurs(){
  await releveValider((releveSession?.lignes||[]).filter(l=>l.etat==='attente' && l.confiance==='sur').map(l=>l.id));
}
async function actionReleveValiderTout(){
  await releveValider((releveSession?.lignes||[]).filter(l=>l.etat==='attente').map(l=>l.id));
}
async function actionRelevePlus(){
  releveAffichees += RELEVE_TRANCHE;
  releveFocusApres = releveAffichees - RELEVE_TRANCHE; // le focus va sur la première ligne ajoutée
  await render();
}
async function actionReleveFermer(){
  const reste = releveSession ? releveSession.lignes.filter(l=>l.etat==='attente').length : 0;
  const fermer = async ()=>{ releveSession = null; releveSauverSession(); await render(); };
  if(reste) confirmDelete('', fermer, {title:'Abandonner cet import ?', consequence:`${fmtCount(reste, 'ligne non validée est', 'lignes non validées sont')} laissée${reste>1?'s':''} de côté. Les opérations déjà validées restent dans ton budget.`, confirmLabel:'Abandonner'});
  else await fermer();
}
async function actionReleveColler(){
  const texte = (document.getElementById('releve-texte')?.value||'').trim();
  if(!texte){ toast('Colle d’abord le texte du relevé'); return; }
  await releveDemarrer('Texte collé', releveAnalyserTexte(texte, releveModele(false)));
}
async function actionReleveOublier(id, el){
  const m = releveModele(false), cle = el.dataset.cle;
  if(m.regles && m.regles[cle]){ delete m.regles[cle]; await persist(); await render(); toast('Règle oubliée'); }
}
async function actionReleveOublierTout(){
  confirmDelete('', async ()=>{
    const me = currentUser();
    state.importApprentissage = (state.importApprentissage||[]).filter(x=>x.ownerId!==me.id);
    await persist(); await render(); toast('Apprentissage remis à zéro');
  }, {title:'Tout oublier ?', consequence:'Les formats de fichier, commerçants et catégories appris pour l’import de relevé seront effacés. Tes saisies ne changent pas.', confirmLabel:'Tout oublier'});
}
export const actionsReleve = {
  'releve-valider': actionReleveValider,
  'releve-ignorer': actionReleveIgnorer,
  'releve-abo': actionReleveAbo,
  'releve-chg': actionReleveChg,
  'releve-ppf': actionRelevePpf,
  'releve-signe': actionReleveSigne,
  'releve-filtre': actionReleveFiltre,
  'releve-tri': actionReleveTri,
  'releve-filtre-effacer': actionReleveFiltreEffacer,
  'releve-valider-affichees': actionReleveValiderAffichees,
  'releve-valider-groupe': actionReleveValiderGroupe,
  'releve-valider-surs': actionReleveValiderSurs,
  'releve-valider-tout': actionReleveValiderTout,
  'releve-plus': actionRelevePlus,
  'releve-fermer': actionReleveFermer,
  'releve-coller': actionReleveColler,
  'releve-oublier': actionReleveOublier,
  'releve-oublier-tout': actionReleveOublierTout,
};

/* ============================== IMPORT DE RELEVÉ ============================== */
/* Le relevé de compte (CSV, OFX/QFX, QIF, PDF ou texte collé) est analysé dans
   le navigateur : rien n'est envoyé nulle part. Chaque opération devient une
   ligne pré-remplie (type, libellé, catégorie) que l'utilisateur valide ou
   ignore. Chaque décision enrichit l'apprentissage, propre à chaque compte et
   synchronisé avec le reste du budget (state.importApprentissage, un objet par
   utilisateur) :
   - formats : pour un CSV, quelles colonnes portent la date, le libellé et le
     montant — reconnues ensuite à l'en-tête du fichier, sans rien redemander ;
     pour un PDF, où se trouvent les colonnes Débit / Crédit ;
   - regles : pour un commerçant (libellé bancaire normalisé), ce que
     l'utilisateur en a fait et combien de fois de suite ;
   - mots : les mots des libellés comptés par type et catégorie, pour deviner
     un commerçant jamais vu à partir de ceux qui lui ressemblent ;
   - historique : suggestion juste (1) ou corrigée (0), pour mesurer les progrès. */
export let releveSession = null;        // import en cours (null = aucun) ; recopié dans le localStorage de l'appareil
export function setReleveSession(v){ releveSession = v; }
let releveSessionOwner = null;   // utilisateur auquel appartient releveSession chargée
export let releveFocusApres = null;     // index de la ligne à focaliser après un re-render (validation au clavier)
export function setReleveFocusApres(v){ releveFocusApres = v; }
// Un relevé annuel compte des milliers de lignes : on n'en affiche qu'une
// tranche à la fois, sinon chaque validation reconstruit des centaines de
// milliers d'éléments et la page ne suit plus.
export const RELEVE_TRANCHE = 50;
export let releveAffichees = RELEVE_TRANCHE;
export function setReleveAffichees(v){ releveAffichees = v; }
export let releveFiltre = {q:'', conf:'', tri:''}; // lignes à vérifier : recherche, badge (vide = tous) et ordre (vide = celui du relevé)
export let releveReglesQ = '';              // « Ce que Solde a appris » : recherche
export function setReleveReglesQ(v){ releveReglesQ = v; }

export function releveModele(creer){
  const me = currentUser();
  if(!Array.isArray(state.importApprentissage)) state.importApprentissage = [];
  let m = state.importApprentissage.find(x=>x.ownerId===me.id);
  if(!m){
    if(!creer) return {formats:{}, regles:{}, mots:{}, historique:[]};
    m = {id:uid(), ownerId:me.id, formats:{}, regles:{}, mots:{}, historique:[]};
    state.importApprentissage.push(m);
  }
  ['formats','regles','mots'].forEach(k=>{ if(!m[k] || typeof m[k]!=='object') m[k] = {}; });
  if(!Array.isArray(m.historique)) m.historique = [];
  return m;
}

/* ---------- PDF : lecture avec pdf.js (navigateur) ---------- */
let relevePdfJs = null;
function releveChargerPdfJs(){
  if(window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if(!relevePdfJs) relevePdfJs = new Promise((resolve, reject)=>{
    const base = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
    const s = document.createElement('script');
    s.src = base+'pdf.min.js';
    s.onload = ()=>{ window.pdfjsLib.GlobalWorkerOptions.workerSrc = base+'pdf.worker.min.js'; resolve(window.pdfjsLib); };
    s.onerror = ()=>{ relevePdfJs = null; s.remove(); reject(new Error('pdf.js indisponible')); };
    document.head.appendChild(s);
  });
  return relevePdfJs;
}
// Une ligne = la liste de ses morceaux de texte avec leur position (x, largeur),
// pour savoir sous quelle colonne (Débit, Crédit, Solde) tombe un montant.
async function releveLirePdf(buffer){
  const pdfjs = await releveChargerPdfJs();
  const doc = await pdfjs.getDocument({data: buffer}).promise;
  const lignes = [];
  for(let p=1;p<=doc.numPages;p++){
    const page = await doc.getPage(p);
    const rows = [];
    (await page.getTextContent()).items.forEach(it=>{
      if(!it.str || !it.str.trim()) return;
      const x = it.transform[4], y = it.transform[5];
      let row = rows.find(r=>Math.abs(r.y-y)<3);
      if(!row){ row = {y, items:[]}; rows.push(row); }
      row.items.push({str: it.str.trim(), x, w: it.width||0});
    });
    rows.sort((a,b)=>b.y-a.y).forEach(r=>lignes.push(r.items.sort((a,b)=>a.x-b.x)));
  }
  return lignes;
}
/* ---------- Suggestions ---------- */
function releveCategorieDefaut(type){
  const cats = myCategories(type==='revenu' ? 'revenus' : 'depenses');
  return (cats.find(c=>c.nom==='Autre') || cats[0] || {}).nom || '';
}
// Ce qui est déjà saisi dans Solde n'est pas à ressaisir : une dépense ou un
// revenu déjà noté (même montant, à 3 jours près).
function releveDejaSuivi(op){
  const abs = Math.abs(op.montant);
  const egal = v => Math.abs((Number(v)||0) - abs) < 0.006;
  const proche = d => d && Math.abs(new Date(d+'T00:00:00') - new Date(op.date+'T00:00:00')) <= 3*86400000;
  if(op.montant<0){
    const d = mesSorties().find(x=>egal(x.montant) && proche(x.date));
    if(d) return `Déjà saisie : ${d.libelle}`;
  } else {
    const r = mine(state.revenusExceptionnels).find(x=>egal(x.montant) && proche(x.date));
    if(r) return `Déjà saisie : ${r.libelle}`;
  }
  return '';
}
// Ordre de confiance : la règle apprise pour ce commerçant ; sinon un commerçant
// proche déjà vu (même premier mot : « CARREFOUR CITY » ↔ « CARREFOUR MARKET ») ;
// sinon les mots du libellé ; sinon le sens du montant.
export function releveSuggestion(op, modele){
  const cle = releveCle(op.libelle);
  const sens = op.montant<0 ? 'depense' : 'revenu';
  const base = {cle, abo:false, ppf:false, chg:false};
  const regle = modele.regles[cle];
  // Un commerçant habituellement en dépense qui crédite le compte : c'est un remboursement.
  if(regle && regle.type!=='ignorer' && regle.type!==sens && !op.signeIncertain){
    // Ce sens a déjà été validé pour ce commerçant (règle minoritaire) : on la reprend.
    const inv = regle.inverse;
    if(inv && inv.type===sens) return {...base, type: sens, libelle: inv.libelle || releveJoli(cle), categorie: inv.categorie || '',
      confiance: inv.n>=2 ? 'sur' : 'appris', raison: `Reconnue en ${sens==='revenu' ? 'rentrée' : 'dépense'} (${inv.n>1 ? inv.n+' fois' : 'une fois'})`};
    const cats = myCategories(sens==='revenu' ? 'revenus' : 'depenses').map(c=>c.nom);
    const cat = sens==='revenu' && cats.includes('Remboursement') ? 'Remboursement' : releveCategorieDefaut(sens);
    return {...base, type: sens, libelle: (sens==='revenu' ? 'Remboursement ' : '') + (regle.libelle || releveJoli(cle)), categorie: cat, confiance:'devine', raison:'Sens inhabituel pour ce commerçant'};
  }
  if(regle){
    return {...base, type: regle.type, libelle: regle.libelle || releveJoli(cle), categorie: regle.categorie || '', abo: regle.type==='depense' && !!regle.abo,
      ...(regle.type==='depense' && regle.chg ? {chg:true, chgPeriode:String(chgPeriode(regle.chgPeriode))} : {}),
      confiance: regle.n>=2 ? 'sur' : 'appris', raison: regle.type==='ignorer' ? `Déjà ignorée ${regle.n>1?regle.n+' fois':'une fois'}` : `Reconnue (${regle.n>1?regle.n+' fois':'une fois'})`};
  }
  const premier = cle.split(' ')[0];
  if(premier.length>=4){
    const voisin = Object.entries(modele.regles).filter(([k,r])=>k.split(' ')[0]===premier && (r.type===sens || op.signeIncertain && r.type!=='ignorer')).sort((a,b)=>b[1].n-a[1].n)[0];
    // Le libellé du voisin n'est repris que si l'utilisateur l'a renommé (« Courses ») ; sinon chacun garde le sien.
    if(voisin){ const r = voisin[1]; const renomme = r.libelle && r.libelle!==releveJoli(voisin[0]); return {...base, type: r.type, libelle: renomme ? r.libelle : releveJoli(cle), categorie: r.categorie||'', confiance:'appris', raison:`Proche de « ${r.libelle || releveJoli(voisin[0])} »`}; }
  }
  const scores = {}; let total = 0;
  releveMots(op.libelle).forEach(w=>{
    Object.entries(modele.mots[w]||{}).forEach(([lab,n])=>{
      const t = lab.split('|')[0];
      if(t!==sens && !(op.signeIncertain && t!=='ignorer')) return; // une catégorie de dépense ne s'applique pas à une rentrée, et inversement
      scores[lab] = (scores[lab]||0) + n; total += n;
    });
  });
  const best = Object.entries(scores).sort((a,b)=>b[1]-a[1])[0];
  if(best && best[1]>=2 && best[1]/total>=0.6){
    const [type, categorie] = best[0].split('|');
    return {...base, type, libelle: releveJoli(cle), categorie, confiance:'devine', raison:`Catégorie devinée d’après le libellé`};
  }
  return {...base, type: sens, libelle: releveJoli(cle), categorie: releveCategorieDefaut(sens), confiance:'nouveau', raison:'Nouvelle opération'};
}
// Un prélèvement d'abonnement attendu ce mois-là (même commerçant ou même nom) :
// la ligne le validera au lieu de créer une nouvelle dépense. Le montant peut
// différer (changement de prix) ; à défaut, le plus proche l'emporte.
function releveAboAttendu(op, cle, libelle, pris){
  if(op.montant>=0) return null;
  const nom = String(libelle||'').trim().toLowerCase();
  const premier = cle.split(' ')[0];
  const abs = Math.abs(op.montant);
  const memeCommercant = p => { const c = p.cle || releveCle(p.libelle); return c===cle || (premier.length>=4 && c.split(' ')[0]===premier); };
  return aboPrevisionsDuMois(moisDe(op.date))
    .filter(p=>!pris.has(p.id) && (memeCommercant(p) || String(p.libelle||'').trim().toLowerCase()===nom))
    .sort((a,b)=>Math.abs(a.montant-abs)-Math.abs(b.montant-abs))[0] || null;
}
// Une mensualité attendue d'un paiement en plusieurs fois (même commerçant ou même
// nom), quel que soit son mois : la ligne la validera au lieu de créer une dépense.
function relevePpfAttendu(op, cle, libelle, pris){
  if(op.montant>=0) return null;
  const nom = String(libelle||'').trim().toLowerCase();
  const premier = cle.split(' ')[0];
  const abs = Math.abs(op.montant), mois = moisDe(op.date);
  const ecartMois = p => { const [a,b] = [moisDe(p.date), mois].map(k=>{ const [y,m] = k.split('-').map(Number); return y*12+m; }); return Math.abs(a-b); };
  const memeCommercant = p => { const c = p.cle || releveCle(p.libelle); return c===cle || (premier.length>=4 && c.split(' ')[0]===premier); };
  return ppfPrevisions()
    .filter(p=>!pris.has(p.id) && (memeCommercant(p) || String(p.libelle||'').trim().toLowerCase()===nom))
    .sort((a,b)=>ecartMois(a)-ecartMois(b) || Math.abs(a.montant-abs)-Math.abs(b.montant-abs))[0] || null;
}
// Une échéance attendue d'une charge (même fournisseur ou même nom), à une période
// près : la ligne la validera au lieu de créer une dépense. Le montant peut
// différer (régularisation, hausse) ; à défaut, la plus proche l'emporte.
function releveChgAttendu(op, cle, libelle, pris){
  if(op.montant>=0) return null;
  const nom = String(libelle||'').trim().toLowerCase();
  const premier = cle.split(' ')[0];
  const abs = Math.abs(op.montant), mois = moisDe(op.date);
  const ecartMois = p => { const [a,b] = [moisDe(p.date), mois].map(k=>{ const [y,m] = k.split('-').map(Number); return y*12+m; }); return Math.abs(a-b); };
  const memeFournisseur = p => { const c = p.cle || releveCle(p.libelle); return c===cle || (premier.length>=4 && c.split(' ')[0]===premier); };
  return chgPrevisions()
    .filter(p=>!pris.has(p.id) && ecartMois(p) <= Math.max(1, chgPeriode(p)-1) && (memeFournisseur(p) || String(p.libelle||'').trim().toLowerCase()===nom))
    .sort((a,b)=>ecartMois(a)-ecartMois(b) || Math.abs(a.montant-abs)-Math.abs(b.montant-abs))[0] || null;
}
// Un prélèvement d'abonnement ou une mensualité déjà validé à la main (pas par un
// import) pour ce commerçant, dans le même mois ou à quelques jours : la ligne du
// relevé est le même paiement, elle est mise en « Ne pas importer ». Le montant peut
// différer (validé avec un autre prix) ; à défaut, la date la plus proche l'emporte.
function releveSerieDejaValidee(op, cle, libelle, pris){
  if(op.montant>=0) return '';
  const nom = String(libelle||'').trim().toLowerCase();
  const premier = cle.split(' ')[0];
  const jours = d => Math.abs(new Date(d+'T00:00:00') - new Date(op.date+'T00:00:00')) / 86400000;
  const memeCommercant = d => { const c = d.cle || releveCle(d.libelle); return c===cle || (premier.length>=4 && c.split(' ')[0]===premier) || String(d.libelle||'').trim().toLowerCase()===nom; };
  const d = mesSorties()
    .filter(d=>(d.aboId || d.ppfId || d.chgId) && d.source!=='releve' && d.date && !pris.has(d.id) && memeCommercant(d) && (moisDe(d.date)===moisDe(op.date) || jours(d.date)<=5))
    .sort((a,b)=>jours(a.date)-jours(b.date))[0];
  if(!d) return '';
  pris.add(d.id);
  return `Déjà validé${d.ppfId || d.chgId ? 'e' : ''} à la main : ${d.libelle} (${d.ppfId ? 'mensualité' : d.chgId ? 'charge' : 'abonnement'} du ${fmtDate(d.date)})`;
}
function releveCreerLignes(ops){
  const modele = releveModele(false);
  const pris = new Set();
  const retenues = ops.filter(o=>o.date && isFinite(o.montant) && Math.abs(o.montant)>=0.005 && (o.libelle||'').trim())
    .sort((a,b)=>a.date.localeCompare(b.date));
  const empreintes = releveEmpreintes(retenues);
  return retenues.map((o, i)=>{
      const s = releveSuggestion(o, modele);
      const suivi = releveSerieDejaValidee(o, s.cle, s.libelle, pris) || releveDejaSuivi(o);
      const attendu = suivi ? null : releveAboAttendu(o, s.cle, s.libelle, pris);
      const mensualite = suivi || attendu ? null : relevePpfAttendu(o, s.cle, s.libelle, pris);
      const echeance = suivi || attendu || mensualite ? null : releveChgAttendu(o, s.cle, s.libelle, pris);
      if(suivi){ s.type = 'ignorer'; s.abo = false; s.chg = false; s.confiance = 'sur'; s.raison = suivi; }
      else if(echeance){
        pris.add(echeance.id);
        const ecart = Math.abs(Math.abs(o.montant) - echeance.montant) >= 0.005;
        Object.assign(s, {type:'depense', libelle:echeance.libelle, categorie:echeance.categorie||s.categorie, abo:false, ppf:false, chg:true, chgPeriode:String(chgPeriode(echeance)), confiance:'sur',
          raison: ecart ? `Charge attendue : ${echeance.libelle} · nouveau montant (avant ${fmtEUR(echeance.montant)})` : `Charge attendue : ${echeance.libelle}`});
      }
      else if(mensualite){
        pris.add(mensualite.id);
        const e = ppfEtat(mensualite.ppfId), dep = ppfDepassement(mensualite.ppfId, Math.abs(o.montant));
        // Une mensualité qui ferait dépasser le total n'est pas « sûre » : elle attend une vérification.
        Object.assign(s, {type:'depense', libelle:mensualite.libelle, categorie:mensualite.categorie||s.categorie, abo:false, chg:false, ppf:true, ppfTotal:releveMontantSaisie(e.total), confiance: dep ? 'devine' : 'sur',
          raison: dep ? `Mensualité attendue : ${mensualite.libelle} · dépasse le total de ${fmtEUR(dep)}, vérifie les montants` : `Mensualité attendue : ${mensualite.libelle} · reste ${fmtEUR(e.reste)}`});
      }
      else if(attendu){
        pris.add(attendu.id);
        const ecart = Math.abs(Math.abs(o.montant) - attendu.montant) >= 0.005;
        Object.assign(s, {type:'depense', libelle:attendu.libelle, categorie:attendu.categorie||s.categorie, abo:true, chg:false, confiance:'sur',
          raison: ecart ? `Abonnement attendu : ${attendu.libelle} · nouveau prix (avant ${fmtEUR(attendu.montant)})` : `Abonnement attendu : ${attendu.libelle}`});
      }
      const {cle, confiance, raison, ...valeurs} = s;
      return {id: uid(), empreinte: empreintes[i], date: o.date, brut: o.libelle.trim(), montant: r2(o.montant), cle, suivi: !!suivi, incertain: !!o.signeIncertain, ...(o.pos ? {pos: o.pos} : {}), confiance, raison, etat:'attente', ...(attendu ? {aboPrevId: attendu.id, aboSerieId: attendu.aboId} : {}), ...(mensualite ? {ppfPrevId: mensualite.id, ppfSerieId: mensualite.ppfId} : {}), ...(echeance ? {chgPrevId: echeance.id, chgSerieId: echeance.chgId} : {}), s:{...valeurs}, v:{...valeurs}};
    });
}

/* ---------- Session d'import ---------- */
function releveCleStockage(){ const me = currentUser(); return me ? 'releve_en_cours_'+me.id : null; }
export function releveChargerSession(){
  const me = currentUser();
  if(!me || releveSessionOwner===me.id) return;
  releveSessionOwner = me.id; releveSession = null;
  try{ const raw = localStorage.getItem(releveCleStockage()); if(raw) releveSession = JSON.parse(raw); }catch(e){ releveSession = null; }
}
export function releveSauverSession(){
  try{
    const k = releveCleStockage(); if(!k) return;
    if(releveSession) localStorage.setItem(k, JSON.stringify(releveSession)); else localStorage.removeItem(k);
  }catch(e){}
}
export async function releveOuvrirFichier(file){
  const nom = file.name || 'relevé';
  const ext = (nom.split('.').pop()||'').toLowerCase();
  const modele = releveModele(false);
  let res = null;
  try{
    if(ext==='pdf' || file.type==='application/pdf'){
      toast('Lecture du PDF…');
      let lignes;
      try{ lignes = await releveLirePdf(await file.arrayBuffer()); }
      catch(e){ console.error(e); toast('Impossible de lire ce PDF — essaie l’export CSV ou OFX de ta banque'); return; }
      const appris = modele.formats[releveSigTexte(lignes)];
      res = releveDepuisLignes(lignes, 'pdf', appris && appris.colonnes);
    } else {
      const texte = releveDecoder(await file.arrayBuffer());
      res = releveAnalyserTexte(texte, modele);
    }
  }catch(e){ console.error(e); toast('Ce fichier n’a pas pu être lu'); return; }
  await releveDemarrer(nom, res);
}
export async function releveDemarrer(nom, res){
  const lignes = res ? releveCreerLignes(res.ops||[]) : [];
  if(!lignes.length){ toast('Aucune opération trouvée — essaie l’export CSV ou OFX de ta banque'); return; }
  const modele = releveModele(false);
  releveSession = {nom, format: res.format, sig: res.sig||null, csv: res.csv||null, colonnes: res.colonnes||null, soldes: res.soldes||null, soldesLus: !!res.soldes,
    formatConnu: !!(res.sig && modele.formats[res.sig]), lignes, debut: new Date().toISOString()};
  releveAffichees = RELEVE_TRANCHE;
  releveFiltre = {q:'', conf:'', tri:''};
  releveSauverSession();
  await render();
  toast(`${lignes.length} opération${lignes.length>1?'s':''} à vérifier`);
}
// L'utilisateur corrige une colonne du CSV : on relit le fichier avec ce choix,
// et on le retient tout de suite pour les prochains relevés de même format.
export async function releveChangerColonne(el){
  const s = releveSession; if(!s || !s.csv) return;
  const champ = el.dataset.rlCol, val = Number(el.value);
  const col = {...s.csv.col};
  if(champ==='montantMode'){
    if(el.value==='un'){ col.montant = col.debit>=0 ? col.debit : 0; col.debit = col.credit = -1; }
    else{ col.debit = col.montant>=0 ? col.montant : 0; col.credit = Math.min(col.debit+1, s.csv.nbCol-1); col.montant = -1; }
  } else col[champ] = val;
  s.csv.col = col;
  const traitees = s.lignes.filter(l=>l.etat!=='attente'), ops = releveCsvOps(s.csv, col);
  s.lignes = [...traitees, ...releveCreerLignes(ops)];
  if(!s.soldes || s.soldes.colonne) s.soldes = releveCsvSoldeColonne(s.csv.rows, col, ops);
  const modele = releveModele(true);
  modele.formats[s.sig] = {...(modele.formats[s.sig]||{}), colonnes: col, nom: s.nom, maj: new Date().toISOString().slice(0,10)};
  s.formatConnu = true;
  releveSauverSession(); await persist(); await render();
}
// Passe une ligne en dépense ou en rentrée : le signe du montant suit (la
// banque se trompe parfois de sens), et la catégorie doit exister pour ce type.
function releveAppliquerType(l, type){
  l.v.type = type;
  if(type!=='depense'){ l.v.abo = false; l.v.ppf = false; l.v.chg = false; }
  if(type==='ignorer') return;
  if((type==='depense') !== (l.montant<0)) l.montant = -l.montant;
  const cats = myCategories(type==='revenu' ? 'revenus' : 'depenses').map(c=>c.nom);
  if(!cats.includes(l.v.categorie)){
    const regle = releveModele(false).regles[l.cle];
    l.v.categorie = regle && regle.type===type && regle.categorie ? regle.categorie : releveCategorieDefaut(type);
  }
}
// Inverse le sens d'une ligne mal reconnue (+ ↔ −).
function releveInverserSigne(id){
  const l = releveSession && releveSession.lignes.find(x=>x.id===id); if(!l) return false;
  releveBasculerSens(l);
  l.signeManuel = true;
  releveSauverSession();
  return true;
}
function releveBasculerSens(l){
  if(l.v.type==='ignorer') l.montant = -l.montant;
  else releveAppliquerType(l, l.montant<0 ? 'revenu' : 'depense');
}
// Une ligne mal reconnue (+ ↔ −) dans un PDF ou un texte collé : la colonne où se
// trouvait son montant est celle des entrées (ou des sorties). Solde corrige sa
// lecture du relevé — les autres lignes de cette colonne suivent — et la retient
// pour ce format à la validation. Renvoie le nombre d'autres lignes corrigées.
function releveApprendreColonne(id){
  const s = releveSession; if(!s || s.csv) return 0;
  const l = s.lignes.find(x=>x.id===id); if(!l || !l.pos) return 0;
  const k = l.montant<0 ? 'debit' : 'credit', autre = k==='debit' ? 'credit' : 'debit';
  const avant = s.colonnes || (s.sig && releveModele(false).formats[s.sig] || {}).colonnes || {};
  const col = {...avant};
  if(releveColonneDe(col, l.pos)===autre){
    // Débit et crédit étaient inversés : on les échange.
    if(col[k]!=null){ col[k] = avant[autre]; col[autre] = avant[k]; }
    else { delete col[autre]; col[k] = l.pos; }
  } else if(releveColonneDe(col, l.pos)!==k) col[k] = l.pos;
  s.colonnes = col;
  let n = 0;
  s.lignes.forEach(x=>{
    if(x===l || x.etat!=='attente' || !x.pos || x.signeManuel) return;
    const signe = releveSigneColonne(col, x.pos);
    if(signe && signe!==Math.sign(x.montant)){ releveBasculerSens(x); x.incertain = false; n++; }
  });
  releveSauverSession();
  return n;
}
// Montant tel qu'affiché dans le champ de saisie : sans signe (porté par le bouton + / −).
export function releveMontantSaisie(m){ return Math.abs(m).toFixed(2).replace('.', ','); }
// Corrige le montant d'une ligne mal lue. Sans signe tapé, le sens est conservé ;
// « -12 » ou « +12 » change aussi le sens (et donc le type). Renvoie vrai si le sens a changé.
function releveChangerMontant(l, el){
  const n = releveMontant(el.value);
  if(!isFinite(n) || Math.abs(n)<0.005){ el.value = releveMontantSaisie(l.montant); return false; }
  const signeTape = /[-−–+()]/.test(el.value);
  const montant = r2(signeTape ? n : (l.montant<0 ? -Math.abs(n) : Math.abs(n)));
  const sensChange = (montant<0) !== (l.montant<0);
  l.montant = montant;
  el.value = releveMontantSaisie(montant);
  if(sensChange && l.v.type!=='ignorer') releveAppliquerType(l, montant<0 ? 'depense' : 'revenu');
  return sensChange;
}
export function releveChangerChamp(el){
  const s = releveSession; if(!s) return;
  const l = s.lignes.find(x=>x.id===el.dataset.rlId); if(!l) return;
  const champ = el.dataset.rlChamp;
  if(champ==='montant'){
    if(releveChangerMontant(l, el)){ releveSauverSession(); return render(); }
    // Même structure de ligne : pas de re-render, pour que le clic sur « Valider »
    // qui a fait perdre le focus aboutisse.
    releveSauverSession();
    return;
  }
  if(champ==='aboSerie'){ releveChoisirAbo(l, el.value); l.aboChoisi = true; releveSauverSession(); return render(); }
  if(champ==='ppfSerie'){ releveChoisirPpf(l, el.value); l.ppfChoisi = true; delete l.erreur; releveSauverSession(); return render(); }
  if(champ==='chgSerie'){ releveChoisirChg(l, el.value); l.chgChoisi = true; releveSauverSession(); return render(); }
  if(champ==='type') releveAppliquerType(l, el.value);
  else l.v[champ] = el.value;
  releveSauverSession();
  if(champ==='type') return render();
}
// Paiement en plusieurs fois auquel la ligne correspond (ppfId, ou vide : nouveau
// paiement). La ligne prend son nom, sa catégorie et son montant total.
function releveChoisirPpf(l, ppfId){
  const e = ppfId ? ppfEtat(ppfId) : null;
  if(!e || !e.versees.length && !e.prevu){
    if(l.ppfSerieId){ l.v.ppfTotal = ''; }
    delete l.ppfSerieId; delete l.ppfPrevId; return;
  }
  l.ppfSerieId = ppfId;
  if(e.prevu) l.ppfPrevId = e.prevu.id; else delete l.ppfPrevId;
  l.v.libelle = e.libelle || l.v.libelle;
  if(e.categorie) l.v.categorie = e.categorie;
  l.v.ppfTotal = releveMontantSaisie(e.total);
}
// Charge à laquelle la ligne correspond (chgId d'une série, ou vide : nouvelle
// charge). La ligne prend le nom, la catégorie et la périodicité de la série.
function releveChoisirChg(l, chgId){
  const prev = chgId ? chgPrevisions().find(p=>p.chgId===chgId) : null;
  const ref = prev || (chgId ? chgSerie(chgId)[0] : null);
  if(!ref){ delete l.chgSerieId; delete l.chgPrevId; return; }
  l.chgSerieId = chgId;
  if(prev) l.chgPrevId = prev.id; else delete l.chgPrevId;
  l.v.libelle = ref.libelle || l.v.libelle;
  if(ref.categorie) l.v.categorie = ref.categorie;
  l.v.chgPeriode = String(chgPeriode(ref));
}
// Abonnement auquel la ligne correspond (aboId d'une série, ou vide : nouvel
// abonnement). La ligne prend le nom et la catégorie de la série, pour que deux
// abonnements chez le même commerçant restent distincts.
function releveChoisirAbo(l, aboId){
  const prev = aboId ? aboPrevisions().find(p=>p.aboId===aboId) : null;
  const ref = prev || (aboId ? mine(state.depenses).find(d=>d.aboId===aboId) : null);
  if(!ref){ delete l.aboSerieId; delete l.aboPrevId; return; }
  l.aboSerieId = aboId;
  if(prev) l.aboPrevId = prev.id; else delete l.aboPrevId;
  l.v.libelle = ref.libelle || l.v.libelle;
  if(ref.categorie) l.v.categorie = ref.categorie;
}
// Retient la décision de l'utilisateur : règle du commerçant, mots du libellé,
// format du fichier, et si la suggestion était juste.
export function releveApprendre(modele, l){
  const v = l.v, s = l.s;
  const juste = v.type===s.type && (v.type==='ignorer' || v.categorie===s.categorie);
  modele.historique.push(juste ? 1 : 0);
  if(modele.historique.length>300) modele.historique = modele.historique.slice(-300);
  if(l.suivi && v.type==='ignorer') return; // ignorée parce que déjà suivie ailleurs : rien à retenir sur ce commerçant
  if(l.regul) return; // régularisation de solde : pas un commerçant
  const prev = modele.regles[l.cle], maj = new Date().toISOString().slice(0,10);
  const decision = v.type==='ignorer' ? {type:'ignorer', maj} : {type:v.type, libelle:(v.libelle||'').trim(), categorie:v.categorie||'', ...(v.type==='depense' && v.abo ? {abo:true} : {}), ...(v.type==='depense' && v.chg ? {chg:true, chgPeriode:chgPeriode(v.chgPeriode)} : {}), maj};
  const memeQue = r => r && r.type===v.type && (v.type==='ignorer' || r.categorie===v.categorie);
  if(prev && prev.type!=='ignorer' && v.type!=='ignorer' && prev.type!==v.type){
    // Sens opposé à l'habitude (un remboursement chez un commerçant en dépense,
    // et inversement) : retenu à part, sans écraser la règle majoritaire. Il ne
    // prend la place de celle-ci que s'il devient le plus fréquent.
    const inverse = {...decision, n: memeQue(prev.inverse) ? prev.inverse.n+1 : 1};
    if(inverse.n > prev.n){ const {inverse: _, ...ancien} = prev; modele.regles[l.cle] = {...inverse, inverse: ancien}; }
    else prev.inverse = inverse;
  } else {
    const garde = v.type!=='ignorer' && prev && prev.inverse ? {inverse: prev.inverse} : {};
    modele.regles[l.cle] = {...decision, n: memeQue(prev) ? prev.n+1 : 1, ...garde};
  }
  const lab = v.type==='ignorer' ? 'ignorer|' : `${v.type}|${v.categorie||''}`;
  new Set(releveMots(l.brut)).forEach(w=>{ const e = modele.mots[w] || (modele.mots[w] = {}); e[lab] = (e[lab]||0) + 1; });
}
/* ---------- Écriture dans les données ----------
   Point unique : toute ligne validée du relevé est écrite par releveEcrireLigne,
   qui refuse d'abord une opération déjà importée (même empreinte, voir
   releveEmpreintes) — même relevé importé deux fois, sur deux appareils, ou
   relu après un changement de colonnes. Chaque dépense ou revenu créé garde
   l'empreinte de sa ligne (releveEmpreinte). */
// Lignes d'une session ouverte avant l'empreinte : on la calcule à partir de ce qu'on a.
function releveCompleterEmpreintes(s){
  if(s.lignes.every(l=>l.empreinte)) return;
  const e = releveEmpreintes(s.lignes.map(l=>({date:l.date, montant:l.montant, libelle:l.brut})));
  s.lignes.forEach((l,i)=>{ if(!l.empreinte) l.empreinte = e[i]; });
}
// Dépenses et revenus déjà importés de l'utilisateur, par empreinte.
function releveDejaImportees(){
  const m = new Map();
  mine(state.depenses).concat(mine(state.revenusExceptionnels)).forEach(x=>{ if(x.releveEmpreinte && !x.prevu) m.set(x.releveEmpreinte, x); });
  return m;
}
// Écrit une ligne validée. ecrites : releveDejaImportees(), complétée au fur et à mesure.
// Renvoie {statut:'ajoutee'|'ignoree'|'doublon'|'bloquee', genre:'chg'|'ppf'|'abo'|''}.
function releveEcrireLigne(l, me, ecrites){
  const v = l.v, montant = r2(Math.abs(l.montant)), libelle = (v.libelle||'').trim() || releveJoli(l.cle), notes = (v.notes||'').trim();
  delete l.erreur;
  if(v.type!=='depense' && v.type!=='revenu') return {statut:'ignoree', genre:''};
  const deja = l.empreinte && ecrites.get(l.empreinte);
  if(deja){
    l.raison = `Déjà importée : ${deja.libelle} (${fmtDate(deja.date)})`;
    return {statut:'doublon', genre:''};
  }
  const trace = l.empreinte ? {releveEmpreinte: l.empreinte} : {};
  const valeurs = extra => ({libelle, categorie:v.categorie||'', montant, date:l.date, notes, source:'releve', ...extra, ...trace});
  const nouvelleDepense = extra => { const d = {id:uid(), ownerId:me.id, modePaiement:'Unique', ...valeurs(extra)}; state.depenses.push(d); return d; };
  let ecrite, genre = '';
  if(v.type==='revenu'){
    ecrite = {id:uid(), ownerId:me.id, ...valeurs({categorie:v.categorie||releveCategorieDefaut('revenu')})};
    state.revenusExceptionnels.push(ecrite);
  } else if(v.chg){
    // L'échéance attendue est validée avec ce que dit le relevé ; sinon la dépense
    // rejoint la charge choisie, ou en démarre une nouvelle.
    const prev = l.chgPrevId ? chgPrevisions().find(p=>p.id===l.chgPrevId) : null;
    if(prev) ecrite = chgValider(prev, valeurs({cle:prev.cle||l.cle}));
    else {
      ecrite = nouvelleDepense({cle:l.cle});
      if(l.chgSerieId && chgSerie(l.chgSerieId).some(x=>x!==ecrite)) chgRattacher(ecrite, l.chgSerieId); else chgDemarrer(ecrite, v.chgPeriode);
    }
    genre = 'chg';
  } else if(v.ppf){
    // Paiement en plusieurs fois : il faut le montant total, et la mensualité ne doit pas le faire dépasser.
    const total = r2(Math.abs(releveMontant(v.ppfTotal)) || 0);
    const prev = l.ppfPrevId ? ppfPrevisions().find(p=>p.id===l.ppfPrevId) : null;
    // Paiement choisi dont la mensualité prévue a déjà été validée (par une autre ligne) : la dépense rejoint sa série.
    const serie = !prev && l.ppfSerieId && ppfSerie(l.ppfSerieId).length ? l.ppfSerieId : null;
    if(!(total>0)){ l.erreur = 'Indique le montant total à payer'; return {statut:'bloquee', genre:''}; }
    const dep = prev || serie ? ppfDepassement(prev ? prev.ppfId : serie, montant, total) : (montant > total - PPF_EPS ? r2(montant - total) : 0);
    if(dep || (!prev && !serie && montant >= total - PPF_EPS)){ l.erreur = dep ? ppfMessageDepassement(dep, total) : 'La mensualité égale le total : c’est un paiement en une fois'; return {statut:'bloquee', genre:''}; }
    if(prev){
      ppfFixerTotal(prev.ppfId, total);
      ppfValider(prev, valeurs({cle:prev.cle||l.cle}));
      ecrite = prev;
    } else if(serie){
      ecrite = nouvelleDepense({cle:l.cle});
      ppfFixerTotal(serie, total);
      ppfRattacher(ecrite, serie);
    } else {
      ecrite = nouvelleDepense({cle:l.cle});
      ppfDemarrer(ecrite, total);
    }
    genre = 'ppf';
  } else {
    const attendu = v.abo && l.aboPrevId ? aboPrevisions().find(p=>p.id===l.aboPrevId) : null;
    if(attendu){
      // Le prélèvement attendu est validé avec ce que dit le relevé (date, montant).
      ecrite = aboValider(attendu, valeurs({cle:attendu.cle||l.cle}));
      genre = 'abo';
    } else if(v.abo){
      ecrite = nouvelleDepense({cle:l.cle});
      // Abonnement choisi dont le prélèvement prévu a déjà été validé (par une autre ligne) : la dépense rejoint sa série.
      if(l.aboSerieId && mine(state.depenses).some(d=>d.aboId===l.aboSerieId)) aboRattacher(ecrite, l.aboSerieId); else aboDemarrer(ecrite);
      genre = 'abo';
    } else ecrite = nouvelleDepense({});
  }
  if(l.empreinte) ecrites.set(l.empreinte, ecrite);
  return {statut:'ajoutee', genre};
}
export async function releveValider(ids){
  const s = releveSession; if(!s) return;
  const me = currentUser(), modele = releveModele(true);
  let ajoutees = 0, ignorees = 0, doublons = 0, abos = 0, ppfs = 0, chgs = 0;
  const bloquees = [];
  const parId = new Map(s.lignes.map(l=>[l.id, l]));
  releveCompleterEmpreintes(s);
  const ecrites = releveDejaImportees();
  ids.forEach(id=>{
    const l = parId.get(id); if(!l || l.etat!=='attente') return;
    const {statut, genre} = releveEcrireLigne(l, me, ecrites);
    if(statut==='bloquee'){ bloquees.push(l); return; }
    if(statut==='doublon'){
      // Rien n'est écrit : la ligne passe en « Ne pas importer », sans rien apprendre du commerçant.
      l.v.type = 'ignorer'; l.suivi = true; l.etat = 'ignoree'; doublons++;
      return;
    }
    if(statut==='ajoutee'){ ajoutees++; if(genre==='chg') chgs++; else if(genre==='ppf') ppfs++; else if(genre==='abo') abos++; }
    else ignorees++;
    l.etat = statut==='ajoutee' ? 'validee' : 'ignoree';
    releveApprendre(modele, l);
  });
  if(bloquees.length){
    // Rien n'est validé sans les bons montants : la ligne reste en attente, avec la raison.
    releveSauverSession();
    if(ajoutees+ignorees+doublons===0){
      releveFocusApres = null;
      await render();
      const l = bloquees[0];
      document.querySelector(`.rl-row[data-rl-row="${l.id}"] [data-rl-champ="${(Number(releveMontant(l.v.ppfTotal))||0)>0 ? 'montant' : 'ppfTotal'}"]`)?.focus();
      toast(bloquees.length>1 ? `${fmtCount(bloquees.length,'mensualité','mensualités')} à vérifier : montant total manquant ou dépassé` : l.erreur);
      return;
    }
  }
  if(ajoutees+ignorees+doublons===0) return;
  if(ajoutees+ignorees===0){
    // Que des doublons : rien n'a changé dans les données, la ligne est juste rangée.
    releveSauverSession(); await render();
    toast(doublons>1 ? `${doublons} opérations déjà importées : rien n’a été ajouté` : 'Opération déjà importée : rien n’a été ajouté');
    return;
  }
  releveRetenirSolde(s);
  // Le format du fichier est retenu dès la première ligne acceptée.
  if(s.sig && (s.csv || s.colonnes)){
    const f = modele.formats[s.sig] || {};
    if(!s.formatRetenu){ f.imports = (f.imports||0) + 1; s.formatRetenu = true; }
    modele.formats[s.sig] = {...f, colonnes: s.csv ? s.csv.col : (s.colonnes || f.colonnes), nom: s.nom, maj: new Date().toISOString().slice(0,10)};
  }
  const majs = releveRafraichirAttente(s);
  releveSauverSession();
  await persist(); await render();
  const msg = ajoutees && ignorees ? `${ajoutees} ajoutée${ajoutees>1?'s':''}, ${ignorees} ignorée${ignorees>1?'s':''}` : ajoutees ? (ajoutees>1 ? `${ajoutees} opérations ajoutées` : 'Opération ajoutée') : (ignorees>1 ? `${ignorees} lignes ignorées` : 'Ligne ignorée');
  const msgAbo = (chgs ? ` · ${fmtCount(chgs, 'charge', 'charges')}` : '') + (abos ? ` · ${fmtCount(abos, 'abonnement', 'abonnements')}` : '') + (ppfs ? ` · ${fmtCount(ppfs, 'mensualité', 'mensualités')}` : '')
    + (bloquees.length ? ` · ${fmtCount(bloquees.length, 'mensualité à vérifier', 'mensualités à vérifier')}` : '')
    + (doublons ? ` · ${fmtCount(doublons, 'déjà importée, non ajoutée', 'déjà importées, non ajoutées')}` : '');
  toast(majs ? `${msg}${msgAbo} · ${fmtCount(majs, 'autre ligne mise à jour', 'autres lignes mises à jour')}` : msg + msgAbo);
}
// Après chaque validation, les lignes encore en attente profitent de ce qui
// vient d'être appris (« CARREFOUR » validé en Courses → les autres CARREFOUR
// du relevé passent en Courses). Une ligne que l'utilisateur a déjà modifiée
// garde ses choix, et une ligne déjà suivie ailleurs reste ignorée.
const RELEVE_CHAMPS_SUGGERES = ['type','libelle','categorie','abo','ppf','chg'];
function releveRafraichirAttente(s){
  const modele = releveModele(false);
  let n = 0;
  s.lignes.forEach(l=>{
    l.maj = false;
    if(l.etat!=='attente' || l.suivi || l.regul || l.aboPrevId || l.aboChoisi || l.ppfPrevId || l.ppfChoisi || l.chgPrevId || l.chgChoisi) return;
    if(RELEVE_CHAMPS_SUGGERES.some(k=>(l.v[k]||'')!==(l.s[k]||''))) return;
    const {cle, confiance, raison, ...valeurs} = releveSuggestion({libelle:l.brut, montant:l.montant, signeIncertain:l.incertain}, modele);
    const change = RELEVE_CHAMPS_SUGGERES.some(k=>(valeurs[k]||'')!==(l.s[k]||''));
    if(change){ l.v = {...l.v, ...valeurs}; l.s = {...valeurs}; l.maj = true; n++; }
    if(change || confiance!==l.confiance){ l.confiance = confiance; l.raison = raison; }
  });
  return n;
}
// Contrôle des soldes : solde de début + toutes les opérations du relevé (même
// celles qu'on n'importe pas : elles ont bien eu lieu sur le compte) = solde de
// fin. Une régularisation refusée ne compte pas.
function releveControleSoldes(s){
  if(!s || !s.soldes || !Number.isFinite(s.soldes.debut) || !Number.isFinite(s.soldes.fin)) return null;
  const somme = sumR2(s.lignes.filter(l=>!(l.regul && l.etat==='ignoree')), l=>l.montant);
  const ecart = r2(s.soldes.fin - s.soldes.debut - somme);
  return {somme, ecart, ok: Math.abs(ecart)<0.005};
}
// Solde de fin du relevé : retenu comme solde du compte dès qu'une ligne est
// validée (et mis à jour s'il est corrigé ensuite). Le reste à vivre s'aligne
// dessus : un écart entre les soldes et les opérations ne devient plus une ligne
// de régularisation, qui faussait revenus et dépenses du mois.
function releveDateSoldeFin(s){ return s.soldes.dateFin || s.lignes.map(x=>x.date).filter(Boolean).sort().pop() || null; }
function releveRetenirSolde(s){
  const sl = s && s.soldes; if(!sl || !Number.isFinite(sl.fin)) return null;
  const date = releveDateSoldeFin(s); if(!date) return null;
  const r = soldeCompteFixer(date, sl.fin, 'releve', s.soldeId);
  if(r) s.soldeId = r.id;
  return r;
}
export function releveSoldesHTML(s){
  const c = releveControleSoldes(s); if(!c) return '';
  const {debut, fin} = s.soldes;
  if(c.ok) return `<p class="rl-soldes is-ok">${icon('check')}<span>Soldes cohérents : ${fmtEUR(debut)} au début, ${c.somme<0?'−':'+'}&nbsp;${fmtEUR(Math.abs(c.somme))} d’opérations, ${fmtEUR(fin)} à la fin, retenu comme solde du compte.</span></p>`;
  const date = releveDateSoldeFin(s);
  return `<div class="rl-soldes" role="status">
    <p><strong>Les soldes ne concordent pas.</strong> Le relevé passe de ${fmtEUR(debut)} à ${fmtEUR(fin)}, soit ${fmtEUR(r2(fin-debut))}, mais ses opérations font ${fmtEUR(c.somme)} : écart de <strong>${c.ecart<0?'−':'+'}&nbsp;${fmtEUR(Math.abs(c.ecart))}</strong>. Une opération manque ou est mal lue : vérifie les montants et leur sens. Le solde de fin (${fmtEUR(fin)}${date ? ` au ${fmtDate(date)}` : ''}) sera retenu comme solde du compte : ton reste à vivre le reprendra tel quel.</p>
  </div>`;
}
// Soldes de début et de fin : pré-remplis avec ceux lus sur le relevé, modifiables
// tant que l'import est ouvert (relevé mal lu, ou soldes absents du fichier).
function releveSoldeSaisie(n){ return Number.isFinite(n) ? n.toFixed(2).replace('.', ',') : ''; }
export function releveSaisieSoldesHTML(s){
  const sl = s.soldes || {};
  const champ = (k, label) => `<div class="field"><label for="rl-solde-${k}">${label}</label>
    <span class="rl-solde-ctl"><input class="rl-ctl" id="rl-solde-${k}" data-rl-solde="${k}" value="${releveSoldeSaisie(sl[k])}" placeholder="Non trouvé" autocomplete="off"><span aria-hidden="true">€</span></span></div>`;
  return `<div class="rl-soldes-saisie">
    ${champ('debut', 'Solde au début')}${champ('fin', 'Solde à la fin')}
    <p class="field-note">${s.soldesLus ? 'Lus sur le relevé : corrige-les si besoin.' : 'Pas trouvés sur le relevé : saisis-les pour vérifier l’import.'} En fin d’import, le solde de début plus les opérations doit donner celui de fin.</p>
  </div>`;
}
export function releveChangerSolde(el){
  const s = releveSession; if(!s) return;
  const k = el.dataset.rlSolde, t = el.value.trim(), n = t ? releveMontant(t) : NaN;
  if(t && isNaN(n)){ toast('Montant non reconnu'); el.value = releveSoldeSaisie((s.soldes||{})[k]); return; }
  // Un solde saisi ne sera plus recalculé depuis la colonne Solde du CSV.
  s.soldes = {...(s.soldes||{}), [k]: t ? r2(n) : null, colonne: false};
  el.value = releveSoldeSaisie(s.soldes[k]);
  // Solde déjà retenu (lignes validées) : il suit la correction.
  if(k==='fin' && s.soldeId && releveRetenirSolde(s)) persist();
  releveSauverSession();
  const ctl = document.getElementById('rl-controle');
  if(ctl) ctl.innerHTML = releveSoldesHTML(s);
}
export function releveRetirerCategorie(type, nom){
  if(!releveSession) return;
  const t = type==='revenus' ? 'revenu' : type==='depenses' ? 'depense' : null;
  releveSession.lignes.forEach(l=>{ if(l.etat==='attente' && l.v.type===t && l.v.categorie===nom) l.v.categorie = ''; });
  releveSauverSession();
}
export function relevePrecision(historique, n){
  const h = historique.slice(-n);
  return h.length ? h.reduce((a,b)=>a+b,0)/h.length : null;
}
