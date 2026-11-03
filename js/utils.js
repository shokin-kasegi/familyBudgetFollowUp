/* Utilitaires purs appelés partout : échappement HTML, arrondi au centime, format des montants et des mois. Sans DOM ni état ; testés par tests/fonctions-pures.test.mjs. */

export const MONTH_NAMES = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
export const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);

/* ============================== HELPERS ============================== */
/* Montants : au centime partout. L'arrondi à l'euro (fmtEUR0) est réservé aux
   phrases de constat et aux cellules de la Vue annuelle sur téléphone.
   Intl insère une espace fine insécable (U+202F) comme séparateur de milliers,
   presque invisible avec certaines polices : on la remplace par une espace
   insécable normale (U+00A0). */
const NF_EUR2 = new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2});
const NF_EUR0 = new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR',maximumFractionDigits:0});
export const NF_INT = new Intl.NumberFormat('fr-FR',{maximumFractionDigits:0});
export const sp = s => String(s).replace(/\u202F/g,'\u00A0');
export const r2 = x => Math.round((Number(x)||0)*100)/100;
// Somme de montants arrondis chacun au centime : un total se calcule toujours
// depuis les parties telles qu'elles sont affichées.
export const sumR2 = (arr, f) => r2((arr||[]).reduce((s,x)=>s+r2(f ? f(x) : x),0));
export const fmtEUR = (n) => sp(NF_EUR2.format(r2(n)).replace('-','−'));
export const fmtEUR0 = (n) => sp(NF_EUR0.format(Math.round(Number(n)||0)).replace('-','−'));
// Valeur absente (ancien enregistrement, import incomplet) : un tiret gris, jamais « undefined ».
export function dash(v){ return (v===undefined || v===null || (typeof v==='string' && !v.trim())) ? '<span class="nil">—</span>' : esc(v); }
export function fmtDate(d){ if(!d) return '—'; const dt=new Date(d+'T00:00:00'); if(isNaN(dt)) return '—'; return dt.toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'}); }
export function monthKey(y,m){ return `${y}-${String(m).padStart(2,'0')}`; }
export function monthLabel(key){ const [y,m] = key.split('-').map(Number); return `${MONTH_NAMES[m-1]} ${y}`; }
export function addMonths(key, delta){ let [y,m]=key.split('-').map(Number); m+=delta; while(m>12){m-=12;y++;} while(m<1){m+=12;y--;} return monthKey(y,m); }
export function currentMonthKey(){ const n = new Date(); return monthKey(n.getFullYear(), n.getMonth()+1); }
export function isFutureMonth(key){ return key > currentMonthKey(); }
export function monthName(key){ return MONTH_NAMES[Number(key.split('-')[1])-1]; }
export function ucfirst(t){ return t ? t.charAt(0).toUpperCase()+t.slice(1) : t; }

/* ============================== ABONNEMENTS ============================== */
/* Une dépense marquée abonnement porte un identifiant de série (aboId). Chaque
   prélèvement validé annonce le suivant : une dépense prévue (prevu:true) le mois
   d'après, au même jour. Elle n'entre dans aucun calcul (graphiques, reste à vivre)
   tant qu'elle n'est pas validée, à la main ou par un relevé importé. Le premier
   jour du mois suivant, une prévision restée sans validation est retirée, avec
   toutes celles de la série : l'abonnement est considéré comme arrêté. */
export function moisDe(date){ return String(date||'').slice(0,7); }
export function dateDansMois(key, jour){
  const [y,m] = key.split('-').map(Number);
  const dernier = new Date(y, m, 0).getDate();
  return `${key}-${String(Math.min(Math.max(1, Number(jour)||1), dernier)).padStart(2,'0')}`;
}
export function attrEsc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }
// Échappe une valeur saisie par l'utilisateur avant de l'insérer dans du HTML (texte ou attribut).
const ESC_MAP = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
export function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>ESC_MAP[c]); }

export function fmtCount(n, singular, plural){ return `${n} ${n>1 ? plural : singular}`; }
export function niceCeil(v){ if(v<=0) return 1000; const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v/p; return (f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p; }

/* ---- Aiguillage des data-action ----
   Chaque data-action est servie par une fonction `actionXxx(id, el)` inscrite dans la
   table de son domaine ci-dessus. Ajouter une action = écrire sa fonction avec celles
   du domaine et l'inscrire dans la table : handleAction ne change pas. */
export function parId(arr, id){ return arr.find(x=>x.id===id); }
