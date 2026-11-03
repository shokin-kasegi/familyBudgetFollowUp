/* Sources de l'application pour les vérifications statiques des tests
   (data-action écrites, règles du système de design…) : index.html, la feuille
   de style et tous les modules de js/. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Chemins des modules, relatifs à la racine (« js/views/dashboard.js »).
export function modulesJs(){
  const out = [];
  (function parcourir(dir){
    for(const e of fs.readdirSync(path.join(ROOT, dir), {withFileTypes:true})){
      const rel = dir + '/' + e.name;
      if(e.isDirectory()) parcourir(rel); else if(e.name.endsWith('.js')) out.push(rel);
    }
  })('js');
  return out.sort();
}
export const lire = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');
export const css = () => lire('css/app.css');
export const toutesSources = () => [lire('index.html'), css(), ...modulesJs().map(lire)].join('\n');
