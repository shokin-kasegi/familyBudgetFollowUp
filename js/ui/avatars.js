/* Avatars : teintes d'identité. */
import { currentUser } from '../auth.js';
import { initials } from './ile.js';

/* Teintes pâles d'identité, réservées aux avatars (jamais dans les graphiques) :
   moi en bleu nuit, les autres en teintes neutres. */
const AVATAR_TINTS = [['#2a2a30','#d8d8de'],['#1f3326','#a8e6bc'],['#3a2f14','#f0d78c'],['#2b2140','#cdb8ff']];
function avatarTint(u){
  if(!u) return ['var(--raised)','var(--muted)'];
  const me = currentUser();
  if(me && u.id===me.id) return ['#12324f','#9fd1ff'];
  let h=0; for(const c of (u.id||'')) h = (h*31 + c.charCodeAt(0)) % AVATAR_TINTS.length;
  return AVATAR_TINTS[Math.abs(h)%AVATAR_TINTS.length];
}
export function avatarColor(u){ const [bg,fg] = avatarTint(u); return `${bg};color:${fg}`; }
export function avatarHTML(u, size){ return `<span class="avatar" style="background:${avatarColor(u)}${size?`;width:${size}px;height:${size}px;font-size:${Math.round(size*0.36)}px`:''}" aria-hidden="true">${initials(u)}</span>`; }
