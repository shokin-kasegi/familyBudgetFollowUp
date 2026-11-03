/* Routeur : rendu de la vue courante et synchronisation avec l'URL. */
import { currentUser } from './auth.js';
import { afterRender, closeSidebarMobile } from './evenements.js';
import { aboPurger } from './series/abonnements.js';
import { chgReporter } from './series/charges.js';
import { ppfRecalerTout } from './series/ppf.js';
import { currentView, persist, setCurrentView, state } from './store.js';
import { closeModal } from './ui/modale.js';
import { renderSidebar, setCurrentSpace, spaceOfView } from './ui/nav.js';
import { renderAnalyse } from './views/analyse.js';
import { renderAnnuelle } from './views/annuelle.js';
import { renderDashboard } from './views/dashboard.js';
import { renderDepenses } from './views/depenses.js';
import { renderEcheancier } from './views/echeancier.js';
import { renderGroupesListe, renderParametres } from './views/parametres.js';
import { renderReleve } from './views/releve.js';
import { renderRevenus } from './views/revenus.js';

/* ============================== RENDER ROOT ============================== */
export async function render(){
  if(currentUser() && (aboPurger() + ppfRecalerTout() + chgReporter())) persist();
  renderSidebar();
  const view = document.getElementById('view');
  const renderers = {
    dashboard: renderDashboard, revenus: renderRevenus,
    depenses: renderDepenses, echeancier: renderEcheancier, annuelle: renderAnnuelle, analyse: renderAnalyse, parametres: renderParametres, releve: renderReleve,
    groupesListe: renderGroupesListe,
  };
  view.innerHTML = renderers[currentView] ? renderers[currentView]() : '';
  afterRender();
  syncRouteToUrl();
}

/* ============================== URL ============================== */
// La vue affichée (et son mois / son année) est reflétée dans l'adresse :
// #depenses/2026-10, #annuelle/2026, #parametres… — un rechargement ramène au même
// endroit, un lien peut être partagé et le bouton Retour revient à la vue précédente.
const ROUTE_VIEWS = ['dashboard','revenus','depenses','echeancier','releve','annuelle','analyse','parametres','groupesListe'];
export const MONTH_VIEWS = new Set(['dashboard','revenus','depenses']);
let lastRoutedView = null;
export function setLastRoutedView(v){ lastRoutedView = v; }
function routeHash(){
  if(MONTH_VIEWS.has(currentView)) return `#${currentView}/${state.selectedMonth}`;
  if(currentView==='annuelle') return `#annuelle/${state.selectedYear}`;
  return '#'+currentView;
}
function syncRouteToUrl(){
  const h = routeHash();
  if(location.hash!==h){
    // Changer de vue crée une entrée d'historique ; changer de mois remplace l'entrée
    // courante, pour que Retour ne repasse pas par chaque mois parcouru.
    if(lastRoutedView && lastRoutedView!==currentView) history.pushState(null, '', h);
    else history.replaceState(null, '', h);
  }
  lastRoutedView = currentView;
}
export function applyRouteFromUrl(){
  const m = /^#(\w+)(?:\/(\d{4}-\d{2}|\d{4}))?$/.exec(location.hash);
  if(!m || !ROUTE_VIEWS.includes(m[1])) return false;
  setCurrentView(m[1]);
  if(currentView!=='parametres') setCurrentSpace(spaceOfView(currentView));
  if(m[2] && MONTH_VIEWS.has(currentView) && /^\d{4}-(0[1-9]|1[0-2])$/.test(m[2])) state.selectedMonth = m[2];
  if(m[2] && currentView==='annuelle' && /^\d{4}$/.test(m[2])) state.selectedYear = Number(m[2]);
  lastRoutedView = currentView;
  return true;
}

// Écouteurs globaux du module : posés par main.js, dans l'ordre d'origine
// (plusieurs modules écoutent les mêmes événements du document).
export function ecouteursRouteur(){
  window.addEventListener('popstate', async ()=>{
    if(!currentUser()) return;
    if(!applyRouteFromUrl()){ history.replaceState(null, '', routeHash()); return; } // adresse inconnue : on garde la vue courante
    closeModal(); closeSidebarMobile();
    await render();
  });
}
