/* Séries de dépenses répétées (abonnements, paiements en plusieurs fois, charges) : la mécanique commune. */
import { currentUser } from '../auth.js';
import { mine, state } from '../store.js';
import { moisDe } from '../utils.js';

/* Séries (abonnements, paiements en plusieurs fois, charges) : même mécanique,
   chaque série étant repérée par son champ d'identifiant (aboId, ppfId, chgId). */
export function serieDe(champ, id){ return mine(state.depenses).filter(d=>d[champ]===id); }
export function previsionsDe(champ){ return mine(state.depenses).filter(d=>d.prevu && d[champ]); }
export function previsionsDuMoisDe(champ, key){ return previsionsDe(champ).filter(d=>moisDe(d.date)===key).sort((a,b)=>a.date.localeCompare(b.date)); }
// Séries en cours (une par prévision), triées pour le choix du rattachement :
// deux séries chez le même commerçant se distinguent par nom, montant et date.
export function seriesAuChoixDe(champ){ return previsionsDe(champ).sort((a,b)=>String(a.libelle||'').localeCompare(String(b.libelle||''),'fr') || a.montant-b.montant || a.date.localeCompare(b.date)); }
// Arrête une série : ses prévisions disparaissent, les paiements validés restent.
export function arreterSerie(champ, id){
  const avant = state.depenses.length;
  const me = currentUser();
  state.depenses = state.depenses.filter(d=>!(d.prevu && d[champ]===id && me && d.ownerId===me.id));
  return avant - state.depenses.length;
}
