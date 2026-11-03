/* Aiguillage des data-action : chaque domaine expose sa table { nom: fonction } ; handleAction ne fait que chercher dans ACTIONS. */
import { actionsAssistant } from './assistant.js';
import { actionsComptes } from './comptes.js';
import { actionsNotif } from './notifications.js';
import { actionsReleve } from './releve.js';
import { actionsAbo } from './series/abonnements.js';
import { actionsChg } from './series/charges.js';
import { actionsPpf } from './series/ppf.js';
import { actionsStockage } from './sync.js';
import { actionsTableaux } from './ui/filtres.js';
import { actionsNavigation } from './ui/nav.js';
import { actionsAnalyse } from './views/analyse.js';
import { actionsDashboard, actionsGraphiques } from './views/dashboard.js';
import { actionsDepenses } from './views/depenses.js';
import { actionsRevenus } from './views/revenus.js';

export const ACTIONS = Object.create(null); // sans prototype : data-action="toString" ne trouve rien
export let ACTION_DOMAINES = null;
// Appelée une fois par main.js, quand tous les modules sont évalués : avec les imports
// circulaires, une table d'un autre domaine peut ne pas encore exister au chargement.
export function enregistrerActions(){
  ACTION_DOMAINES = {actionsRevenus, actionsDepenses, actionsAbo, actionsChg, actionsPpf, actionsTableaux, actionsGraphiques,
    actionsAnalyse, actionsDashboard, actionsNavigation, actionsReleve, actionsComptes, actionsNotif, actionsStockage, actionsAssistant};
  for(const [domaine, table] of Object.entries(ACTION_DOMAINES)){
    for(const [nom, fn] of Object.entries(table)){
      if(ACTIONS[nom]) console.error(`data-action « ${nom} » déclarée deux fois (dont dans ${domaine})`);
      ACTIONS[nom] = fn;
    }
  }
}
export async function handleAction(action, id, el){
  const fn = ACTIONS[action];
  if(fn) return fn(id, el);
}
