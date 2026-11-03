/* Synchronisation : export/import de fichier, GitHub (fusion à trois versions), sondage périodique, et actions de stockage. */
import { clearSession, currentUser, getSession, sha256 } from './auth.js';
import { wipeUserData } from './comptes.js';
import { notifBadgeCount, renderNotifPanel } from './notifications.js';
import { render } from './routeur.js';
import { authState, currentView, defaultSocial, OWNED_ARRAYS, persist, persistAuth, persistSocial,
  setAuthState, setSocialState, setState, socialState, state } from './store.js';
import { icon } from './ui/icones.js';
import { toast } from './ui/modale.js';
import { renderSidebar } from './ui/nav.js';
import { esc } from './utils.js';

/* ---- Stockage : synchronisation GitHub, export et import de fichier ---- */
async function actionGhConnect(){
  const token = document.getElementById('gh-token').value.trim();
  if(!token) return toast('Renseigne le jeton d\u2019accès');
  if(!(await isValidGhToken(token))) return toast('Ce jeton ne correspond pas au jeton attendu pour ce budget');
  try{
    await ghTestAndConnect(token);
    await ghPush(); // crée le fichier avec les données actuelles si le dépôt était vide
    await render(); toast('GitHub connecté');
  }catch(e){ toast('Connexion impossible — vérifie le jeton'); }
}
async function actionGhSyncNow(){
  await ghPull(); await ghPush(); await render(); toast(ghLastError || 'Synchronisé');
}
function actionExportData(){
  exportData();
}
function actionImportData(){
  document.getElementById('import-file-input').click();
}
export const actionsStockage = {
  'gh-connect': actionGhConnect,
  'gh-sync-now': actionGhSyncNow,
  'export-data': actionExportData,
  'import-data': actionImportData,
};
/* ============================== NETTOYAGE SOCIAL (fusion sûre lors des synchros) ============================== */
function mergeSocial(local, remote){
  const byId = (arr)=>{ const m=new Map(); (arr||[]).forEach(x=>m.set(x.id,x)); return m; };
  const mAcc = byId(local.accountRequests);
  (remote.accountRequests||[]).forEach(r=>{
    const existing = mAcc.get(r.id);
    // le statut le plus "avancé" gagne (une réponse locale ne doit pas être écrasée par un pending distant obsolète)
    if(!existing || (r.status!=='pending')) mAcc.set(r.id, r);
  });
  return { accountRequests: Array.from(mAcc.values()) };
}

