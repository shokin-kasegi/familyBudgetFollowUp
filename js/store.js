/* État de l'application (budget, comptes, social, vue courante), chargement depuis le localStorage et sauvegarde.
   Les autres modules lisent `state`, `authState`… en direct (liaisons vivantes) et les remplacent par setState(), setAuthState()… */
import { currentUser } from './auth.js';
import { seedDefaultCategoriesDep, seedDefaultCategoriesRev } from './categories.js';
import { markDirtyForSync } from './sync.js';

/* ============================== STATE ============================== */
// Email de contact recevant les demandes de création de compte — à renseigner.
export const ADMIN_CONTACT_EMAIL = 'saindouhamza@gmail.com';
export const CATS_DEP = ['Achat','Réparation','Santé','Loisirs','Cadeau','Voyage','Imprévu','Internet','Transport','Mobile','Divertissement','Stockage','Gestion','Finance','Autre'];
export const CATS_REV = ['Salaire','Remboursement','Prime','Cadeau','Autre'];

export var state = null;
export function setState(v){ state = v; }
export var authState = null;
export function setAuthState(v){ authState = v; }
export var socialState = null;
export function setSocialState(v){ socialState = v; }
export var currentView = 'dashboard';
export function setCurrentView(v){ currentView = v; }

export function defaultAuth(){
  return { users: [], setupCodeUsed: false };
}
export function defaultSocial(){
  return { accountRequests: [], accountCreationRequests: [] };
}
export function defaultState(){
  const now = new Date();
  return {
    selectedMonth: `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`,
    selectedYear: now.getFullYear(),
    analyseYear: now.getFullYear(),
    analyseTerm: '',
    analyseCats: [],
    analyseCatLabel: '',
    tableFilters: {},
    chartFilters: {},
    revenusExceptionnels: [],
    depenses: [],
    categoriesDepenses: [],
    categoriesRevenus: [],
    importApprentissage: [],
    abonnementsAlertes: [],
    soldesCompte: []
  };
}

