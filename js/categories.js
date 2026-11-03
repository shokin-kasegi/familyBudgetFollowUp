/* Catégories personnalisables (dépenses et revenus). */
import { currentUser } from './auth.js';
import { CATS_DEP, CATS_REV, mine, state } from './store.js';
import { uid } from './utils.js';

/* ============================== CATÉGORIES (personnalisables, dépenses & revenus) ============================== */
// Chacun gère sa propre liste de catégories (créer/supprimer directement depuis le
// menu déroulant « Catégorie ») — seules les siennes apparaissent dans ses formulaires.
// Une même mécanique (ajout via « Autre… », suppression via la croix affichée dans
// la liste) est partagée par les dépenses et les revenus ; seul le tableau d'état
// et les lignes à nettoyer quand une catégorie est supprimée diffèrent.
const CATEGORY_TYPES = {
  depenses: {
    stateKey: 'categoriesDepenses',
    clearFrom(nom){ mine(state.depenses).forEach(d=>{ if(d.categorie===nom) d.categorie=''; }); }
  },
  revenus: {
    stateKey: 'categoriesRevenus',
    clearFrom(nom){
      mine(state.revenusExceptionnels).forEach(r=>{ if(r.categorie===nom) r.categorie=''; });
    }
  }
};
export function seedDefaultCategoriesDep(userId){
  CATS_DEP.forEach(nom=>{ state.categoriesDepenses.push({id:uid(), ownerId:userId, nom}); });
}
export function seedDefaultCategoriesRev(userId){
  CATS_REV.forEach(nom=>{ state.categoriesRevenus.push({id:uid(), ownerId:userId, nom}); });
}
export function myCategories(type){
  return mine(state[CATEGORY_TYPES[type].stateKey]).slice().sort((a,b)=>a.nom.localeCompare(b.nom,'fr'));
}
export function myCategoriesDep(){ return myCategories('depenses'); }
export function addCategory(type, nom){
  nom = (nom||'').trim();
  if(!nom) return {ok:false, msg:'Donne un nom à la catégorie'};
  if(myCategories(type).some(c=>c.nom.toLowerCase()===nom.toLowerCase())) return {ok:false, msg:'Cette catégorie existe déjà'};
  const cat = {id:uid(), ownerId:currentUser().id, nom};
  state[CATEGORY_TYPES[type].stateKey].push(cat);
  return {ok:true, cat};
}
// Supprimer une catégorie retire aussi ce choix de toutes les lignes déjà
// saisies qui l'utilisaient (dépense ou revenu) —
// leur champ Catégorie repasse simplement à vide, la ligne elle-même reste.
export function deleteCategory(type, id){
  const item = mine(state[CATEGORY_TYPES[type].stateKey]).find(c=>c.id===id);
  if(!item) return null;
  CATEGORY_TYPES[type].clearFrom(item.nom);
  state[CATEGORY_TYPES[type].stateKey] = state[CATEGORY_TYPES[type].stateKey].filter(c=>c.id!==item.id);
  return item;
}
