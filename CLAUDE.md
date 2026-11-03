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
  `actionsChg`, `actionsAbo`, `actionsComptes`…), juste sous ses fonctions, dans
  le module du domaine. Un nouveau domaine = une nouvelle table, ajoutée à
  `ACTION_DOMAINES` dans `enregistrerActions()` (`js/actions.js`).
- Ne jamais remettre de logique dans `handleAction` : il ne fait que chercher
  dans `ACTIONS`. Pas de variable partagée entre actions : passer `id` et `el`
  en paramètres (`parId(liste, id)` pour retrouver une ligne).
- Lancer `node tests/aiguillage-actions.mjs` : il vérifie que chaque
  `data-action` écrite a sa fonction et qu'aucune n'est déclarée deux fois.
- Plus généralement : quand une fonction grossit à chaque tâche, la découper
  dans la tâche qui la fait déborder, plutôt que d'ajouter « juste une branche ».

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
  d'un outil : `grep -rn '\bnom\b' js index.html` pour chaque candidat.
- Un outil d'analyse se valide sur des cas connus avant d'être cru : vérifier
  à la main 2–3 résultats surprenants (ex. une fonction `render*` « morte » est
  forcément un faux positif) et citer les lignes après les avoir ouvertes.
- Toute modification de `.claude/skills/graphify/scripts/graphify.mjs` passe
  `node tests/graphify.mjs` ; un nouveau motif d'appel non vu → un cas dans
  `tests/fixtures/graphify-cas.html`.
- Annoncer les limites d'une analyse statique (appels dynamiques, noms locaux
  homonymes) dans la réponse plutôt que de présenter le résultat comme exact.

## Tests
- Deux familles de tests dans `tests/` :
  - `*.test.mjs` : tests unitaires rapides, sans dépendance ni navigateur.
    `node --test tests/*.test.mjs` (≈ 0,2 s). À lancer avant chaque commit.
  - `*.mjs` (sans `.test`) : scénarios Playwright, `node tests/<nom>.mjs`.
- Toute modification de `esc`, `attrEsc`, `r2`, `sumR2`, `fmtEUR`, `moisDe`,
  `addMonths` ou `monthKey` doit garder `tests/fonctions-pures.test.mjs` vert.
  Ces fonctions sont appelées partout : une erreur touche toute l'application
  (faille XSS, totaux faux de quelques centimes).
- Les tests unitaires **importent `js/utils.js`** (et `tests/releve-lecture.mjs`
  importe `js/releve-lecture.js`) : ne jamais recopier une fonction dans un
  test, la copie divergerait sans prévenir. Ces deux modules doivent donc
  rester importables sous Node : ni DOM, ni état, ni import d'un autre module
  (sauf `utils.js`).
- Les scénarios Playwright lisent l'app par `page.evaluate(() => currentUser())` :
  `tests/outils/exposer-modules.mjs` pose sur `window` un accesseur par export.
  Un nom lu par un test doit donc être exporté par son module. Les vérifications
  statiques (data-action écrites, CSS) passent par `tests/outils/sources.mjs`
  (`index.html` + `css/app.css` + `js/**/*.js`), jamais par `index.html` seul.
- `perf-releve.mjs` mesure des durées : le lancer seul, pas en parallèle des
  autres scénarios (il échoue sous charge sans régression réelle).

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
  (`grep -rn "nomFonction" js index.html css`). S'il n'en reste aucun, supprimer la fonction dans
  le même commit. Faire de même pour les variables, constantes et classes CSS.
- Ne pas ajouter de fonction « pour plus tard » : on ne l'écrit que si on l'appelle.
- Avant de livrer, vérifier que chaque fonction ajoutée ou modifiée par le diff
  a au moins un appel (un nom qui n'apparaît qu'une fois correspond à du code mort).
- `tests/break-ui-comptes.html` est une copie figée de l'app pour les tests de
  robustesse. Elle ne compte pas comme un appel et on ne la nettoie pas avec l'app.
- Corriger un problème localisé par la correction la plus petite qui suffit. Pas de
  refonte globale (« tout réécrire de A à Z ») pour un défaut ponctuel : elle ferait
  courir à l'utilisateur un risque de régression sans rien lui apporter.

