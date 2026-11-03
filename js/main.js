/* Point d'entrée : pose les écouteurs globaux dans l'ordre d'origine, enregistre les actions, puis démarre l'application. */
import { enregistrerActions } from './actions.js';
import { updateFab } from './assistant.js';
import { currentUser, renderAuthGate } from './auth.js';
import { ecouteursEvenements } from './evenements.js';
import { applyRouteFromUrl, ecouteursRouteur, render, setLastRoutedView } from './routeur.js';
import { loadState, setCurrentView } from './store.js';
import { ecouteursSync, ghConfigured, ghPull, startPolling } from './sync.js';
import { ecouteursIle } from './ui/ile.js';
import { ecouteursNav, setCurrentSpace } from './ui/nav.js';
import { ecouteursSelection } from './ui/selection.js';
import { ecouteursDashboard } from './views/dashboard.js';

/* ============================== BOOT ============================== */
export async function boot(){
  await loadState();
  currentUser(); // complète l'empreinte d'une ancienne session avec la copie locale, avant la synchro
  if(ghConfigured()){ await ghPull().catch(()=>{}); }
  const ok = await renderAuthGate();
  if(!ok) return;
  setCurrentView('dashboard');
  setCurrentSpace('finance');
  setLastRoutedView(null);
  applyRouteFromUrl();
  await render();
  updateFab();
  if(ghConfigured()) startPolling();
}
// Écouteurs globaux dans l'ordre où ils étaient déclarés dans index.html : clic, clavier et
// saisie sont écoutés par plusieurs modules, et l'ordre de leurs réactions doit rester le même.
ecouteursNav();
ecouteursIle();
ecouteursSelection();
ecouteursRouteur();
ecouteursDashboard();
ecouteursEvenements();
ecouteursSync();
enregistrerActions();
(async function init(){
  await boot();
})();
