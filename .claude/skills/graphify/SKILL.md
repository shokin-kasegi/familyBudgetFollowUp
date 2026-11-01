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
node .claude/skills/graphify/scripts/graphify.mjs index.html [--focus <fonction>] [--depth N] [--json]
```

- Sans `--focus` : graphe complet (gros — à réserver à l'analyse en JSON).
- `--focus persist --depth 1` : la fonction, ses appelés et ses appelants directs.
- `--json` : `{ name, line, calls, calledBy }` par fonction (numéro de ligne dans `index.html`).
- Sans `--json` : diagramme Mermaid `flowchart LR`, fonction ciblée surlignée.

Détection : `function nom(…)`, `const|let|var nom = (…) => …` et `= function`.
Chaînes, commentaires, templates et regex sont masqués avant l'appariement des
accolades. Limites : les appels dynamiques (`obj[nom]()`, callbacks passés
par référence sans parenthèses, `data-action` dispatchés par `handleAction`)
ne sont pas vus — le signaler dans la réponse si c'est pertinent.

## Procédure

1. **Argument fourni** (`/graphify renderDashboard 2`) : lancer avec
   `--focus <fonction> --depth <N>` (profondeur 1 par défaut). Si la fonction
   est inconnue, chercher les noms proches avec `--json` et proposer.
2. **Sans argument** : vue d'ensemble. Lancer `--json`, puis :
   - regrouper les fonctions par préfixe/domaine (`render*`, `open*Modal`,
     `releve*`, `sync*`, `persist/load*`, utilitaires `fmt*`, `esc`…) ;
   - repérer les hubs (plus d'appelés : `handleAction`, `render*`) et les
     fonctions les plus appelées (utilitaires critiques) ;
   - lister les fonctions jamais appelées (`calledBy` vide) comme candidates au
     code mort, en rappelant la limite des appels dynamiques (vérifier par
     `grep` avant de conclure).
   - produire un Mermaid **par domaines** (≤ 40 nœuds), pas le graphe brut.
3. **Restitution** : un bloc ```mermaid``` + un court résumé (rôle des
   modules, points chauds, risques). Citer les fonctions en `index.html:ligne`.
   Si l'utilisateur veut une page à partager, publier le diagramme en artifact.
4. Ne rien modifier dans le dépôt : ce skill est en lecture seule.
