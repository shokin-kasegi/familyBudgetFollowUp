---
name: graphify
description: Cartographie le code de l'application (graphe d'appels des fonctions JS d'index.html) et le restitue en diagramme Mermaid ou en JSON. À utiliser quand on demande « graphify », un graphe/une carte du code, qui appelle quoi, l'impact d'une modification sur une fonction, ou une vue d'architecture.
metadata:
  argument-hint: "[fonction] [profondeur]"
---

# Graphify — carte du code

L'application tient dans un seul fichier `index.html` (≈ 500 fonctions dans les
balises `<script>`). Ce skill en extrait le graphe d'appels pour répondre aux
questions d'architecture et d'impact sans tout relire.

## Outil

```bash
node .claude/skills/graphify/scripts/graphify.mjs index.html [--focus <fonction>] [--depth N] [--json] [--dead]
```

- Sans `--focus` : graphe complet (gros — à réserver à l'analyse en JSON).
- `--focus persist --depth 1` : la fonction, ses appelés et ses appelants directs.
- `--json` : `{ name, line, kind, calls, refs, calledBy, referencedBy }` par nœud
  (numéro de ligne dans `index.html` lui-même).
- `--dead` : candidats au code mort (ni appelés ni référencés), `index.html:ligne`.
- Sans `--json` : diagramme Mermaid `flowchart LR`, fonction ciblée surlignée ;
  `-->` = appel, `-.->` = référence sans parenthèses.

Détection : `function nom(…)`, `const|let|var nom = (…) => …` et `= function`.
Chaînes, commentaires, templates et regex sont masqués avant l'appariement des
accolades. Deux sortes de liens :

- **appel** `nom(…)`, y compris `...nom()` et `nom?.()` ;
- **référence** : le nom cité sans parenthèses — `onclick = renderX`,
  `setInterval(pollNow, …)`, `{ dashboard: renderDashboard }`, `[nom]`,
  `.map(nom)`, `requestAnimationFrame(step)`. Une référence compte comme une
  utilisation.

Nœuds synthétiques, pour le code qui n'est dans aucune fonction nommée :

- `@click:2584` : écouteur anonyme `document|window|x.addEventListener('click', (e)=>…)`
  de premier niveau (nom de l'événement + ligne) ;
- `(global)` : le reste du code de premier niveau (initialisation, IIFE
  `(async function init(){…})()`, constantes `const a = b`).

Limites restantes : les appels réellement dynamiques (`obj[nom]()`,
`data-action` dispatchés par chaîne) ne sont pas vus ; les fonctions locales
sont indexées par leur nom, donc deux fonctions/variables locales homonymes
(`first`, `step`) partagent un nœud — le graphe d'impact de ces noms est
approximatif. `tests/graphify.mjs` vérifie tous les cas ci-dessus.

## Procédure

1. **Argument fourni** (`/graphify renderDashboard 2`) : lancer avec
   `--focus <fonction> --depth <N>` (profondeur 1 par défaut). Si la fonction
   est inconnue, chercher les noms proches avec `--json` et proposer.
2. **Sans argument** : vue d'ensemble. Lancer `--json`, puis :
   - regrouper les fonctions par préfixe/domaine (`render*`, `open*Modal`,
     `releve*`, `sync*`, `persist/load*`, utilitaires `fmt*`, `esc`…) ;
   - repérer les hubs (plus d'appelés : `handleAction`, `render*`) et les
     fonctions les plus appelées (utilitaires critiques) ;
   - lister les candidates au code mort avec `--dead` (et non `calledBy` vide,
     qui ignore les références) ; **toujours confirmer chacune par
     `grep -n '\bnom\b' index.html`** avant de la déclarer morte, et ne jamais
     supprimer sur la seule foi du graphe.
   - produire un Mermaid **par domaines** (≤ 40 nœuds), pas le graphe brut.
3. **Restitution** : un bloc ```mermaid``` + un court résumé (rôle des
   modules, points chauds, risques). Citer les fonctions en `index.html:ligne`.
   Si l'utilisateur veut une page à partager, publier le diagramme en artifact.
4. Ne rien modifier dans le dépôt : ce skill est en lecture seule.
