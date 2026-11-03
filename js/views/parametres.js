/* Vue Paramètres et espace Groupes. */
import { renderClaudeSection } from '../assistant.js';
import { currentUser, isAdmin } from '../auth.js';
import { renderMemberAccountRequests, renderPendingAccountRequests, userRowActionsHTML } from '../comptes.js';
import { renderNotifSettingsSection } from '../notifications.js';
import { state } from '../store.js';
import { renderGithubSection } from '../sync.js';
import { avatarHTML } from '../ui/avatars.js';
import { pageHeadHTML } from '../ui/gabarits.js';
import { icon } from '../ui/icones.js';
import { visibleUserRows } from '../ui/ile.js';
import { orderedNavItems } from '../ui/nav.js';
import { currentTheme, themePreviewHTML, THEMES } from '../ui/themes.js';
import { attrEsc, esc } from '../utils.js';
import { emptyState } from './revenus.js';

export function renderGroupesListe(){
  return `
    <div class="page-head"><div><h1 class="page-title">Mes groupes</h1><div class="page-sub">Dépenses partagées à plusieurs</div></div></div>
    <div class="card">
      ${emptyState('users','Bientôt disponible','Les groupes partagés arrivent dans une prochaine mise à jour — tu pourras créer un groupe, inviter des proches (avec ou sans compte), et répartir vos dépenses communes.', null, null)}
    </div>
  `;
}
const PARAM_SECTIONS = [
  {id:'comptes', label:'Comptes', icon:'users'},
  {id:'sync', label:'Synchronisation', icon:'cloud'},
  {id:'notifs', label:'Notifications', icon:'bell'},
  {id:'assistant', label:'Assistant', icon:'bot'},
  {id:'apparence', label:'Apparence', icon:'eye'},
  {id:'navigation', label:'Navigation', icon:'menu'},
];
export let paramSection = 'comptes';
export function setParamSection(v){ paramSection = v; }
export function renderParametres(){
  const me = currentUser();
  const sec = PARAM_SECTIONS.some(x=>x.id===paramSection) ? paramSection : 'comptes';
  const body = {
    comptes: ()=>`
      <h3>Comptes</h3>
      <div class="sub">${isAdmin() ? "Gère qui peut accéder à ce budget." : "Ton compte."}</div>
      ${visibleUserRows(me).map(u=>`
        <div class="user-row">
          ${avatarHTML(u)}
          <div class="info"><div class="name">${esc(u.displayName)} ${u.id===me.id?'<span style="color:var(--faint);font-weight:400;">(toi)</span>':''}</div>
            <div class="meta">@${esc(u.username)} · ${u.role==='admin'?'Administrateur':'Membre'}${u.mustChangePassword ? ' · Mot de passe à usage unique en attente' : ''}</div></div>
          ${userRowActionsHTML(u, me)}
        </div>`).join('')}
      ${isAdmin() ? `<button class="btn btn-ghost btn-sm" data-action="add-user" style="margin-top:14px;">${icon('plus')}Ajouter un compte</button>` : ''}
      ${!isAdmin() ? renderMemberAccountRequests(me) : ''}
      ${isAdmin() ? renderPendingAccountRequests() : ''}`,
    sync: ()=>`
      <h3>Synchronisation</h3>
      <div class="sub">Fonctionne sur tout appareil et navigateur, y compris mobile. Nécessite un dépôt GitHub <strong>privé</strong>, séparé de celui qui héberge le site. Sans y être invité(e) comme collaborateur, personne d’autre ne peut lire ou écrire tes données, même avec le lien du site.</div>
      ${renderGithubSection()}`,
    notifs: ()=>`
      <h3>Notifications</h3>
      <div class="sub">Reçois une alerte du navigateur pour les demandes adressées aux administrateurs, tant que le site est ouvert.</div>
      ${renderNotifSettingsSection()}`,
    assistant: ()=>`
      <h3>Assistant Claude</h3>
      <div class="sub">Un chat intégré pour t’aider à comprendre et faire évoluer ton budget. Utilise ta propre clé API Anthropic : elle reste uniquement sur cet appareil.</div>
      ${renderClaudeSection()}`,
    apparence: ()=>`
      <h3>Apparence</h3>
      <div class="sub">Trois styles de verre liquide. Le choix reste sur cet appareil ; il se change aussi depuis le menu en haut de l’écran.</div>
      <div class="theme-cards" role="group" aria-label="Thème">
        ${THEMES.map(t=>`<button class="theme-card" data-theme-pick="${t.id}" aria-pressed="${currentTheme()===t.id}">
          <span class="prev" aria-hidden="true">${themePreviewHTML(t.id)}</span>
          <span class="nm">${t.label}</span><span class="ds" style="display:block">${t.desc}</span></button>`).join('')}
      </div>`,
    navigation: ()=>{
      const items = orderedNavItems();
      return `
      <h3>Navigation</h3>
      <div class="sub">L’ordre des onglets dans le menu en haut de l’écran.</div>
      <ol class="nav-order">
        ${items.map((n,i)=>`<li>${icon(n.icon)}<span class="l">${n.label}</span>
          <button class="icon-btn" data-action="nav-move" data-id="${n.id}" data-dir="-1" aria-label="Monter ${attrEsc(n.label)}"${i===0?' disabled':''}>${icon('chevU')}</button>
          <button class="icon-btn" data-action="nav-move" data-id="${n.id}" data-dir="1" aria-label="Descendre ${attrEsc(n.label)}"${i===items.length-1?' disabled':''}>${icon('chevD')}</button></li>`).join('')}
      </ol>
      ${state.navOrder?.finance ? `<div class="row-actions" style="justify-content:flex-start;margin-top:14px;"><button class="btn btn-ghost btn-sm" data-action="reset-nav-order" data-space="finance">${icon('refresh')}Réinitialiser l’ordre des onglets</button></div>` : ''}`;
    },
  };
  return `
    ${pageHeadHTML({title:'Paramètres', finding:'Comptes, synchronisation et assistant.'})}
    <div class="settings-layout">
      <nav class="settings-nav" aria-label="Sections des paramètres">
        ${PARAM_SECTIONS.map(x=>`<button data-action="param-section" data-sec="${x.id}" aria-current="${x.id===sec}">${icon(x.icon)}${x.label}</button>`).join('')}
      </nav>
      <div class="card settings-block detail-in" data-detail="${sec}">${body[sec]()}</div>
    </div>
  `;
}
