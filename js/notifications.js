/* Notifications : panneau, notifications du navigateur, et leurs actions. */
import { currentUser } from './auth.js';
import { accountRequestLabel, myApprovedExportRequest, pendingAccountRequests } from './comptes.js';
import { render } from './routeur.js';
import { aboAlertesNonVues, aboAlerteTexte, aboAlerteTitre } from './series/abonnements.js';
import { authState } from './store.js';
import { avatarColor } from './ui/avatars.js';
import { icon } from './ui/icones.js';
import { initials } from './ui/ile.js';
import { esc } from './utils.js';

/* ---- Notifications ---- */
function actionToggleNotifPanel(){
  toggleNotifPanel();
}
async function actionEnableBrowserNotif(){
  await enableBrowserNotifications(); await render();
}
export const actionsNotif = {
  'toggle-notif-panel': actionToggleNotifPanel,
  'enable-browser-notif': actionEnableBrowserNotif,
};
export function renderNotifSettingsSection(){
  const supported = typeof Notification !== 'undefined';
  if(!supported) return `<div class="field-note">Non disponible sur ce navigateur.</div>`;
  const perm = Notification.permission;
  if(perm==='granted') return `<div class="status-row"><span class="status-dot" style="background:var(--c-reste);"></span>Notifications activées</div>`;
  if(perm==='denied') return `<div class="field-note">Bloquées dans les réglages du navigateur — réactive-les manuellement si tu changes d'avis.</div>`;
  return `<button class="btn btn-ghost btn-sm" data-action="enable-browser-notif">${icon('bell')}Activer les notifications</button>`;
}
async function enableBrowserNotifications(){
  if(typeof Notification==='undefined') return;
  try{ await Notification.requestPermission(); }catch(e){}
}
export function notifBadgeCount(){
  return pendingAccountRequests().length + (myApprovedExportRequest() ? 1 : 0) + aboAlertesNonVues().length;
}

/* ============================== NOTIFICATIONS ============================== */
export let notifOpen = false;
export function toggleNotifPanel(force){
  notifOpen = force!==undefined ? force : !notifOpen;
  const panel = document.getElementById('notif-panel');
  panel.classList.toggle('open', notifOpen);
  renderNotifPanel();
}
export function renderNotifPanel(){
  const panel = document.getElementById('notif-panel');
  const me = currentUser();
  if(!me){ panel.innerHTML=''; return; }
  const items = [];
  pendingAccountRequests().forEach(r=>{
    const from = authState.users.find(u=>u.id===r.fromId);
    const label = accountRequestLabel(r.type);
    items.push(`<div class="notif-item" data-action="open-parametres" role="button" tabindex="0">
      <div class="avatar" style="background:${avatarColor(from)};width:32px;height:32px;font-size:12px;">${initials(from)}</div>
      <div class="info"><div class="name">${esc(from?from.displayName:'?')}</div><div class="meta">${label}</div></div>
    </div>`);
  });
  aboAlertesNonVues().forEach(a=>{
    items.push(`<div class="notif-item">
      <div class="avatar" style="background:var(--raised);color:var(--text);width:32px;height:32px;" aria-hidden="true">${icon({prix:'repeat','ppf-termine':'check','ppf-retard':'clock','chg-retard':'clock'}[a.type] || 'x')}</div>
      <div class="info"><div class="name">${aboAlerteTitre(a)}</div><div class="meta">${esc(aboAlerteTexte(a))}</div></div>
      <button class="icon-btn" data-action="abo-alerte-vue" data-id="${a.id}" aria-label="Marquer comme lu">${icon('check')}</button>
    </div>`);
  });
  if(myApprovedExportRequest()){
    items.push(`<div class="notif-item" data-action="open-parametres" role="button" tabindex="0">
      <div class="avatar" style="background:${avatarColor(me)};width:32px;height:32px;font-size:12px;">${initials(me)}</div>
      <div class="info"><div class="name">Ton export est prêt</div><div class="meta">Va dans Paramètres pour le télécharger</div></div>
    </div>`);
  }
  panel.innerHTML = `
    <div class="notif-head"><span>Notifications</span><button class="icon-btn" data-action="close-notif" aria-label="Fermer">${icon('x')}</button></div>
    <div class="notif-body">
      ${items.length===0 ? `<div class="cp-empty">${icon('bell')}<br>Rien de nouveau.</div>` : items.join('')}
    </div>`;
}
