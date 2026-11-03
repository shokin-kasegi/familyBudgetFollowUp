# Consignes pour Claude

## Branches
- Ne jamais créer de branche au nom généré automatiquement (`claude/...`).
- Chaque nouvelle tâche part de `main` sur une branche `RV2-XX`, en prenant le
  numéro suivant le plus élevé existant sur `origin` (ex. après `RV2-07` → `RV2-08`).
  Vérifier avec `git fetch origin && git branch -r | grep RV2-`.

## Analyse de code (graphify) — leçons d'une erreur
Ce qui a mal été fait à l'origine : la première version de graphify ne comptait
que les appels `nom(…)` à l'intérieur des fonctions nommées. Le code des
écouteurs anonymes, de la table du routeur (`render`), des `onclick =`, des
`setInterval(fn)` et des IIFE était ignoré ; 39 fonctions vivantes
(`renderDashboard`, `pollNow`…) ont été présentées comme « jamais appelées ».
L'outil donnait aussi des numéros de ligne faux (comptés dans la concaténation
des scripts) et coupait le corps des fonctions à paramètres déstructurés ou
des arrow functions sur une ligne. Le résultat a été livré sans être confronté
au code.

Pour ne pas le reproduire :
- Ne jamais conclure « code mort » ni supprimer une fonction sur la seule foi
  d'un outil : `grep -n '\bnom\b' index.html` pour chaque candidat.
- Un outil d'analyse se valide sur des cas connus avant d'être cru : vérifier
  à la main 2–3 résultats surprenants (ex. une fonction `render*` « morte » est
  forcément un faux positif) et citer les lignes après les avoir ouvertes.
- Toute modification de `.claude/skills/graphify/scripts/graphify.mjs` passe
  `node tests/graphify.mjs` ; un nouveau motif d'appel non vu → un cas dans
  `tests/fixtures/graphify-cas.html`.
- Annoncer les limites d'une analyse statique (appels dynamiques, noms locaux
  homonymes) dans la réponse plutôt que de présenter le résultat comme exact.
