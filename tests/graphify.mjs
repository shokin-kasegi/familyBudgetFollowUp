/* Tests du skill graphify (graphe d'appels) — Node seul, sans navigateur.
   Usage : node tests/graphify.mjs
   - les fonctions citées sans parenthèses (table d'objet, onclick =, setInterval, callback,
     spread, IIFE nommée, écouteurs anonymes) ne sont plus classées « jamais appelées » ;
   - seule la fonction vraiment morte sort dans --dead ;
   - les numéros de ligne renvoient au fichier d'origine ;
   - modules ES (tests/fixtures/graphify-modules) : une ligne import n'est pas une
     utilisation, fichier et ligne de chaque fonction, arrow function en fin de module ;
   - js/ (l'application) : les fonctions vivantes sont bien trouvées, et aucune
     appelée par le routeur ou un écouteur ne sort dans --dead. */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, '.claude/skills/graphify/scripts/graphify.mjs');
const run = (file, ...a) => execFileSync('node', [TOOL, file, ...a], { cwd: ROOT, encoding: 'utf8' });
let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };

const FIX = 'tests/fixtures/graphify-cas.html';
const dead = JSON.parse(run(FIX, '--dead', '--json')).dead.map(d => d.name);
check(JSON.stringify(dead) === '["vraimentMorte"]', `--dead ne garde que la vraie fonction morte (obtenu : ${dead.join(', ')})`);

const g = new Map(JSON.parse(run(FIX, '--json')).nodes.map(n => [n.name, n]));
check(g.get('viaTable').referencedBy.includes('render'), 'valeur d\'un objet : { table: viaTable }');
check(g.get('viaOnclick').referencedBy.includes('render'), 'onclick = viaOnclick');
check(g.get('viaInterval').referencedBy.includes('render'), 'setInterval(viaInterval)');
check(g.get('viaCallback').referencedBy.includes('render'), '[].map(viaCallback)');
check(g.get('viaSpread').calledBy.includes('render'), '[...viaSpread()]');
check(g.get('viaListener').calledBy.includes('@click:27'), 'écouteur anonyme à accolades → nœud @click:27');
check(g.get('viaListenerExpr').calledBy.includes('@pointerup:28'), 'écouteur anonyme à expression → nœud @pointerup:28');
check(g.get('init').calledBy.includes('(global)'), 'IIFE nommée (async function init(){…})()');
check(g.get('viaDestructureCible').calledBy.includes('viaDestructure'), 'paramètres déstructurés : le corps est bien lu');
check(g.get('viaArrowCible').calledBy.includes('viaArrowLigne'), 'arrow function sur une ligne : le corps est bien lu');
check(!g.get('$').referencedBy.includes('vraimentMorte') && g.get('$').calledBy.includes('vraimentMorte'), '`${` d\'un template n\'est pas une référence à $');
check(g.get('viaTable').line === 6 && g.get('render').line === 18, 'numéros de ligne du fichier d\'origine (6, 18)');

const MOD = 'tests/fixtures/graphify-modules';
const deadMod = JSON.parse(run(MOD, '--dead', '--json')).dead.map(d => d.name);
check(JSON.stringify(deadMod) === '["morteMaisImportee"]', `modules : importée mais jamais appelée = morte, les autres non (obtenu : ${deadMod.join(', ')})`);
const gm = new Map(JSON.parse(run(MOD, '--json')).nodes.map(n => [n.name, n]));
check(gm.get('utilisee')?.file === `${MOD}/b.js` && gm.get('utilisee')?.line === 1, 'modules : fichier et ligne de la définition (b.js:1)');
check(gm.get('parFleche')?.calledBy.includes('@click:3'), 'modules : arrow function sans accolade après elle, en fin de fichier');

const vivantes = ['renderDashboard', 'renderReleve', 'pollNow', 'endNavDrag', 'setTheme', 'boot', 'releveEstDateCsv', 'actionPpfTotal'];
const app = new Map(JSON.parse(run('js', '--json')).nodes.map(n => [n.name, n]));
const absentes = vivantes.filter(n => !app.has(n));
check(!absentes.length, `js/ : fonctions trouvées${absentes.length ? ` (absentes : ${absentes.join(', ')})` : ''}`);
const deadApp = JSON.parse(run('js', '--dead', '--json')).dead.map(d => d.name);
const faux = vivantes.filter(n => deadApp.includes(n));
check(!faux.length, `js/ : fonctions vivantes absentes de --dead${faux.length ? ` (trouvées : ${faux.join(', ')})` : ''}`);
check(app.get('handleAction')?.calls.includes('actionPpfTotal'), 'js/ : handleAction relié aux fonctions des tables d’actions');

console.log(fails ? `\n${fails} échec(s)` : '\nTout est vert.');
process.exit(fails ? 1 : 0);