// Remise à zéro forcée, une fois pour tous les appareils : si l'appareil n'a
// pas encore vu cette version de remise à zéro, on efface tout son stockage
// local avant même de charger quoi que ce soit — peu importe ce qu'il avait
// avant (compte créé localement, jamais synchronisé...). Incrémenter
// FORCE_RESET_VERSION déclenche une nouvelle purge générale sur tous les
// appareils, à utiliser uniquement en cas de besoin exceptionnel.
const FORCE_RESET_VERSION = 2;
function applyForceResetIfNeeded(){
  let seen = 0;
  try{ seen = Number(localStorage.getItem('force_reset_version')||0); }catch(e){}
  if(seen < FORCE_RESET_VERSION){
    try{
      localStorage.removeItem('budget_store');
      localStorage.removeItem('budget_auth');
      localStorage.removeItem('budget_social');
      localStorage.removeItem('github_sync_config');
      localStorage.removeItem('budget_session');
      localStorage.removeItem('budget_session_remember');
      sessionStorage.removeItem('budget_session');
      localStorage.setItem('force_reset_version', String(FORCE_RESET_VERSION));
    }catch(e){}
  }
}
export async function loadState(){
  applyForceResetIfNeeded();
  let needsPersist = false, needsPersistAuth = false, needsPersistSocial = false;

  // Données du budget (partagées)
  try{
    const raw = localStorage.getItem('budget_store');
    if(raw){ state = JSON.parse(raw); } else { state = defaultState(); needsPersist = true; }
  }catch(e){ state = defaultState(); needsPersist = true; }

  // Données de connexion (comptes) — fichier séparé, propre à l'authentification
  try{
    const rawAuth = localStorage.getItem('budget_auth');
    if(rawAuth){ authState = JSON.parse(rawAuth); }
    else if(state.users){ authState = { users: state.users }; delete state.users; needsPersist = true; needsPersistAuth = true; }
    else{ authState = defaultAuth(); needsPersistAuth = true; }
    if(authState.setupCodeUsed===undefined){ authState.setupCodeUsed = authState.users.length>0; needsPersistAuth = true; }
  }catch(e){ authState = defaultAuth(); needsPersistAuth = true; }

  // Données sociales (demandes adressées aux administrateurs) — fichier séparé aussi
  try{
    const rawSocial = localStorage.getItem('budget_social');
    socialState = rawSocial ? JSON.parse(rawSocial) : defaultSocial();
    if(!socialState.accountRequests){ socialState.accountRequests = []; needsPersistSocial = true; }
    if(!socialState.accountCreationRequests){ socialState.accountCreationRequests = []; needsPersistSocial = true; }
    if(!rawSocial) needsPersistSocial = true;
  }catch(e){ socialState = defaultSocial(); needsPersistSocial = true; }

  // Migration : d'anciennes saisies (avant la séparation par utilisateur) n'ont pas
  // de propriétaire. On les attribue au premier compte admin pour ne rien perdre.
  const firstAdmin = authState.users.find(u=>u.role==='admin');
  if(firstAdmin){
    OWNED_ARRAYS.forEach(key=>{
      (state[key]||[]).forEach(item=>{ if(!item.ownerId){ item.ownerId = firstAdmin.id; needsPersist = true; } });
    });
  }

  // Migration : l'ancien navOrder (tableau plat, un seul espace) devient un objet
  // par espace, suite à la séparation Finance / Groupes.
  if(Array.isArray(state.navOrder)){
    state.navOrder = { finance: state.navOrder.filter(id=>id!=='parametres') };
    needsPersist = true;
  }

  // Migration : les revenus exceptionnels négatifs (ancien "bricolage" pour noter une
  // dépense ponctuelle, avant l'existence de l'onglet Dépenses) deviennent de vraies
  // dépenses "En une fois", avec un montant positif comme il se doit.
  if(Array.isArray(state.revenusExceptionnels)){
    const negatifs = state.revenusExceptionnels.filter(r=>Number(r.montant)<0);
    if(negatifs.length>0){
      if(!state.depenses) state.depenses = [];
      negatifs.forEach(r=>{
        state.depenses.push({
          id: r.id, ownerId: r.ownerId, libelle: r.libelle, categorie: r.categorie==='Autre' ? 'Imprévu' : r.categorie,
          montant: Math.abs(Number(r.montant)), modePaiement:'Unique', date: r.date, notes:''
        });
      });
      state.revenusExceptionnels = state.revenusExceptionnels.filter(r=>Number(r.montant)>=0);
      needsPersist = true;
    }
  }

  // Migration : passage d'une liste de catégories de dépenses fixe et partagée à
  // des catégories personnalisables par personne. On initialise chaque compte déjà
  // existant avec l'ancienne liste par défaut (rien ne change pour lui tant qu'il
  // ne la modifie pas), plutôt que de le laisser démarrer sans aucune catégorie.
  if(!Array.isArray(state.categoriesDepenses)){
    state.categoriesDepenses = [];
    authState.users.forEach(u=>{ seedDefaultCategoriesDep(u.id); });
    needsPersist = true;
  }

  // Migration : même principe pour les catégories de revenus, jusque-là une
  // liste fixe (CATS_REV) partagée par tout le monde et non personnalisable.
  if(!Array.isArray(state.categoriesRevenus)){
    state.categoriesRevenus = [];
    authState.users.forEach(u=>{ seedDefaultCategoriesRev(u.id); });
    needsPersist = true;
  }

  // Apprentissage de l'import de relevé (formats, commerçants) : vide au départ.
  if(!Array.isArray(state.importApprentissage)){
    state.importApprentissage = [];
    needsPersist = true;
  }

  // Alertes des abonnements (changement de prix, abonnement retiré) : vide au départ.
  if(!Array.isArray(state.abonnementsAlertes)){
    state.abonnementsAlertes = [];
    needsPersist = true;
  }

  // Soldes du compte (fin de relevé importé, ou saisis) : vide au départ.
  if(!Array.isArray(state.soldesCompte)){
    state.soldesCompte = [];
    needsPersist = true;
  }

  if(needsPersist) await persist();
  if(needsPersistAuth) await persistAuth();
  if(needsPersistSocial) await persistSocial();
}
// Les anciennes données (revenus récurrents, échéances, objectifs, charges…) restent
// dans le stockage, intactes mais ignorées, en attendant la refonte du modèle.
export const OWNED_ARRAYS = ['revenusExceptionnels','depenses','categoriesDepenses','categoriesRevenus','importApprentissage','abonnementsAlertes','soldesCompte'];
export function mine(arr){
  const me = currentUser();
  return me ? (arr||[]).filter(e=>e.ownerId===me.id) : [];
}
let saveTimer = null;
export function persist(){
  return new Promise((resolve)=>{
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async ()=>{
      try{
        localStorage.setItem('budget_store', JSON.stringify(state));
        markDirtyForSync();
      }
      catch(e){ console.error('Erreur de sauvegarde locale', e); }
      resolve();
    }, 120);
  });
}
let saveAuthTimer = null;
export function persistAuth(){
  return new Promise((resolve)=>{
    clearTimeout(saveAuthTimer);
    saveAuthTimer = setTimeout(async ()=>{
      try{
        localStorage.setItem('budget_auth', JSON.stringify(authState));
        markDirtyForSync();
      }
      catch(e){ console.error('Erreur de sauvegarde locale (comptes)', e); }
      resolve();
    }, 120);
  });
}
let saveSocialTimer = null;
export function persistSocial(){
  return new Promise((resolve)=>{
    clearTimeout(saveSocialTimer);
    saveSocialTimer = setTimeout(async ()=>{
      try{
        localStorage.setItem('budget_social', JSON.stringify(socialState));
        markDirtyForSync();
      }
      catch(e){ console.error('Erreur de sauvegarde locale (social)', e); }
      resolve();
    }, 120);
  });
}
