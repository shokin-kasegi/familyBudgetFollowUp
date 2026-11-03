/* Les fonctions et l'état de l'application vivent dans des modules ES : rien
   n'est global. Pour que les scénarios puissent écrire page.evaluate(() =>
   currentUser()) ou lire state.depenses, ce script de test pose sur window un
   accesseur par export de chaque module. Ce sont des liaisons vivantes : après
   setState(…), window.state rend le nouvel état. Rien de cela n'est chargé par
   le site lui-même.
   Usage : await exposerModules(ctx)   (contexte ou page, avant le premier goto). */
import { modulesJs } from './sources.mjs';

export async function exposerModules(cible){
  const urls = JSON.stringify(modulesJs().map(m => '/' + m));
  await cible.addInitScript(`
    window.__modulesExposes = new Promise(fini => {
      // Les modules du document sont évalués avant DOMContentLoaded : import()
      // retrouve alors les mêmes instances, sans les réévaluer.
      document.addEventListener('DOMContentLoaded', async () => {
        for(const ns of await Promise.all(${urls}.map(url => import(url)))){
          for(const nom of Object.keys(ns)){
            if(!(nom in window)) Object.defineProperty(window, nom, {get: () => ns[nom], configurable: true});
          }
        }
        fini(true);
      });
    });`);
}
