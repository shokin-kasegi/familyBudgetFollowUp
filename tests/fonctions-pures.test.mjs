/* Filet de sécurité des fonctions utilitaires appelées partout dans l'application :
   échappement HTML (esc, attrEsc), arrondi des montants (r2, sumR2), format
   des euros (fmtEUR) et des mois (moisDe, addMonths, monthKey).
   Sans dépendance ni navigateur : js/utils.js est importé tel quel (pas de copie
   qui pourrait diverger). Il ne doit donc toucher ni au DOM ni à l'état.
   Usage : node --test tests/*.test.mjs   (environ 0,2 s) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, attrEsc, r2, sumR2, fmtEUR, moisDe, addMonths, monthKey } from '../js/utils.js';

const NBSP = ' ';

test('esc neutralise les balises et les guillemets', () => {
  assert.equal(esc('<script>'), '&lt;script&gt;');
  assert.equal(esc('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  assert.equal(esc(`L'épicerie & co`), 'L&#39;épicerie &amp; co');
  assert.equal(esc('&lt;'), '&amp;lt;', "l'esperluette est échappée en premier, sans double sens");
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
  assert.equal(esc('Courses'), 'Courses', 'un texte ordinaire est inchangé');
});

test('attrEsc empêche de sortir d’un attribut entre guillemets', () => {
  assert.equal(attrEsc('a"b'), 'a&quot;b');
  assert.equal(attrEsc('" onfocus="alert(1)'), '&quot; onfocus=&quot;alert(1)');
  assert.equal(attrEsc('R&D'), 'R&amp;D');
  assert.equal(attrEsc('&quot;'), '&amp;quot;');
  assert.equal(attrEsc(null), '');
  assert.equal(attrEsc(0), '0');
  assert.ok(!attrEsc('x" y="z').includes('"'), 'aucun guillemet brut ne subsiste');
});

test('r2 arrondit au centime', () => {
  assert.equal(r2(0.1 + 0.2), 0.3);
  assert.equal(r2(12.345), 12.35);
  assert.equal(r2(-12.344), -12.34);
  assert.equal(r2('19.99'), 19.99, 'une chaîne numérique est acceptée');
  assert.equal(r2(undefined), 0);
  assert.equal(r2('abc'), 0, 'une valeur invalide vaut 0, jamais NaN');
});

test('sumR2 additionne des parties arrondies chacune', () => {
  assert.equal(sumR2([0.1, 0.2, 0.3]), 0.6);
  assert.equal(sumR2(Array(10).fill(0.1)), 1);
  assert.equal(sumR2([{m:1.004},{m:1.004},{m:1.004}], x => x.m), 3, 'le total est celui des montants affichés (3 × 1,00)');
  assert.equal(sumR2([]), 0);
  assert.equal(sumR2(null), 0);
  assert.equal(sumR2([10, -2.5]), 7.5);
});

test('fmtEUR suit le format français', () => {
  assert.equal(fmtEUR(-1234.5), `−1${NBSP}234,50${NBSP}€`, 'vrai signe moins, espaces insécables');
  assert.equal(fmtEUR(1234567.891), `1${NBSP}234${NBSP}567,89${NBSP}€`);
  assert.equal(fmtEUR(0), `0,00${NBSP}€`);
  assert.equal(fmtEUR(0.1 + 0.2), `0,30${NBSP}€`);
  assert.equal(fmtEUR(undefined), `0,00${NBSP}€`);
  assert.ok(!fmtEUR(-9999).includes(' '), 'pas d’espace fine insécable (U+202F)');
  assert.ok(!fmtEUR(-5).includes('-'), 'pas de tiret ASCII');
});

test('moisDe et addMonths passent correctement d’une année à l’autre', () => {
  assert.equal(moisDe('2025-12-31'), '2025-12');
  assert.equal(moisDe(''), '');
  assert.equal(moisDe(undefined), '');
  assert.equal(addMonths(moisDe('2025-12-15'), 1), '2026-01');
  assert.equal(addMonths(moisDe('2026-01-01'), -1), '2025-12');
  assert.equal(addMonths('2025-11', 14), '2027-01');
  assert.equal(addMonths('2025-03', -15), '2023-12');
  assert.equal(addMonths('2025-06', 0), '2025-06');
  assert.equal(monthKey(2026, 1), '2026-01');
  // L'ordre des clés de mois doit rester l'ordre alphabétique (boucles k <= fin).
  assert.ok(addMonths('2025-12', 1) > '2025-12');
});
