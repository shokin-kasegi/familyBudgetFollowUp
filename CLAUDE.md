# Consignes pour Claude

## Branches
- Ne jamais créer de branche au nom généré automatiquement (`claude/...`).
- Chaque nouvelle tâche part de `main` sur une branche `RV2-XX`, en prenant le
  numéro suivant le plus élevé existant sur `origin` (ex. après `RV2-07` → `RV2-08`).
  Vérifier avec `git fetch origin && git branch -r | grep RV2-`.

## Actions (`data-action`)
Ce que j'ai mal fait à l'origine : à chaque fonctionnalité (relevé, paiements en
plusieurs fois, charges, abonnements, comptes…), j'ai ajouté un `case` de plus au
`switch` unique de `handleAction`, jusqu'à 87 branches et 530 lignes dans une
seule fonction. Chaque ajout était petit, mais je n'ai jamais pris le temps de
découper : un `break` oublié, une accolade décalée ou la fermeture `find` partagée
(qui capturait `id`) pouvaient casser des actions sans rapport, la fonction était
illisible et deux tâches en parallèle s'y marchaient dessus dans Git. graphify ne
voyait pas non plus quelle action appelait quoi.

Désormais :
- Une action = une fonction nommée `actionXxx(id, el)` (nom en camelCase de la
  `data-action`, ex. `ppf-total` → `actionPpfTotal`), déclarée avec `function`
  pour que graphify la voie. Sortir avec `return`, jamais `break`.
- Elle est inscrite dans la table de son domaine (`actionsReleve`, `actionsPpf`,
  `actionsChg`, `actionsAbo`, `actionsComptes`…), juste sous ses fonctions. Un
  nouveau domaine = une nouvelle table, ajoutée à `ACTION_DOMAINES`.
- Ne jamais remettre de logique dans `handleAction` : il ne fait que chercher
  dans `ACTIONS`. Pas de variable partagée entre actions : passer `id` et `el`
  en paramètres (`parId(liste, id)` pour retrouver une ligne).
- Lancer `node tests/aiguillage-actions.mjs` : il vérifie que chaque
  `data-action` écrite a sa fonction et qu'aucune n'est déclarée deux fois.
- Plus généralement : quand une fonction grossit à chaque tâche, la découper
  dans la tâche qui la fait déborder, plutôt que d'ajouter « juste une branche ».
