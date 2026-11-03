/* Authentification : session, écrans de connexion et de création de compte. */
import { seedDefaultCategoriesDep, seedDefaultCategoriesRev } from './categories.js';
import { boot } from './main.js';
import { ADMIN_CONTACT_EMAIL, authState, defaultAuth, defaultSocial, defaultState, persist,
  persistAuth, persistSocial, setAuthState, setSocialState, setState } from './store.js';
import { ghPush, ghTestAndConnect, isValidGhToken } from './sync.js';
import { icon } from './ui/icones.js';
import { authBrandHTML } from './ui/marque.js';
import { toast } from './ui/modale.js';
import { attrEsc, esc, uid } from './utils.js';

/* ============================== AUTH ============================== */
export async function sha256(str){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export function randomSalt(){
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function hashPassword(pass, salt){
  return sha256(salt + ':' + pass);
}
const REMEMBER_DAYS = 15;
// Empreinte du mot de passe gardée dans la session : quand le mot de passe
// change (par l'admin ou depuis un autre appareil), les sessions ouvertes
// avec l'ancien ne correspondent plus et sont fermées.
function sessionStamp(u){ return String(u.passwordHash||'').slice(0,16); }
export function getSession(){
  // Session de l'onglet en cours (par défaut, ne survit pas à la fermeture du navigateur)
  try{
    const raw = sessionStorage.getItem('budget_session');
    if(raw) return JSON.parse(raw);
  }catch(e){}
  // "Rester connecté" — persiste jusqu'à 15 jours, vérifié à chaque ouverture
  try{
    const raw = localStorage.getItem('budget_session_remember');
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed.expiresAt && parsed.expiresAt > Date.now()) return {userId: parsed.userId, pw: parsed.pw, remember:true, expiresAt: parsed.expiresAt};
      localStorage.removeItem('budget_session_remember'); // expiré
    }
  }catch(e){}
  return null;
}
function writeSession(s){
  try{
    if(s.remember) localStorage.setItem('budget_session_remember', JSON.stringify({userId:s.userId, pw:s.pw, expiresAt:s.expiresAt}));
    else sessionStorage.setItem('budget_session', JSON.stringify({userId:s.userId, pw:s.pw}));
  }catch(e){}
}
function setSession(userId, remember){
  try{ sessionStorage.removeItem('budget_session'); }catch(e){}
  try{ localStorage.removeItem('budget_session_remember'); }catch(e){}
  const u = authState.users.find(x=>x.id===userId);
  writeSession({userId, pw: u ? sessionStamp(u) : undefined, remember:!!remember, expiresAt: Date.now() + REMEMBER_DAYS*24*60*60*1000});
}
// Après avoir changé son propre mot de passe : cet appareil reste connecté.
export function refreshSessionStamp(){
  const s = getSession(); if(!s) return;
  const u = authState.users.find(x=>x.id===s.userId); if(!u) return;
  writeSession({...s, pw: sessionStamp(u)});
}
export function clearSession(){
  try{ sessionStorage.removeItem('budget_session'); }catch(e){}
  try{ localStorage.removeItem('budget_session_remember'); }catch(e){}
  try{ localStorage.removeItem('budget_session'); }catch(e){} // ancienne clé (avant cette mise à jour)
}
export function currentUser(){
  const s = getSession(); if(!s) return null;
  const u = authState.users.find(x=>x.id===s.userId); if(!u) return null;
  // Session ouverte avant l'ajout de l'empreinte : on la complète une fois.
  if(s.pw===undefined){ writeSession({...s, pw: sessionStamp(u)}); return u; }
  return s.pw===sessionStamp(u) ? u : null;
}
export function isAdmin(){ const u = currentUser(); return u && u.role==='admin'; }

export async function renderAuthGate(){
  const root = document.getElementById('auth-root');
  const shell = document.getElementById('shell');
  const session = getSession();
  const me = currentUser();
  const loggedIn = !!me;
  // Mot de passe changé ailleurs (par l'admin, par exemple) : on ferme la session.
  if(session && !me && authState.users.some(u=>u.id===session.userId)){
    clearSession();
    try{ sessionStorage.setItem('budget_logout_reason', 'Ton mot de passe a été modifié. Reconnecte-toi avec le nouveau.'); }catch(e){}
  }
  if(me && me.mustChangePassword){
    shell.style.display='none';
    root.style.display='flex';
    renderForcePasswordChangeScreen(me);
    return false;
  }
  if(loggedIn){
    root.style.display='none'; root.innerHTML='';
    shell.style.display='';
    return true;
  }
  shell.style.display='none';
  root.style.display='flex';
  if(authState.users.length===0){ renderSetupScreen(); } else { renderLoginScreen(); }
  return false;
}

