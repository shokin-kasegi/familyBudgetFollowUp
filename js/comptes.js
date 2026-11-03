/* Comptes : gestion des utilisateurs, demandes, export et purge par utilisateur, et leurs actions. */
import { clearSession, currentUser, getSession, hashPassword, isAdmin, randomSalt,
  refreshSessionStamp } from './auth.js';
import { forOwner } from './calculs.js';
import { seedDefaultCategoriesDep, seedDefaultCategoriesRev } from './categories.js';
import { boot } from './main.js';
import { renderNotifPanel } from './notifications.js';
import { releveSauverSession, setReleveSession } from './releve.js';
import { render } from './routeur.js';
import { authState, OWNED_ARRAYS, persist, persistAuth, persistSocial, socialState, state } from './store.js';
import { stopPolling, supprimerCompte } from './sync.js';
import { avatarColor } from './ui/avatars.js';
import { icon } from './ui/icones.js';
import { initials } from './ui/ile.js';
import { confirmDelete, fieldRequiredErrors, markFieldError, openModal, reportFieldErrors, toast } from './ui/modale.js';
import { attrEsc, esc, parId, uid } from './utils.js';

/* ---- Comptes : connexion, gestion, export et purge, demandes des membres ---- */
async function actionLogout(){
  stopPolling(); clearSession(); await boot(); toast('Déconnecté');
}
function actionToggleUserActions(id, el){
  const row = el.closest('.user-row');
  const open = !row.classList.contains('actions-open');
  closeUserActionMenus(row);
  row.classList.toggle('actions-open', open);
  el.setAttribute('aria-expanded', String(open));
}
async function actionAddUser(){
  const addUserFields = userFieldsAdmin(null).concat(passwordFields('Mot de passe', true));
    openModal('Ajouter un compte', addUserFields, {role:'membre'}, async (data)=>{
    if(reportFieldErrors(fieldRequiredErrors(addUserFields, data).concat(userFieldErrors(data)))) return false;
    if(authState.users.some(u=>u.username===data.username.trim().toLowerCase())){ markFieldError('username','Cet identifiant existe déjà'); toast('Cet identifiant existe déjà'); return false; }
    const salt = randomSalt();
    const passwordHash = await hashPassword(data.password, salt);
    const newUser = {id:uid(), username:data.username.trim().toLowerCase(), displayName:data.displayName.trim(), role:data.role, salt, passwordHash};
    authState.users.push(newUser);
    seedDefaultCategoriesDep(newUser.id);
    seedDefaultCategoriesRev(newUser.id);
    await Promise.all([persistAuth(), persist()]); await render(); toast('Compte créé — pense à transmettre le jeton d\u2019accès à cette personne par email, il lui sera demandé à sa première connexion.'); });
}
async function actionEditUser(id){
  const u = parId(authState.users, id);
  // Identifiant à l'ancien format (antérieur au motif actuel) : l'admin doit le
  // remplacer. Comme l'identifiant de connexion change, la personne reçoit un
  // mot de passe à usage unique, à changer à sa première connexion.
  const legacy = isAdmin() && !isValidUsername(u.username);
  const resetPassword = legacy && u.id!==currentUser().id;
  const baseFields = isAdmin() ? userFieldsAdmin(u.id) : userFieldsSelf(u.id);
  const fields = resetPassword ? baseFields : baseFields.concat(passwordFields('Nouveau mot de passe (optionnel)', false));
  const legacyNote = legacy ? `<div class="field-note" style="margin:-4px 0 14px;">L'identifiant « @${esc(u.username)} » n'est plus au format accepté (2 à 32 caractères : lettres, chiffres, . _ -). Un nouvel identifiant est proposé ci-dessus, modifiable.${resetPassword ? ` À l'enregistrement, un mot de passe à usage unique sera généré : ${esc(u.displayName)} devra le changer à sa première connexion.` : ''}</div>` : '';
  openModal('Modifier le compte', fields, legacy ? {...u, username:suggestUsername(u)} : u, async (data)=>{
    if(reportFieldErrors(fieldRequiredErrors(fields, data).concat(userFieldErrors(data)))) return false;
    const newUsername = (data.username||u.username).trim().toLowerCase();
    if(isAdmin()){
      if(authState.users.some(x=>x.id!==u.id && x.username===newUsername)){
        markFieldError('username','Cet identifiant existe déjà'); toast('Cet identifiant existe déjà'); return false;
      }
      if(u.role==='admin' && data.role!=='admin' && authState.users.filter(x=>x.role==='admin').length<=1){
        markFieldError('role','Il doit rester au moins un administrateur'); toast('Impossible de rétrograder le dernier admin'); return false;
      }
    }
    u.displayName = data.displayName.trim();
    if(isAdmin()){ u.username = newUsername; u.role = data.role||u.role; }
    const tempPassword = resetPassword ? generateTempPassword() : null;
    const newPassword = tempPassword || data.password;
    if(newPassword){ u.salt = randomSalt(); u.passwordHash = await hashPassword(newPassword, u.salt); }
    if(tempPassword) u.mustChangePassword = true;
    // Son propre mot de passe : cet appareil reste connecté, les autres non.
    if(newPassword && u.id===getSession()?.userId) refreshSessionStamp();
    await persistAuth(); await render();
    // Affiché après la fermeture de ce formulaire (closeModal suit le retour de onSave).
    if(tempPassword) setTimeout(()=>showTempPasswordModal(u, tempPassword), 0);
    else toast('Compte mis à jour'); }, legacyNote);
}
async function actionDelUser(id){
  const u=parId(authState.users, id); if(u.role==='admin' && authState.users.filter(x=>x.role==='admin').length<=1) return toast('Impossible de supprimer le dernier admin');
  confirmDelete(u.displayName, async ()=>{
    supprimerCompte(id);
    await Promise.all([persistAuth(), persistSocial(), persist()]); await render(); toast('Compte et données supprimés'); });
}
function actionExportUserData(id){
  exportUserData(id); toast('Export téléchargé');
}
async function actionWipeUserData(id){
  const u=parId(authState.users, id); const soi = u.id===currentUser().id;
  if(!soi && !isAdmin()) return;
  confirmDelete(soi ? 'mes données' : `les données de ${u.displayName}`, async ()=>{
    wipeUserData(id);
    if(soi){ setReleveSession(null); releveSauverSession(); }
    await persist(); await render(); toast('Données vidées'); },
    soi ? {title:'Vider mes données ?', consequence:'Tes revenus et dépenses seront effacés. Ton compte et tes identifiants sont conservés. Cette action est définitive.', confirmLabel:'Vider mes données'} : undefined);
}
async function actionRequestExport(){
  const me = currentUser();
  if(myPendingAccountRequest('export')) return toast('Déjà demandé, en attente.');
  socialState.accountRequests.push({id:uid(), fromId:me.id, type:'export', status:'pending', createdAt:new Date().toISOString()});
  await persistSocial(); await render(); toast('Demande envoyée à un administrateur');
}
async function actionRequestResetData(){
  const me = currentUser();
  if(myPendingAccountRequest('reset')) return toast('Déjà demandé, en attente.');
  socialState.accountRequests.push({id:uid(), fromId:me.id, type:'reset', status:'pending', createdAt:new Date().toISOString()});
  await persistSocial(); await render(); toast('Demande envoyée à un administrateur');
}
async function actionRequestDeleteAccount(){
  const me = currentUser();
  if(myPendingAccountRequest('delete')) return toast('Déjà demandé, en attente.');
  socialState.accountRequests.push({id:uid(), fromId:me.id, type:'delete', status:'pending', createdAt:new Date().toISOString()});
  await persistSocial(); await render(); toast('Demande envoyée à un administrateur');
}
async function actionApproveAccountRequest(id){
  const req = socialState.accountRequests.find(r=>r.id===id);
  if(!req) return;
  const u = authState.users.find(x=>x.id===req.fromId);
  if(req.type==='export'){
    // On n'exporte plus directement côté admin : on approuve, et c'est la
    // personne concernée qui télécharge elle-même, une seule fois.
    req.status='approved'; await persistSocial(); await render(); renderNotifPanel(); toast('Demande approuvée — la personne peut maintenant télécharger ses données.'); return;
  }
  if(req.type==='reset'){
    // "Reset" : on vide les données mais on garde le compte (identifiants intacts).
    confirmDelete(u ? `les données de ${u.displayName} (demande approuvée)` : 'ces données', async ()=>{
      if(u) wipeUserData(u.id);
      req.status='done';
      socialState.accountRequests = socialState.accountRequests.filter(r=>r.id!==req.id);
      await Promise.all([persistSocial(), persist()]); await render(); renderNotifPanel(); toast('Données réinitialisées'); });
    return;
  }
  // type 'delete' : on redemande une confirmation explicite avant d'agir, c'est irréversible
  confirmDelete(u ? `le compte de ${u.displayName} (demande approuvée)` : 'ce compte', async ()=>{
    if(u) supprimerCompte(u.id);
    req.status='done';
    socialState.accountRequests = socialState.accountRequests.filter(r=>r.id!==req.id);
    await Promise.all([persistAuth(), persistSocial(), persist()]); await render(); renderNotifPanel(); toast('Compte supprimé'); });
}
async function actionDeclineAccountRequest(id){
  const req = socialState.accountRequests.find(r=>r.id===id);
  if(req) req.status='declined';
  await persistSocial(); await render(); renderNotifPanel(); toast('Demande refusée');
}
async function actionDownloadMyExport(id){
  const req = myApprovedExportRequest();
  if(!req) return;
  exportUserData(currentUser().id);
  socialState.accountRequests = socialState.accountRequests.filter(r=>r.id!==req.id); // usage unique : la demande disparaît après téléchargement
  await persistSocial(); await render(); renderNotifPanel(); toast('Téléchargement effectué');
}
export const actionsComptes = {
  'logout': actionLogout,
  'toggle-user-actions': actionToggleUserActions,
  'add-user': actionAddUser,
  'edit-user': actionEditUser,
  'del-user': actionDelUser,
  'export-user-data': actionExportUserData,
  'wipe-user-data': actionWipeUserData,
  'request-export': actionRequestExport,
  'request-reset-data': actionRequestResetData,
  'request-delete-account': actionRequestDeleteAccount,
  'approve-account-request': actionApproveAccountRequest,
  'decline-account-request': actionDeclineAccountRequest,
  'download-my-export': actionDownloadMyExport,
};
// Actions d'une ligne de compte : un menu « ⋯ » avec des libellés texte
// (les icônes seules ne se devinaient pas), la destructive en dernier, en rouge.
export function userRowActionsHTML(u, me){
  const items = [];
  if(isAdmin() || u.id===me.id) items.push(`<button class="menu-item" data-action="edit-user" data-id="${u.id}">${icon('edit')}Modifier le compte</button>`);
  if(isAdmin() && u.role!=='admin') items.push(`<button class="menu-item" data-action="export-user-data" data-id="${u.id}">${icon('arrowDown')}Exporter ses données</button>`);
  const danger = [];
  // Chacun peut vider ses propres données sans passer par un administrateur.
  if(u.id===me.id) danger.push(`<button class="menu-item danger" data-action="wipe-user-data" data-id="${u.id}">${icon('refresh')}Vider mes données</button>`);
  else if(isAdmin() && u.role!=='admin') danger.push(`<button class="menu-item danger" data-action="wipe-user-data" data-id="${u.id}">${icon('refresh')}Vider ses données</button>`);
  if(isAdmin() && u.id!==me.id) danger.push(`<button class="menu-item danger" data-action="del-user" data-id="${u.id}">${icon('trash')}Supprimer le compte</button>`);
  if(!items.length && !danger.length) return '';
  return `<button class="icon-btn user-more" data-action="toggle-user-actions" aria-label="Actions pour ${attrEsc(u.displayName)}" aria-haspopup="menu" aria-expanded="false">${icon('more')}</button>
          <div class="user-actions" role="menu">${items.join('')}${items.length&&danger.length?'<div class="menu-sep" role="separator"></div>':''}${danger.join('')}</div>`;
}
export function closeUserActionMenus(except){
  document.querySelectorAll('.user-row.actions-open').forEach(row=>{
    if(row===except) return;
    row.classList.remove('actions-open');
    row.querySelector('.user-more')?.setAttribute('aria-expanded','false');
  });
}
function userFieldsAdmin(excludeId){
  return [
    {key:'displayName', label:'Nom affiché', required:true, maxlength:60},
    {key:'username', label:'Identifiant', required:true, maxlength:32},
    {key:'role', label:'Rôle', type:'select', options:['membre','admin']},
  ];
}
function userFieldsSelf(excludeId){
  return [
    {key:'displayName', label:'Nom affiché', required:true, maxlength:60},
  ];
}
// Mot de passe + confirmation : obligatoire à la création, optionnel en modification.
function passwordFields(label, required){
  return [
    {key:'password', label, type:'password', required},
    {key:'password2', label:'Confirmer le mot de passe', type:'password'},
  ];
}
function isValidUsername(username){ return /^[a-z0-9._-]{2,32}$/.test(username||''); }
// Proposition d'identifiant valide à partir d'un identifiant à l'ancien format
// (« Prénom.Nom@exemple.com » → « prenom.nom »), sans collision avec un autre compte.
function suggestUsername(u){
  let base = (u.username||'').trim().toLowerCase().split('@')[0]
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9._-]+/g,'.').replace(/^[._-]+|[._-]+$/g,'').slice(0,32);
  if(base.length<2) base = 'membre';
  const taken = name => authState.users.some(x=>x.id!==u.id && x.username===name);
  let candidate = base;
  for(let i=2; taken(candidate); i++){ const suffix = '-'+i; candidate = base.slice(0, 32-suffix.length)+suffix; }
  return candidate;
}
// Mot de passe à usage unique, lisible à l'oral (sans 0/O, 1/l/I) : XXXX-XXXX-XXXX.
function generateTempPassword(){
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const chars = [];
  while(chars.length<12){
    const b = crypto.getRandomValues(new Uint8Array(1))[0];
    if(b < 256 - 256 % alphabet.length) chars.push(alphabet[b % alphabet.length]); // sans biais
  }
  return chars.join('').replace(/(.{4})(?=.)/g, '$1-');
}
function showTempPasswordModal(u, tempPassword){
  openModal('Mot de passe à usage unique', [], {}, ()=>{}, `
    <p style="color:var(--muted);font-size:13.5px;margin-bottom:12px;">Transmets ces informations à ${esc(u.displayName)}. Le mot de passe ne sera plus affiché ensuite ; il devra être changé à la première connexion.</p>
    <div class="field"><label>Identifiant</label><div class="temp-cred">${esc(u.username)}</div></div>
    <div class="field"><label>Mot de passe à usage unique</label><div class="temp-cred">${esc(tempPassword)}</div></div>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" id="temp-copy">Copier</button>
    <button type="button" class="btn btn-primary" id="cancel-btn">${icon('check')}C'est noté</button></div>
  `);
  document.getElementById('temp-copy').onclick = ()=>{
    navigator.clipboard.writeText(`Identifiant : ${u.username}\nMot de passe à usage unique : ${tempPassword}`)
      .then(()=>toast('Copié'), ()=>toast('Copie impossible — note-le à la main'));
  };
}
// Contrôles communs aux formulaires de compte. Les limites sont revérifiées ici
// (et pas seulement via maxlength) car les comptes peuvent arriver par import
// ou par la synchro GitHub. Un champ vide est laissé à fieldRequiredErrors.
function userFieldErrors(data){
  const errors = [];
  if(typeof data.displayName==='string' && data.displayName.trim().length>60) errors.push(['displayName','60 caractères maximum']);
  if(typeof data.username==='string' && data.username.trim() && !isValidUsername(data.username.trim().toLowerCase())) errors.push(['username','2 à 32 caractères : lettres, chiffres, . _ -']);
  if(data.password){
    if(data.password.length<8) errors.push(['password','8 caractères minimum']);
    if(data.password!==data.password2) errors.push(['password2','Les mots de passe ne correspondent pas']);
  }
  return errors;
}

