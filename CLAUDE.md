# Consignes pour Claude

## Branches
- Ne jamais créer de branche au nom généré automatiquement (`claude/...`).
- Chaque nouvelle tâche part de `main` sur une branche `RV2-XX`, en prenant le
  numéro suivant le plus élevé existant sur `origin` (ex. après `RV2-07` → `RV2-08`).
  Vérifier avec `git fetch origin && git branch -r | grep RV2-`.

## Tests
- Deux familles de tests dans `tests/` :
  - `*.test.mjs` : tests unitaires rapides, sans dépendance ni navigateur.
    `node --test tests/*.test.mjs` (≈ 0,2 s). À lancer avant chaque commit.
  - `*.mjs` (sans `.test`) : scénarios Playwright, `node tests/<nom>.mjs`.
- Toute modification de `esc`, `attrEsc`, `r2`, `sumR2`, `fmtEUR`, `moisDe`,
  `addMonths` ou `monthKey` doit garder `tests/fonctions-pures.test.mjs` vert.
  Ces fonctions sont appelées partout : une erreur touche toute l'application
  (faille XSS, totaux faux de quelques centimes).
- Les tests unitaires lisent les définitions **directement dans `index.html`**
  (une ligne par fonction) : ne jamais recopier une fonction dans un test, la
  copie divergerait sans prévenir. Si une de ces fonctions passe sur plusieurs
  lignes, adapter l'extraction plutôt que de la dupliquer.

## Erreurs passées à ne pas reproduire
- Les fonctions utilitaires critiques (échappement HTML, arrondi, format des
  montants et des mois) ont été écrites sans aucun test, alors que seuls des
  scénarios Playwright lourds existaient. Règle : toute fonction pure appelée
  à de nombreux endroits reçoit son test unitaire dans le même commit.
- Un test doit prouver qu'il détecte la panne : après l'avoir écrit, casser
  volontairement la fonction (en local, sans commit) et vérifier qu'il échoue.
- Tester la fonction qui porte réellement la logique : le passage d'année
  n'est pas dans `moisDe` (simple découpe `AAAA-MM`) mais dans `addMonths`.
- Pas d'assertion décorative (qui passe quelle que soit l'implémentation) :
  chaque cas vise un comportement précis.
- `attrEsc` n'échappe que `&` et `"` : il ne protège qu'un attribut entre
  guillemets doubles. Pour du texte HTML ou un attribut entre apostrophes,
  utiliser `esc`.
- La tâche impose la branche `RV2-XX` même si l'environnement en propose une
  `claude/...` : vérifier la numérotation sur `origin` avant de commencer.
