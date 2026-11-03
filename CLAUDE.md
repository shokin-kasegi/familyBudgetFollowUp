# Consignes pour Claude

## Branches
- Ne jamais créer de branche au nom généré automatiquement (`claude/...`).
- Chaque nouvelle tâche part de `main` sur une branche `RV2-XX`, en prenant le
  numéro suivant le plus élevé existant sur `origin` (ex. après `RV2-07` → `RV2-08`).
  Vérifier avec `git fetch origin && git branch -r | grep RV2-`.

## Code mort : ne pas en laisser derrière soi
Erreur commise : quatre fonctions sont restées dans `index.html` sans plus aucun appel.
- `shortMonthLabel` : ses derniers appels (Objectifs, Charges) ont été retirés dans
  0dc6d33 (« Budget réduit aux entrées et sorties »), mais la fonction est restée.
- `revenusDuMois` : réécrite dans 0dc6d33, puis son dernier appel est parti dans a0dc101
  (« hors revenu total ») au profit de `revenusDuMoisListe`.
- `dashPosteSubs` : créée dans la refonte V1 (92a637c), puis son seul appel a été retiré
  dans 83cfb1f (« Abonnements prévus et graphiques »).
- `ghClearConfig` : ajoutée dans 95426cb et jamais branchée.

Règles à suivre :
- Quand une modification retire ou remplace un appel, chercher les appels qui restent
  (`grep -n "nomFonction" index.html`). S'il n'en reste aucun, supprimer la fonction dans
  le même commit. Faire de même pour les variables, constantes et classes CSS.
- Ne pas ajouter de fonction « pour plus tard » : on ne l'écrit que si on l'appelle.
- Avant de livrer, vérifier que chaque fonction ajoutée ou modifiée par le diff
  a au moins un appel (un nom qui n'apparaît qu'une fois correspond à du code mort).
- `tests/break-ui-comptes.html` est une copie figée de l'app pour les tests de
  robustesse. Elle ne compte pas comme un appel et on ne la nettoie pas avec l'app.
- Corriger un problème localisé par la correction la plus petite qui suffit. Pas de
  refonte globale (« tout réécrire de A à Z ») pour un défaut ponctuel : elle ferait
  courir à l'utilisateur un risque de régression sans rien lui apporter.
