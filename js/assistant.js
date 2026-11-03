/* Assistant Claude : panneau de discussion, et ses actions. */
import { dashboardData } from './calculs.js';
import { render } from './routeur.js';
import { aboPrevisionsDuMois } from './series/abonnements.js';
import { chgPrevisionsDuMois } from './series/charges.js';
import { state } from './store.js';
import { icon } from './ui/icones.js';
import { toast } from './ui/modale.js';
import { esc, fmtEUR, monthLabel, sumR2 } from './utils.js';

/* ---- Assistant Claude ---- */
async function actionSaveClaudeKey(){
  const v = document.getElementById('claude-key-input').value.trim(); if(!v) return; localStorage.setItem('claude_api_key', v); updateFab(); await render(); toast('Assistant activé');
}
async function actionRemoveClaudeKey(){
  localStorage.removeItem('claude_api_key'); updateFab(); await render(); toast('Clé retirée');
}
export const actionsAssistant = {
  'save-claude-key': actionSaveClaudeKey,
  'remove-claude-key': actionRemoveClaudeKey,
};

/* ============================== ASSISTANT CLAUDE ============================== */
function claudeKey(){ return localStorage.getItem('claude_api_key')||''; }
let chatOpen = false;
let chatHistory = [];
try{ chatHistory = JSON.parse(localStorage.getItem('claude_chat_msgs')||'[]'); }catch(e){ chatHistory=[]; }

export function renderClaudeSection(){
  const key = claudeKey();
  if(!key){
    return `
      <div class="field"><label for="claude-key-input">Clé API Anthropic</label>
        <div class="kv-input-row"><input id="claude-key-input" type="password" placeholder="sk-ant-…"><button class="btn btn-primary btn-sm" data-action="save-claude-key">Activer</button></div>
        <div class="field-note">Crée une clé sur console.anthropic.com → API Keys. Des frais d'usage s'appliquent selon ta consommation.</div>
      </div>`;
  }
  return `
    <div class="status-row"><span class="status-dot" style="background:var(--c-reste);"></span>Assistant activé</div>
    <button class="btn btn-ghost btn-sm" data-action="remove-claude-key">${icon('trash')}Retirer la clé</button>`;
}
export function updateFab(){ document.getElementById('claude-fab').style.display = claudeKey() ? 'flex' : 'none'; }

export function toggleChat(force){
  chatOpen = force!==undefined ? force : !chatOpen;
  document.getElementById('claude-panel').classList.toggle('open', chatOpen);
  if(chatOpen) renderChatPanel();
}
function renderChatPanel(){
  const panel = document.getElementById('claude-panel');
  panel.innerHTML = `
    <div class="cp-head"><span class="dot"></span><span class="t">Assistant budget</span><button class="icon-btn" data-action="close-chat" aria-label="Fermer">${icon('x')}</button></div>
    <div class="cp-body" id="cp-body">
      ${chatHistory.length===0 ? `<div class="cp-empty">${icon('bot')}<br>Demande-moi des conseils sur ton budget, ou comment tu pourrais faire évoluer ce site.</div>` : chatHistory.map(m=>`<div class="cp-msg ${m.role}">${esc(m.content)}</div>`).join('')}
    </div>
    <div class="cp-foot">
      <textarea id="cp-input" placeholder="Écris un message…" enterkeyhint="send"></textarea>
      <button class="cp-send" id="cp-send" aria-label="Envoyer">${icon('send')}</button>
    </div>`;
  const body = document.getElementById('cp-body'); body.scrollTop = body.scrollHeight;
  const input = document.getElementById('cp-input');
  document.getElementById('cp-send').onclick = sendChatMessage;
  input.addEventListener('keydown', (e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendChatMessage(); } });
  input.focus();
}
function budgetContextSummary(){
  const key = state.selectedMonth;
  const d = dashboardData(key);
  return `Contexte budget (${monthLabel(key)}) : revenus ${fmtEUR(d.revenu)}, dépenses ${fmtEUR(d.totalDepenses)}, reste à vivre ${fmtEUR(d.reste)}. `+
    `Le site gère des entrées et des sorties datées ; les abonnements prévus (${fmtEUR(sumR2(aboPrevisionsDuMois(key),x=>x.montant))} ce mois) et les charges prévues (${fmtEUR(sumR2(chgPrevisionsDuMois(key),x=>x.montant))} ce mois) ne comptent qu'une fois validés.`;
}
async function sendChatMessage(){
  const input = document.getElementById('cp-input');
  const text = input.value.trim();
  if(!text) return;
  input.value='';
  chatHistory.push({role:'user', content:text});
  persistChat(); renderChatPanel();
  const body = document.getElementById('cp-body');
  const typing = document.createElement('div');
  typing.className='cp-msg assistant'; typing.innerHTML='<div class="typing-dots"><span></span><span></span><span></span></div>';
  body.appendChild(typing); body.scrollTop = body.scrollHeight;
  try{
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'x-api-key': claudeKey(), 'anthropic-version':'2023-06-01', 'anthropic-dangerous-direct-browser-access':'true' },
      body: JSON.stringify({
        model:'claude-sonnet-4-6', max_tokens:1000,
        system: `Tu es l'assistant intégré au site de budget personnel "Solde" de l'utilisateur. Réponds en français, de façon chaleureuse et concise. Tu peux donner des conseils financiers généraux (pas de conseil réglementé), expliquer les chiffres du tableau de bord, ou suggérer des idées d'amélioration pour le site. ${budgetContextSummary()}`,
        messages: chatHistory.slice(-16).map(m=>({role:m.role, content:m.content}))
      })
    });
    const data = await res.json();
    typing.remove();
    if(data.error){ chatHistory.push({role:'assistant', content:'Erreur API : '+(data.error.message||'clé invalide ou quota dépassé.')}); }
    else{
      const textOut = (data.content||[]).map(b=>b.text||'').join('\n').trim() || 'Pas de réponse.';
      chatHistory.push({role:'assistant', content:textOut});
    }
  }catch(e){
    typing.remove();
    chatHistory.push({role:'assistant', content:'Impossible de contacter Claude — vérifie ta connexion ou ta clé API.'});
  }
  persistChat(); renderChatPanel();
}
function persistChat(){ chatHistory = chatHistory.slice(-30); localStorage.setItem('claude_chat_msgs', JSON.stringify(chatHistory)); }