let syncTimer = null;
export function markDirtyForSync(){
  if(!ghConfigured()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(()=>{ ghPush(); }, 1200);
}

/* Export / import manuel — solution universelle, marche sur tout navigateur,
   même en local. Utile en secours ou pour transférer les données une fois. */
function exportData(){
  const blob = new Blob([JSON.stringify({ auth: authState, budget: state, social: socialState }, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `solde-budget-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

export function importDataFile(file){
  const reader = new FileReader();
  reader.onload = async ()=>{
    try{
      const parsed = JSON.parse(reader.result);
      if(parsed && parsed.auth && parsed.budget){
        setAuthState(parsed.auth); setState(parsed.budget); setSocialState(parsed.social || defaultSocial());
      } else if(parsed && parsed.users){
        // ancien format (avant séparation) : les comptes étaient mélangés aux données
        setAuthState({ users: parsed.users });
        setState({ ...parsed }); delete state.users;
        setSocialState(defaultSocial());
      } else { throw new Error('format invalide'); }
      await Promise.all([persist(), persistAuth(), persistSocial()]);
      await render();
      toast('Données importées');
    }catch(e){ toast('Fichier invalide'); }
  };
  reader.readAsText(file);
}

/* ============================== SYNCHRONISATION GITHUB (recommandée) ============================== */
/* Stocke le fichier de données dans un dépôt GitHub PRIVÉ séparé (différent
   de celui qui héberge le site), via l'API GitHub. Fonctionne sur tout
   navigateur et tout appareil (y compris mobile), contrairement au dossier
   partagé qui nécessite Chrome/Edge sur PC. Chaque personne renseigne son
   propre jeton d'accès (Personal Access Token) à privilèges restreints. */
// Dépôt cible fixe — personne ne peut se connecter à un autre dépôt, quel que
// soit l'appareil. Seul le jeton reste à saisir (jamais publié, stocké
// uniquement en local sur l'appareil de chaque admin).
const GH_OWNER = 'shokin-kasegi';
const GH_REPO = 'mon-budget-data'; // dépôt PRIVÉ dédié aux données — jamais le dépôt public qui héberge le site
// Empreinte du jeton d'accès correct — jamais le jeton lui-même. Sert à refuser
// tout jeton différent de celui de l'admin, sans jamais l'exposer publiquement.
const GH_TOKEN_HASH = '679a45f1552062fc515be4aab52fbb6ba6f258a06f850cebec6165346876d63f';
export async function isValidGhToken(token){ return (await sha256(token||'')) === GH_TOKEN_HASH; }
function ghConfig(){
  let token = '';
  try{ token = JSON.parse(localStorage.getItem('github_sync_config')||'{}').token || ''; }catch(e){}
  return { owner:GH_OWNER, repo:GH_REPO, token, path:'data.json', authPath:'auth.json', socialPath:'social.json' };
}
function ghSaveToken(token){ localStorage.setItem('github_sync_config', JSON.stringify({token})); }
export function ghConfigured(){ return !!ghConfig().token; }
export let ghLastSync = null, ghLastError = null, ghErrorToastAt = 0;
// Synchro réussie / ratée : l'échec n'est plus silencieux (avant, chaque appareil
// gardait ses données dans son coin sans que personne ne le sache).
function ghOk(){ ghLastSync = new Date(); ghLastError = null; }
function ghFail(where, e){
  console.error('GitHub sync error ('+where+')', e);
  const status = Number(String(e && e.message || '').replace(/^HTTP /,''));
  ghLastError = status===401 ? 'Jeton GitHub expiré ou révoqué : reconnecte la synchronisation dans Paramètres.'
    : status===403 ? 'Accès refusé par GitHub (jeton sans droit d\u2019écriture, ou limite d\u2019appels atteinte).'
    : !navigator.onLine ? 'Hors connexion : les saisies seront envoyées au retour du réseau.'
    : 'Synchronisation impossible ('+(e && e.message || 'erreur inconnue')+').';
  if(Date.now() - ghErrorToastAt > 60000){ ghErrorToastAt = Date.now(); toast(ghLastError); }
}

// Par tranches : String.fromCharCode(...octets) d'un seul coup dépasse la pile
// dès ~125 Ko sur Chrome (moins sur Safari iOS), et tout envoi échouait alors.
function b64EncodeUnicode(str){
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for(let i=0; i<bytes.length; i+=0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i+0x8000));
  return btoa(bin);
}
function b64DecodeUnicode(str){
  const bin = atob(str.replace(/\s/g,''));
  const bytes = new Uint8Array(bin.length);
  for(let i=0; i<bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function ghHeaders(token){ return { 'Authorization':'Bearer '+token, 'Accept':'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28' }; }
function ghUrl(cfg, path){ return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${path}`; }
/* Lit un fichier du dépôt : {sha, text}, ou null s'il n'existe pas. Au-delà de
   1 Mo, l'API « contents » renvoie un contenu vide : on le relit alors par son
   blob (jusqu'à 100 Mo). Le paramètre t évite toute copie en cache. */
async function ghGetFile(cfg, path){
  const res = await fetch(ghUrl(cfg, path)+'?t='+Date.now(), { headers: ghHeaders(cfg.token), cache:'no-store' });
  if(res.status===404) return null;
  if(!res.ok) throw new Error('HTTP '+res.status);
  const data = await res.json();
  let content = data.content || '';
  if(!content && data.size>0){
    const blob = await fetch(`https://api.github.com/repos/${cfg.owner}/${cfg.repo}/git/blobs/${data.sha}?t=${Date.now()}`, { headers: ghHeaders(cfg.token), cache:'no-store' });
    if(!blob.ok) throw new Error('HTTP '+blob.status);
    content = (await blob.json()).content || '';
  }
  return { sha:data.sha, text: b64DecodeUnicode(content) };
}
// JSON compact : un fichier deux fois plus petit, donc des envois plus rapides.
function ghBody(message, obj, sha){
  const body = { message, content: b64EncodeUnicode(JSON.stringify(obj)) };
  if(sha) body.sha = sha;
  return JSON.stringify(body);
}

export async function ghPull(){
  const a = await ghPullAuth();
  const b = await ghPullBudget(true);
  const c = await ghPullSocial(true);
  return a || b || c;
}
/* Fusion du budget à trois versions : cet appareil, GitHub, et la « base » —
   la dernière version que cet appareil sait être identique à GitHub (gardée
   dans budget_sync_base). Élément par élément (par id) :
   - modifié seulement ici → on garde la version d'ici ;
   - modifié seulement sur GitHub (autre appareil, même compte, ou partenaire)
     → on prend celle de GitHub ;
   - modifié des deux côtés → celle d'ici (pas encore envoyée, donc la plus
     récente en pratique) ;
   une suppression compte comme une modification, elle se propage donc aussi.
   Sans base (premier passage après cette mise à jour), GitHub l'emporte sur
   les éléments communs et rien de ce qui n'existe qu'ici n'est perdu. */
const BUDGET_BASE_KEY = 'budget_sync_base';
function stableStringify(v){
  if(Array.isArray(v)) return '['+v.map(stableStringify).join(',')+']';
  if(v && typeof v==='object') return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stableStringify(v[k])).join(',')+'}';
  return JSON.stringify(v);
}
function ownedPart(obj){ const out = {}; OWNED_ARRAYS.forEach(k=>{ out[k] = (obj&&obj[k])||[]; }); return out; }
function loadBudgetBase(){ try{ return JSON.parse(localStorage.getItem(BUDGET_BASE_KEY)||'null'); }catch(e){ return null; } }
function saveBudgetBase(obj){ try{ localStorage.setItem(BUDGET_BASE_KEY, JSON.stringify(ownedPart(obj))); }catch(e){} }
function mergeArray3(localArr, remoteArr, baseArr){
  const keyOf = x=>(x && x.id!=null) ? 'id:'+x.id : 'v:'+stableStringify(x);
  const index = arr=>{ const m = new Map(); (arr||[]).forEach(x=>m.set(keyOf(x), x)); return m; };
  const L = index(localArr), R = index(remoteArr), B = baseArr ? index(baseArr) : null;
  const out = [];
  new Set([...L.keys(), ...R.keys()]).forEach(k=>{
    const l = L.get(k), r = R.get(k);
    let pick;
    if(!B){ pick = r!==undefined ? r : l; }
    else{
      const sb = B.has(k) ? stableStringify(B.get(k)) : undefined;
      const sl = l!==undefined ? stableStringify(l) : undefined;
      const sr = r!==undefined ? stableStringify(r) : undefined;
      pick = (sl===sb && sr!==sb) ? r : l;
    }
    if(pick!==undefined) out.push(pick);
  });
  return out;
}
function mergeBudget(local, remote, base){
  const merged = {...local};
  const supprimes = new Set(authState.deletedUserIds||[]);
  OWNED_ARRAYS.forEach(key=>{ merged[key] = mergeArray3(local[key], remote[key], base ? (base[key]||[]) : null).filter(x=>!supprimes.has(x.ownerId)); });
  return merged;
}
function budgetDiffers(a, b){ return stableStringify(ownedPart(a))!==stableStringify(ownedPart(b)); }
// Réaffiche si une synchro a apporté des changements, sauf pendant une saisie.
async function renderAfterRemoteChange(){
  const modal = document.getElementById('modal-root');
  if(modal && modal.innerHTML) return;
  if(currentUser()) await render();
}
async function ghFetchBudget(cfg){
  const f = await ghGetFile(cfg, cfg.path||'data.json');
  if(!f) return { sha:null, remote:null };
  const remote = JSON.parse(f.text);
  return { sha:f.sha, remote: (remote && remote.selectedMonth!==undefined) ? remote : null };
}

async function ghPullBudget(merge){
  const cfg = ghConfig();
  if(!cfg.owner || !cfg.repo || !cfg.token) return false;
  try{
    const { remote } = await ghFetchBudget(cfg);
    if(!remote) return false;
    const before = state;
    setState(merge ? mergeBudget(state, remote, loadBudgetBase()) : remote);
    saveBudgetBase(remote);
    localStorage.setItem('budget_store', JSON.stringify(state));
    ghOk();
    // Des saisies d'ici pas encore sur GitHub (ex. faites hors connexion) : on les envoie.
    if(budgetDiffers(state, remote)) markDirtyForSync();
    return budgetDiffers(before, state);
  }catch(e){ ghFail('budget', e); return false; }
}
/* Fusion des comptes, sur le même principe que le budget (trois versions,
   base gardée dans auth_sync_base) : un compte créé ici mais pas encore
   envoyé n'est jamais perdu, et une ancienne copie d'un compte (mot de passe,
   rôle…) ne vient pas écraser celle, plus récente, qui est sur GitHub.
   Les comptes supprimés sont notés dans deletedUserIds : cette liste ne fait
   que grandir et passe d'appareil en appareil, si bien qu'un téléphone ou un
   PC qui a encore une copie du compte ne peut plus le faire réapparaître —
   ni lui, ni ses données. */
const AUTH_BASE_KEY = 'auth_sync_base';
function loadAuthBase(){ try{ return JSON.parse(localStorage.getItem(AUTH_BASE_KEY)||'null'); }catch(e){ return null; } }
function saveAuthBase(obj){ try{ localStorage.setItem(AUTH_BASE_KEY, JSON.stringify({users:obj.users||[]})); }catch(e){} }
function mergeAuth(local, remote, base){
  const deletedUserIds = [...new Set([...(local.deletedUserIds||[]), ...(remote.deletedUserIds||[])])];
  const supprimes = new Set(deletedUserIds);
  const users = mergeArray3(local.users, remote.users, base ? (base.users||[]) : null).filter(u=>!supprimes.has(u.id));
  // le code d'installation, une fois consommé quelque part, reste consommé partout
  return {...local, users, deletedUserIds, setupCodeUsed: !!(local.setupCodeUsed || remote.setupCodeUsed)};
}
function authDiffers(a, b){
  const part = x=>({users:(x&&x.users)||[], deletedUserIds:[...((x&&x.deletedUserIds)||[])].sort(), setupCodeUsed:!!(x&&x.setupCodeUsed)});
  return stableStringify(part(a))!==stableStringify(part(b));
}
// Supprime un compte (et ses données) de façon définitive, y compris sur les autres appareils.
export function supprimerCompte(userId){
  authState.users = authState.users.filter(x=>x.id!==userId);
  authState.deletedUserIds = [...new Set([...(authState.deletedUserIds||[]), userId])];
  socialState.accountRequests = socialState.accountRequests.filter(r=>r.fromId!==userId);
  wipeUserData(userId);
}
async function ghFetchAuth(cfg){
  const f = await ghGetFile(cfg, cfg.authPath||'auth.json');
  if(!f) return { sha:null, remote:null };
  const remote = JSON.parse(f.text);
  return { sha:f.sha, remote: (remote && remote.users) ? remote : null };
}
async function ghPullAuth(){
  const cfg = ghConfig();
  if(!cfg.owner || !cfg.repo || !cfg.token) return false;
  try{
    const { remote } = await ghFetchAuth(cfg);
    if(!remote) return false;
    const before = authState;
    setAuthState(mergeAuth(authState, remote, loadAuthBase()));
    saveAuthBase(remote);
    localStorage.setItem('budget_auth', JSON.stringify(authState));
    // Un compte supprimé ailleurs : ses données disparaissent aussi d'ici.
    if((authState.deletedUserIds||[]).length){
      const avant = stableStringify(ownedPart(state));
      authState.deletedUserIds.forEach(wipeUserData);
      if(stableStringify(ownedPart(state))!==avant) localStorage.setItem('budget_store', JSON.stringify(state));
    }
    ghOk();
    if(authDiffers(authState, remote)) markDirtyForSync();
    return authDiffers(before, authState);
  }catch(e){ ghFail('auth', e); return false; }
}
// La session ouverte ici appartient à un compte supprimé depuis un autre appareil : on déconnecte.
// Idem si son mot de passe a été changé ailleurs : il faut se reconnecter.
function sessionRevoquee(){
  const s = getSession();
  if(!s || currentUser()) return false;
  if(authState.users.some(u=>u.id===s.userId)){
    try{ sessionStorage.setItem('budget_logout_reason', 'Ton mot de passe a été modifié. Reconnecte-toi avec le nouveau.'); }catch(e){}
  }
  clearSession(); stopPolling(); location.reload();
  return true;
}
async function ghPullSocial(merge){
  const cfg = ghConfig();
  if(!cfg.owner || !cfg.repo || !cfg.token) return false;
  try{
    const f = await ghGetFile(cfg, cfg.socialPath||'social.json');
    if(!f) return false;
    const remote = JSON.parse(f.text);
    if(remote){
      setSocialState(merge ? mergeSocial(socialState, remote) : remote);
      localStorage.setItem('budget_social', JSON.stringify(socialState));
      ghOk();
      return true;
    }
    return false;
  }catch(e){ ghFail('social', e); return false; }
}
export async function ghPush(){
  const a = await ghPushAuth();
  const b = await ghPushBudget();
  const c = await ghPushSocial();
  return a || b || c;
}
/* Écrit un fichier sur GitHub, avec une nouvelle tentative automatique en cas de
   conflit (HTTP 409 — le fichier a changé entre-temps, ex. deux appareils qui
   synchronisent au même moment). On relit simplement le sha à jour et on
   réessaie, jusqu'à trois fois. */
async function ghPutWithRetry(path, dataObj, message, attempt){
  const cfg = ghConfig();
  if(!cfg.owner || !cfg.repo || !cfg.token) return false;
  try{
    const f = await ghGetFile(cfg, path);
    const res = await fetch(ghUrl(cfg, path), { method:'PUT', headers:{...ghHeaders(cfg.token), 'Content-Type':'application/json'}, body: ghBody(message, dataObj, f && f.sha) });
    if(res.status===409 && (attempt||0)<3){
      // Conflit : quelqu'un d'autre a écrit entre-temps. On relit et réessaie.
      return ghPutWithRetry(path, dataObj, message, (attempt||0)+1);
    }
    if(!res.ok){ throw new Error('HTTP '+res.status); }
    ghOk();
    return true;
  }catch(e){ ghFail(path, e); return false; }
}
/* Envoi du budget : on relit toujours GitHub juste avant et on fusionne, pour
   ne jamais écraser ce qu'un autre appareil a envoyé entre-temps (ex. un
   onglet resté ouvert sur le PC pendant qu'on saisit sur le téléphone). */
export async function ghPushBudget(attempt){
  const cfg = ghConfig();
  if(!cfg.owner || !cfg.repo || !cfg.token) return false;
  try{
    const { sha, remote } = await ghFetchBudget(cfg);
    let changedHere = false;
    if(remote){
      const merged = mergeBudget(state, remote, loadBudgetBase());
      changedHere = budgetDiffers(state, merged);
      setState(merged);
      localStorage.setItem('budget_store', JSON.stringify(state));
      if(!budgetDiffers(state, remote)){ saveBudgetBase(remote); ghOk(); if(changedHere) await renderAfterRemoteChange(); return true; }
    }
    const snapshot = JSON.parse(JSON.stringify(state));
    const res = await fetch(ghUrl(cfg, cfg.path||'data.json'), { method:'PUT', headers:{...ghHeaders(cfg.token), 'Content-Type':'application/json'}, body: ghBody('Mise à jour budget', snapshot, sha) });
    if(res.status===409 && (attempt||0)<3) return ghPushBudget((attempt||0)+1); // écrit entre-temps ailleurs : on refusionne
    if(!res.ok) throw new Error('HTTP '+res.status);
    saveBudgetBase(snapshot);
    ghOk();
    if(changedHere) await renderAfterRemoteChange();
    return true;
  }catch(e){ ghFail('budget', e); return false; }
}
// Envoi des comptes : comme pour le budget, on refusionne avec GitHub juste
// avant pour ne jamais écraser une suppression ou une modification faite ailleurs.
export async function ghPushAuth(attempt){
  const cfg = ghConfig();
  if(!cfg.owner || !cfg.repo || !cfg.token) return false;
  try{
    const { sha, remote } = await ghFetchAuth(cfg);
    if(remote){
      setAuthState(mergeAuth(authState, remote, loadAuthBase()));
      localStorage.setItem('budget_auth', JSON.stringify(authState));
      if(!authDiffers(authState, remote)){ saveAuthBase(remote); ghOk(); return true; }
    }
    const snapshot = JSON.parse(JSON.stringify(authState));
    const res = await fetch(ghUrl(cfg, cfg.authPath||'auth.json'), { method:'PUT', headers:{...ghHeaders(cfg.token), 'Content-Type':'application/json'}, body: ghBody('Mise à jour comptes', snapshot, sha) });
    if(res.status===409 && (attempt||0)<3) return ghPushAuth((attempt||0)+1);
    if(!res.ok) throw new Error('HTTP '+res.status);
    saveAuthBase(snapshot);
    ghOk();
    return true;
  }catch(e){ ghFail('auth', e); return false; }
}
async function ghPushSocial(){ return ghPutWithRetry(ghConfig().socialPath||'social.json', socialState, 'Mise à jour social'); }
export async function ghTestAndConnect(token){
  ghSaveToken(token);
  await ghPull();
}

export function renderGithubSection(){
  if(!ghConfigured()){
    return `
      <div class="field"><label for="gh-token">Jeton d'accès</label><div class="pw-wrap"><input id="gh-token" type="password" placeholder="github_pat_…"><button type="button" class="pw-toggle" data-toggle-pw="gh-token" aria-label="Afficher ou masquer la saisie">${icon('eye')}</button></div></div>
      <div class="field-note" style="margin-top:-8px;margin-bottom:14px;">Ce budget est relié à un seul dépôt fixe — seul le jeton d'accès est à saisir, sur chaque appareil.</div>
      <button class="btn btn-primary btn-sm" data-action="gh-connect">${icon('cloud')}Connecter</button>
      ${exportImportHTML()}`;
  }
  return `
    <div class="status-row"><span class="status-dot" style="background:var(${ghLastError ? '--c-over' : '--c-reste'});"></span>Connecté${ghLastSync ? ' · dernière synchro réussie '+ghLastSync.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}) : ''}</div>
    ${ghLastError ? `<div class="field-note" role="alert" style="color:var(--c-over);margin:-4px 0 12px;">${esc(ghLastError)}</div>` : ''}
    <div class="row-actions" style="justify-content:flex-start;gap:10px;">
      <button class="btn btn-ghost btn-sm" data-action="gh-sync-now">${icon('refresh')}Synchroniser maintenant</button>
    </div>
    ${exportImportHTML()}`;
}
function exportImportHTML(){
  return `
    <div class="row-actions" style="justify-content:flex-start;gap:10px;border-top:1px solid var(--line);padding-top:14px;margin-top:14px;">
      <button class="btn btn-ghost btn-sm" data-action="export-data">${icon('arrowDown')}Exporter (.json)</button>
      <button class="btn btn-ghost btn-sm" data-action="import-data">${icon('arrowUp')}Importer un fichier</button>
      <input type="file" id="import-file-input" accept="application/json" style="display:none;">
    </div>`;
}

/* ============================== SONDAGE PÉRIODIQUE (quasi temps-réel) ============================== */
let pollTimer = null;
export function startPolling(){
  stopPolling();
  pollTimer = setInterval(pollNow, 45000);
}
export function stopPolling(){ if(pollTimer){ clearInterval(pollTimer); pollTimer=null; } }

// Écouteurs globaux du module : posés par main.js, dans l'ordre d'origine
// (plusieurs modules écoutent les mêmes événements du document).
export function ecouteursSync(){
  document.addEventListener('visibilitychange', async ()=>{
    if(document.visibilityState!=='visible' || !pollTimer || !ghConfigured()) return;
    const a = await ghPullAuth();
    if(sessionRevoquee()) return;
    const b = await ghPullBudget(true);
    if(a || b) await renderAfterRemoteChange();
  });
  window.addEventListener('online', ()=>{ if(pollTimer) markDirtyForSync(); });
}
// Retour sur l'appli (onglet réaffiché, téléphone déverrouillé) : on récupère
// tout de suite ce qui a été saisi sur un autre appareil entre-temps.
// Retour du réseau : on envoie ce qui a été saisi hors connexion.
export async function pollNow(){
  if(document.getElementById('modal-root').innerHTML) return; // ne pas perturber une saisie en cours
  if(!ghConfigured()) return;
  // Comptes et budget aussi : un onglet resté ouvert (PC) doit voir ce qui a
  // été saisi ou supprimé sur un autre appareil sans avoir à recharger.
  const touchedAuth = await ghPullAuth();
  if(sessionRevoquee()) return;
  if(await ghPullBudget(true) || touchedAuth) await renderAfterRemoteChange();
  const beforeCount = notifBadgeCount();
  const touchedSocial = await ghPullSocial(true);
  if(!touchedSocial) return;
  const afterCount = notifBadgeCount();
  if(afterCount > beforeCount) notifyBrowser(afterCount - beforeCount);
  renderSidebar();
  renderNotifPanel();
  if(currentView==='parametres'){ await render(); }
}
export function notifyBrowser(n, texte){
  if(typeof Notification==='undefined' || Notification.permission!=='granted') return;
  try{ new Notification('Solde', { body: texte || (n>1 ? `${n} nouvelles notifications` : 'Nouvelle notification') }); }catch(e){}
}