## Modules ES (`js/`) — leçons du fichier unique
Ce que j'ai mal fait à l'origine : toute l'application (HTML, 1 000 lignes de
CSS et plus de 500 fonctions JS) tenait dans `index.html`, dans une seule
portée globale. Chaque tâche y ajoutait du code sans frontière :
- n'importe quelle fonction pouvait en appeler une autre, et 23 variables
  globales (`state`, `currentView`, `colFilterOpen`, `releveSession`…) étaient
  réaffectées depuis d'autres domaines que le leur, sans que rien ne le montre ;
- l'ordre des écouteurs `click`/`keydown` (île, sélection, événements) ne tenait
  qu'à leur position dans le fichier ;
- deux branches touchaient toujours le même fichier : conflits Git, relecture
  lourde, y compris pour moi ;
- du code mort et des doublons s'accumulaient (`escapeHTML` à côté d'`esc`,
  `releveArrondi` copie de `r2`, trois copies de la mécanique des séries
  abonnements / paiements en plusieurs fois / charges, 19 classes CSS et 8
  variables CSS sans usage, des `ghSha` écrits jamais relus).

Pendant la migration elle-même, deux erreurs à ne pas refaire :
- j'ai découpé le fichier par **numéros de ligne** : après la suppression d'une
  seule ligne, `boot` est parti dans `assistant.js`. Il faut découper par
  **noms** (première déclaration de chaque section) et vérifier ensuite que
  chaque déclaration d'origine se retrouve dans exactement un module ;
- le test de graphify sur l'app est devenu **décoratif** : il vérifiait que des
  fonctions vivantes n'étaient pas dans `--dead`, ce qui restait vrai une fois
  `index.html` vidé (elles n'étaient plus trouvées du tout). Une assertion
  d'absence doit s'accompagner d'une assertion de présence.

Règles :
- Un domaine = un module : `utils.js` (pur), `store.js` (état et sauvegarde),
  `calculs.js`, `series/` (abonnements, ppf, charges et leur mécanique commune
  `series.js`), `releve-lecture.js` (pur) et `releve.js`, `sync.js`, `auth.js`,
  `comptes.js`, `notifications.js`, `assistant.js`, `ui/` (nav, île, modale,
  filtres, thèmes…), `views/` (une vue par fichier), `evenements.js` (écouteurs
  du document), `actions.js` (aiguillage), `main.js` (démarrage). Du nouveau code
  va dans le module de son domaine ; un nouveau domaine = un nouveau module.
- Aucun outil de build : `index.html` charge un seul `<script type="module"
  src="js/main.js">`. Les modules ne marchent pas en `file://` : servir le dépôt
  en HTTP (GitHub Pages, ou le petit serveur des tests).
- Une variable de module (`let`/`var`) n'est réaffectée que par son module.
  Ailleurs, on la lit (liaison vivante) et on la change par son setter
  `setXxx(v)`, déclaré juste sous elle. Jamais de `window.x = …` pour partager.
- Le premier niveau d'un module ne contient que des déclarations. Pas d'effet
  au chargement (écouteur, lecture d'une constante d'un autre module) : les
  imports sont circulaires, l'ordre d'évaluation n'est pas celui du code et une
  constante lue trop tôt lève une erreur (TDZ). Les écouteurs globaux vont dans
  `ecouteursXxx()` de leur module, appelée par `main.js` dans l'ordre voulu ;
  les tables d'actions sont lues par `enregistrerActions()`.
- Les imports sont explicites et limités à ce qui sert ; un import qui ne sert
  plus part dans le même commit que son dernier usage.
- Avant de livrer une modification d'un module, vérifier les noms non définis
  (un import oublié ne casse qu'au moment où la ligne s'exécute, et les tests
  ne passent pas partout) : `eslint` avec la règle `no-undef`, ou à défaut
  `grep` de chaque nom ajouté.
- Quand un module grossit au point de mêler deux sujets, le scinder dans la
  tâche qui le fait déborder (même règle que pour les fonctions).