const SETUP_CODE_HASH = '17dbbea7724c1a34655b5c3569f90b8d8b7709506e444754a8baa3b5ac6c272d';
function renderSetupScreen(){
  const root = document.getElementById('auth-root');
  const syncOptionHTML = `
    <button type="button" class="btn btn-ghost" id="sync-token-btn" style="width:100%;justify-content:center;margin-bottom:10px;">${icon('cloud')}J'ai déjà un compte — entrer mon jeton d'accès</button>
    <div id="sync-token-fields" style="display:none;">
      <div class="field"><label for="sy-token">Jeton d'accès</label><div class="pw-wrap"><input id="sy-token" type="password" placeholder="github_pat_…"><button type="button" class="pw-toggle" data-toggle-pw="sy-token" aria-label="Afficher ou masquer la saisie">${icon('eye')}</button></div></div>
      <div class="field-note" style="margin-top:-8px;margin-bottom:14px;">Ce jeton t'a été envoyé par email par la personne qui administre ce budget.</div>
      <button type="button" class="btn btn-primary" id="sy-connect" style="width:100%;justify-content:center;">${icon('check')}Synchroniser et me connecter</button>
    </div>`;
  root.innerHTML = `
    <div class="auth-card">
      ${authBrandHTML()}
      <div class="auth-title">Bienvenue</div>
      <div class="auth-sub">Ce budget n'a pas encore de compte sur cet appareil. Si tu fais partie de la famille, demande la création d'un compte ci-dessous.</div>
      <div id="auth-error-slot"></div>
      <button type="button" class="btn btn-primary" id="ask-account-btn" style="width:100%;justify-content:center;margin-bottom:10px;">${icon('plus')}Demander la création d'un compte</button>
      <div style="display:flex;align-items:center;gap:10px;margin:18px 0;color:var(--faint);font-size:11.5px;">
        <div style="flex:1;height:1px;background:var(--line);"></div>OU<div style="flex:1;height:1px;background:var(--line);"></div>
      </div>
      ${syncOptionHTML}
      <button type="button" id="admin-code-link" style="display:block;width:100%;text-align:center;margin-top:18px;font-size:11.5px;color:var(--faint);">J'ai un code d'accès administrateur</button>
    </div>`;
  document.getElementById('ask-account-btn').onclick = renderAccountRequestScreen;
  document.getElementById('admin-code-link').onclick = renderAdminCodeScreen;
  setupSyncTokenHandlers();
}
function renderAdminCodeScreen(){
  const root = document.getElementById('auth-root');
  if(authState.setupCodeUsed){
    root.innerHTML = `
      <div class="auth-card">
        ${authBrandHTML()}
        <div class="auth-title">Compte administrateur déjà créé</div>
        <div class="auth-sub">Le code d'accès à usage unique a déjà été utilisé sur ce budget.</div>
        <button type="button" class="btn btn-ghost" id="back-to-setup-btn" style="width:100%;justify-content:center;margin-top:10px;">Retour</button>
      </div>`;
    document.getElementById('back-to-setup-btn').onclick = renderSetupScreen;
    return;
  }
  root.innerHTML = `
    <div class="auth-card">
      ${authBrandHTML()}
      <div class="auth-title">Code d'accès requis</div>
      <div class="auth-sub">La création du compte administrateur est protégée par un code à usage unique.</div>
      <div id="auth-error-slot"></div>
      <form id="setup-code-form">
        <div class="field"><label for="su-code">Code d'accès</label><input id="su-code" type="text" placeholder="XXXX-XXXX-XXXX" required autocomplete="off" style="letter-spacing:1px;text-transform:uppercase;"></div>
        <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:6px;">${icon('check')}Continuer</button>
      </form>
      <button type="button" class="btn btn-ghost" id="back-to-setup-btn" style="width:100%;justify-content:center;margin-top:10px;">Retour</button>
    </div>`;
  document.getElementById('back-to-setup-btn').onclick = renderSetupScreen;
  document.getElementById('setup-code-form').onsubmit = async (e)=>{
    e.preventDefault();
    const code = document.getElementById('su-code').value.trim().toUpperCase();
    const hash = await sha256(code);
    if(hash !== SETUP_CODE_HASH) return authError('Code invalide.');
    renderSetupAdminForm(code);
  };
}
function setupSyncTokenHandlers(){
  document.getElementById('sync-token-btn').onclick = ()=>{
    document.getElementById('sync-token-fields').style.display = 'block';
    document.getElementById('sync-token-btn').style.display = 'none';
  };
  document.getElementById('sy-connect').onclick = async ()=>{
    const token = document.getElementById('sy-token').value.trim();
    if(!token) return authError('Renseigne le jeton d\u2019accès.');
    if(!(await isValidGhToken(token))) return authError('Ce jeton ne correspond pas au jeton attendu pour ce budget — vérifie l\u2019email que l\u2019administrateur t\u2019a envoyé.');
    const btn = document.getElementById('sy-connect');
    btn.disabled = true; btn.innerHTML = 'Synchronisation…';
    try{
      await ghTestAndConnect(token);
      await ghPush(); // publie tout compte local pas encore connu du dépôt (ex. admin tout juste créé)
      if(authState.users && authState.users.length>0){
        toast('Comptes trouvés — connecte-toi.');
        await renderAuthGate();
      } else {
        authError('Connecté, mais aucun compte n\u2019a été trouvé sur ce dépôt. Vérifie ton jeton, ou demande le code d\u2019accès pour créer le premier compte.');
        btn.disabled = false; btn.innerHTML = icon('check')+'Synchroniser et me connecter';
      }
    }catch(e){
      authError('Connexion impossible — vérifie ton jeton.');
      btn.disabled = false; btn.innerHTML = icon('check')+'Synchroniser et me connecter';
    }
  };
}
function renderSetupAdminForm(verifiedCode){
  const root = document.getElementById('auth-root');
  root.innerHTML = `
    <div class="auth-card">
      ${authBrandHTML()}
      <div class="auth-title">Créer le compte administrateur</div>
      <div class="auth-sub">Code validé — crée maintenant l'unique compte administrateur de ce budget.</div>
      <div id="auth-error-slot"></div>
      <form id="setup-form">
        <div class="field"><label for="su-name">Nom affiché</label><input id="su-name" type="text" placeholder="Toi" required></div>
        <div class="field"><label for="su-username">Identifiant</label><input id="su-username" type="text" placeholder="admin" required autocomplete="username"></div>
        <div class="field"><label for="su-pass">Mot de passe</label><div class="pw-wrap"><input id="su-pass" type="password" placeholder="••••••••" required autocomplete="new-password"><button type="button" class="pw-toggle" data-toggle-pw="su-pass" aria-label="Afficher ou masquer la saisie">${icon('eye')}</button></div></div>
        <div class="field"><label for="su-pass2">Confirmer le mot de passe</label><div class="pw-wrap"><input id="su-pass2" type="password" placeholder="••••••••" required autocomplete="new-password"><button type="button" class="pw-toggle" data-toggle-pw="su-pass2" aria-label="Afficher ou masquer la saisie">${icon('eye')}</button></div></div>
        <div class="field" style="display:flex;align-items:center;gap:9px;"><input id="su-remember" type="checkbox" style="width:16px;height:16px;accent-color:#FFFFFF;"><label style="margin:0;font-size:13px;color:var(--text);">Rester connecté (${REMEMBER_DAYS} jours)</label></div>
        <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:6px;">${icon('check')}Créer le compte administrateur</button>
      </form>
    </div>`;
  document.getElementById('setup-form').onsubmit = async (e)=>{
    e.preventDefault();
    // Re-vérification du code juste avant la création : une protection uniquement
    // côté rendu ne suffit pas, on ne fait jamais confiance à l'état affiché seul.
    const hash = await sha256(verifiedCode);
    if(hash !== SETUP_CODE_HASH) return authError('Code invalide — recommence depuis le début.');
    const name = document.getElementById('su-name').value.trim();
    const username = document.getElementById('su-username').value.trim().toLowerCase();
    const pass = document.getElementById('su-pass').value;
    const pass2 = document.getElementById('su-pass2').value;
    if(pass.length<4) return authError('Le mot de passe doit faire au moins 4 caractères.');
    if(pass!==pass2) return authError('Les mots de passe ne correspondent pas.');
    // Garantie de repartir totalement vierge : certains navigateurs partagent le
    // stockage entre fichiers locaux (file://) — on efface tout avant de créer
    // ce nouvel admin, pour ne jamais hériter de données d'un autre usage.
    try{
      localStorage.removeItem('budget_store');
      localStorage.removeItem('budget_auth');
      localStorage.removeItem('budget_social');
      localStorage.removeItem('budget_session');
      localStorage.removeItem('budget_session_remember');
      sessionStorage.removeItem('budget_session');
    }catch(e){}
    setState(defaultState());
    setAuthState(defaultAuth());
    setSocialState(defaultSocial());
    const salt = randomSalt();
    const passwordHash = await hashPassword(pass, salt);
    const user = {id:uid(), username, salt, passwordHash, displayName:name||username, role:'admin'};
    authState.users.push(user);
    seedDefaultCategoriesDep(user.id);
    seedDefaultCategoriesRev(user.id);
    authState.setupCodeUsed = true; // le code ne pourra plus jamais resservir, même si ce compte est supprimé un jour
    await Promise.all([persist(), persistSocial(), persistAuth()]);
    setSession(user.id, document.getElementById('su-remember')?.checked);
    await boot();
  };
}
function renderLoginScreen(){
  const root = document.getElementById('auth-root');
  root.innerHTML = `
    <div class="auth-card">
      ${authBrandHTML()}
      <div class="auth-title">Connexion</div>
      <div class="auth-sub">Accède à ton budget partagé.</div>
      <div id="auth-error-slot"></div>
      <form id="login-form">
        <div class="field"><label for="li-username">Identifiant</label><input id="li-username" type="text" required autocomplete="username"></div>
        <div class="field"><label for="li-pass">Mot de passe</label><div class="pw-wrap"><input id="li-pass" type="password" required autocomplete="current-password"><button type="button" class="pw-toggle" data-toggle-pw="li-pass" aria-label="Afficher ou masquer la saisie">${icon('eye')}</button></div></div>
        <div class="field" style="display:flex;align-items:center;gap:9px;"><input id="li-remember" type="checkbox" style="width:16px;height:16px;accent-color:#FFFFFF;"><label style="margin:0;font-size:13px;color:var(--text);">Rester connecté (${REMEMBER_DAYS} jours)</label></div>
        <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:6px;">${icon('check')}Se connecter</button>
      </form>
      <div style="display:flex;align-items:center;gap:10px;margin:18px 0;color:var(--faint);font-size:11.5px;">
        <div style="flex:1;height:1px;background:var(--line);"></div>OU<div style="flex:1;height:1px;background:var(--line);"></div>
      </div>
      <button type="button" class="btn btn-ghost" id="ask-account-btn" style="width:100%;justify-content:center;">${icon('plus')}Pas encore de compte ? Demander une création</button>
    </div>`;
  try{
    const reason = sessionStorage.getItem('budget_logout_reason');
    if(reason){ sessionStorage.removeItem('budget_logout_reason'); authError(esc(reason)); }
  }catch(e){}
  document.getElementById('login-form').onsubmit = async (e)=>{
    e.preventDefault();
    const username = document.getElementById('li-username').value.trim().toLowerCase();
    const pass = document.getElementById('li-pass').value;
    const remember = document.getElementById('li-remember').checked;
    const user = authState.users.find(u=>u.username===username);
    if(!user) return authError('Identifiant ou mot de passe incorrect.');
    // Rétrocompatibilité : les comptes créés avant l'ajout du sel n'en ont pas.
    const hash = user.salt ? await hashPassword(pass, user.salt) : await sha256(pass);
    if(hash !== user.passwordHash) return authError('Identifiant ou mot de passe incorrect.');
    if(!user.salt){ user.salt = randomSalt(); user.passwordHash = await hashPassword(pass, user.salt); await persistAuth(); }
    setSession(user.id, remember);
    await boot();
  };
  document.getElementById('ask-account-btn').onclick = renderAccountRequestScreen;
}
// Après un mot de passe à usage unique, l'accès reste bloqué tant que la
// personne n'a pas choisi son propre mot de passe.
function renderForcePasswordChangeScreen(user){
  const root = document.getElementById('auth-root');
  root.innerHTML = `
    <div class="auth-card">
      ${authBrandHTML()}
      <div class="auth-title">Choisis ton mot de passe</div>
      <div class="auth-sub">Ton compte a été mis à jour par un administrateur — ton identifiant est désormais <strong>@${esc(user.username)}</strong>. Remplace le mot de passe à usage unique par un mot de passe personnel.</div>
      <div id="auth-error-slot"></div>
      <form id="force-pass-form">
        <input type="text" value="${attrEsc(user.username)}" autocomplete="username" hidden>
        <div class="field"><label for="fp-pass">Nouveau mot de passe</label><div class="pw-wrap"><input id="fp-pass" type="password" placeholder="8 caractères minimum" required autocomplete="new-password"><button type="button" class="pw-toggle" data-toggle-pw="fp-pass" aria-label="Afficher ou masquer la saisie">${icon('eye')}</button></div></div>
        <div class="field"><label for="fp-pass2">Confirmer le mot de passe</label><div class="pw-wrap"><input id="fp-pass2" type="password" required autocomplete="new-password"><button type="button" class="pw-toggle" data-toggle-pw="fp-pass2" aria-label="Afficher ou masquer la saisie">${icon('eye')}</button></div></div>
        <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:6px;">${icon('check')}Enregistrer et continuer</button>
      </form>
      <button type="button" class="btn btn-ghost" id="fp-logout" style="width:100%;justify-content:center;margin-top:10px;">${icon('logout')}Se déconnecter</button>
    </div>`;
  document.getElementById('fp-logout').onclick = ()=>{ clearSession(); renderAuthGate(); };
  document.getElementById('force-pass-form').onsubmit = async (e)=>{
    e.preventDefault();
    const pass = document.getElementById('fp-pass').value;
    const pass2 = document.getElementById('fp-pass2').value;
    if(pass.length<8) return authError('Le mot de passe doit faire au moins 8 caractères.');
    if(pass!==pass2) return authError('Les mots de passe ne correspondent pas.');
    if(await hashPassword(pass, user.salt) === user.passwordHash) return authError('Choisis un mot de passe différent du mot de passe à usage unique.');
    user.salt = randomSalt();
    user.passwordHash = await hashPassword(pass, user.salt);
    delete user.mustChangePassword;
    refreshSessionStamp();
    await persistAuth();
    await boot();
    toast('Mot de passe enregistré');
  };
}
function renderAccountRequestScreen(){
  const root = document.getElementById('auth-root');
  root.innerHTML = `
    <div class="auth-card">
      ${authBrandHTML()}
      <div class="auth-title">Demander la création d'un compte</div>
      <div class="auth-sub">Remplis ces informations — la personne qui administre ce budget les recevra et pourra approuver ou refuser ta demande.</div>
      <div id="auth-error-slot"></div>
      <form id="account-request-form">
        <div class="field"><label for="ar-nom">Ton nom</label><input id="ar-nom" type="text" required></div>
        <div class="field"><label for="ar-email">Ton email (pour qu'on puisse te recontacter)</label><input id="ar-email" type="email" required></div>
        <div class="field"><label for="ar-username">Identifiant souhaité</label><input id="ar-username" type="text" placeholder="ex. julie"></div>
        <div class="field"><label for="ar-message">Pourquoi ce compte ? (optionnel)</label><textarea id="ar-message" rows="3" placeholder="Ex. je fais partie de la famille, on veut partager le budget du foyer…"></textarea></div>
        <button type="submit" class="btn btn-primary" style="width:100%;justify-content:center;margin-top:6px;">${icon('check')}Envoyer la demande</button>
      </form>
      <button type="button" class="btn btn-ghost" id="back-to-login-btn" style="width:100%;justify-content:center;margin-top:10px;">Retour</button>
    </div>`;
  document.getElementById('back-to-login-btn').onclick = renderAuthGate;
  document.getElementById('account-request-form').onsubmit = (e)=>{
    e.preventDefault();
    const nom = document.getElementById('ar-nom').value.trim();
    const email = document.getElementById('ar-email').value.trim();
    const username = document.getElementById('ar-username').value.trim();
    const message = document.getElementById('ar-message').value.trim();
    if(!nom || !email) return authError('Nom et email sont obligatoires.');
    sendAccountRequestEmail({nom, email, username, message});
    const root2 = document.getElementById('auth-root');
    root2.innerHTML = `
      <div class="auth-card">
        ${authBrandHTML()}
        <div class="auth-title">Demande envoyée</div>
        <div class="auth-sub">Un email pré-rempli avec ta demande vient de s'ouvrir dans ton logiciel de messagerie — il ne reste plus qu'à l'envoyer. Si rien ne s'est ouvert, vérifie que tu as bien une messagerie configurée sur cet appareil.</div>
        <button type="button" class="btn btn-primary" id="back-to-login-btn2" style="width:100%;justify-content:center;margin-top:10px;">${icon('check')}Retour</button>
      </div>`;
    document.getElementById('back-to-login-btn2').onclick = renderAuthGate;
  };
}
function sendAccountRequestEmail({nom, email, username, message}){
  const subject = `[Solde] Demande de création de compte — ${nom}`;
  const bodyLines = [
    `Nom : ${nom}`,
    `Email de contact : ${email}`,
    username ? `Identifiant souhaité : ${username}` : null,
    message ? `Message : ${message}` : null,
  ].filter(Boolean);
  const body = bodyLines.join('\n');
  const mailto = `mailto:${ADMIN_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
}
function authError(msg){
  const slot = document.getElementById('auth-error-slot');
  if(slot) slot.innerHTML = `<div class="auth-error">${msg}</div>`;
}