export function renderMemberAccountRequests(me){
  const exportReq = myPendingAccountRequest('export');
  const approvedExport = myApprovedExportRequest();
  const resetReq = myPendingAccountRequest('reset');
  const deleteReq = myPendingAccountRequest('delete');
  return `
    <div style="border-top:1px solid var(--line);margin-top:16px;padding-top:16px;">
      <div class="sub" style="margin-bottom:10px;">Pour vider tes données, utilise le menu « ⋯ » de ton compte ci-dessus. L’export et la suppression du compte passent par un administrateur — tu peux lui en faire la demande :</div>
      ${approvedExport ? `<div class="status-row" style="margin-bottom:12px;"><span class="status-dot" style="background:var(--c-reste);"></span>Ta demande d'export a été approuvée</div>
        <button class="btn btn-primary btn-sm" data-action="download-my-export" style="margin-bottom:14px;">${icon('arrowDown')}Télécharger mes données</button>
        <div class="field-note" style="margin-bottom:14px;">Ce bouton ne fonctionne qu'une fois — il disparaîtra après le téléchargement. Il faudra refaire une demande si tu en as besoin à nouveau.</div>` : ''}
      <div class="row-actions" style="justify-content:flex-start;gap:10px;flex-wrap:wrap;">
        ${approvedExport ? '' : exportReq
          ? `<span class="pill pill-amber">Export demandé — en attente</span>`
          : `<button class="btn btn-ghost btn-sm" data-action="request-export">${icon('arrowDown')}Demander l\u2019export de mes données</button>`}
        ${resetReq ? `<span class="pill pill-amber">Reset demandé — en attente</span>` : ''}
        ${deleteReq
          ? `<span class="pill pill-amber">Suppression demandée — en attente</span>`
          : `<button class="btn btn-ghost btn-sm" data-action="request-delete-account" style="color:var(--c-over);">${icon('trash')}Demander la suppression de mon compte</button>`}
      </div>
      <div class="field-note" style="margin-top:10px;">« Vider mes données » (menu « ⋯ ») garde ton compte et tes identifiants — seules tes saisies (revenus, dépenses…) sont remises à zéro. "Supprimer mon compte" retire aussi tes identifiants, définitivement.</div>
    </div>`;
}
export function accountRequestLabel(type){
  if(type==='export') return 'demande l\u2019export de ses données';
  if(type==='reset') return 'demande à vider ses données (garde son compte)';
  return 'demande la suppression de son compte';
}
export function renderPendingAccountRequests(){
  const pending = pendingAccountRequests();
  if(pending.length===0) return '';
  return `
    <div style="border-top:1px solid var(--line);margin-top:16px;padding-top:16px;">
      <div class="sub" style="margin-bottom:10px;font-weight:600;color:var(--text);">Demandes en attente</div>
      ${pending.map(r=>{
        const from = authState.users.find(u=>u.id===r.fromId);
        const label = accountRequestLabel(r.type);
        return `<div class="user-row">
          <div class="avatar" style="background:${avatarColor(from)}">${initials(from)}</div>
          <div class="info"><div class="name">${esc(from?from.displayName:'?')}</div><div class="meta">${label}</div></div>
          <button class="btn btn-primary btn-sm" data-action="approve-account-request" data-id="${r.id}">${icon('check')}Traiter</button>
          <button class="btn btn-ghost btn-sm" data-action="decline-account-request" data-id="${r.id}">${icon('x')}Refuser</button>
        </div>`;
      }).join('')}
    </div>`;
}

export function pendingAccountRequests(){
  // Visibles par n'importe quel admin (pas de destinataire nommé, "l'admin" en général).
  if(!isAdmin()) return [];
  return socialState.accountRequests.filter(r=>r.status==='pending');
}
function myPendingAccountRequest(type){
  const me = currentUser();
  if(!me) return null;
  return socialState.accountRequests.find(r=>r.fromId===me.id && r.type===type && r.status==='pending');
}
export function myApprovedExportRequest(){
  const me = currentUser();
  if(!me) return null;
  return socialState.accountRequests.find(r=>r.fromId===me.id && r.type==='export' && r.status==='approved');
}

/* ---- Export / purge des données, par utilisateur ---- */
function exportUserData(userId){
  const user = authState.users.find(u=>u.id===userId);
  if(!user) return;
  const payload = { compte: {displayName:user.displayName, username:user.username}, exporteLe:new Date().toISOString() };
  OWNED_ARRAYS.forEach(key=>{ payload[key] = forOwner(state[key], userId); });
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `solde-donnees-${user.username}-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
export function wipeUserData(userId){
  OWNED_ARRAYS.forEach(key=>{ state[key] = (state[key]||[]).filter(item=>item.ownerId!==userId); });
}
