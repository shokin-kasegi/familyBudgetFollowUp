/* Cas de modules ES pour tests/graphify.mjs : les lignes import ne comptent pas
   comme une utilisation. */
import { utilisee, morteMaisImportee } from './b.js';
import './c.js';

export function point(){
  return utilisee(1);
}
point();
