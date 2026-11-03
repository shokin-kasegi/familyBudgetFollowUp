#!/usr/bin/env node
// Extrait le graphe d'appels des fonctions JS d'un fichier (HTML ou JS).
// Usage : node graphify.mjs <fichier> [--focus nom] [--depth N] [--json] [--dead]
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a)) || 'index.html';
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const focus = opt('--focus');
const depth = Number(opt('--depth') ?? 1);
const asJson = args.includes('--json');

const raw = readFileSync(file, 'utf8');
// Segments de code : { at: position dans le fichier d'origine, code }. Les numéros de
// ligne sont recalculés dans le fichier d'origine (et non dans la concaténation des scripts).
let segs = [{ at: 0, code: raw }];
if (/\.html?$/i.test(file)) {
  segs = [...raw.matchAll(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)<\/script>/gi)]
    .map(m => ({ at: m.index + m[1].length, code: m[2] }));
}
const SEP = '\n;\n';
let src = '', segStarts = [];
for (const g of segs) { if (src) src += SEP; segStarts.push({ joined: src.length, at: g.at }); src += g.code; }
const lineStarts = [0]; for (let i = 0; i < raw.length; i++) if (raw[i] === '\n') lineStarts.push(i + 1);
function lineOf(pos) {
  let seg = segStarts[0]; for (const g of segStarts) if (g.joined <= pos) seg = g; else break;
  const abs = seg.at + (pos - seg.joined);
  let lo = 0, hi = lineStarts.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= abs) lo = mid; else hi = mid - 1; }
  return lo + 1;
}

// Masque chaînes et commentaires (même longueur) pour fiabiliser l'appariement des accolades.
function mask(s) {
  let out = '', i = 0;
  const stack = []; // pour les templates `${ }`
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (c === '/' && n === '/') { const j = s.indexOf('\n', i); const e = j < 0 ? s.length : j; out += ' '.repeat(e - i); i = e; continue; }
    if (c === '/' && n === '*') { const j = s.indexOf('*/', i + 2); const e = j < 0 ? s.length : j + 2; out += s.slice(i, e).replace(/[^\n]/g, ' '); i = e; continue; }
    if (c === '/' && regexCanStart(out)) {
      let j = i + 1, cls = false;
      while (j < s.length && s[j] !== '\n') {
        if (s[j] === '\\') { j += 2; continue; }
        if (s[j] === '[') cls = true; else if (s[j] === ']') cls = false; else if (s[j] === '/' && !cls) break;
        j++;
      }
      if (s[j] === '/') { out += '/' + ' '.repeat(j - i - 1) + '/'; i = j + 1; continue; }
    }
    if (c === '"' || c === "'") {
      let j = i + 1; while (j < s.length && s[j] !== c && s[j] !== '\n') { if (s[j] === '\\') j++; j++; }
      out += c + ' '.repeat(Math.max(0, j - i - 1)) + (s[j] ?? ''); i = j + 1; continue;
    }
    if (c === '`' || (c === '}' && stack.length && stack[stack.length - 1] === 0)) {
      if (c === '}') stack.pop();
      out += c; i++;
      while (i < s.length && s[i] !== '`') {
        if (s[i] === '\\') { out += '  '; i += 2; continue; }
        if (s[i] === '$' && s[i + 1] === '{') { out += '${'; i += 2; stack.push(0); break; }
        out += s[i] === '\n' ? '\n' : ' '; i++;
      }
      if (s[i] === '`') { out += '`'; i++; }
      continue;
    }
    if (stack.length) { if (c === '{') stack[stack.length - 1]++; else if (c === '}') stack[stack.length - 1]--; }
    out += c; i++;
  }
  return out;
}
function regexCanStart(prev) {
  const t = prev.replace(/\s+$/, '');
  if (!t) return true;
  if (/(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|void|yield|await)$/.test(t)) return true;
  return /[(,=:[!&|?{};+\-*%<>~^]$/.test(t);
}
const m = mask(src);

const defRe = /(?:^|[^\w$.])(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(|(?:^|[^\w$.])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^()]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g;
function blockEnd(open) {
  let k = open, lvl = 0;
  for (; k < m.length; k++) { if (m[k] === '{') lvl++; else if (m[k] === '}' && --lvl === 0) break; }
  return k;
}
// Fin d'une expression : `;`, `,` ou saut de ligne au niveau 0, ou parenthèse fermante orpheline.
function exprEnd(i) {
  let lvl = 0;
  for (; i < m.length; i++) {
    const c = m[i];
    if ('([{'.includes(c)) lvl++;
    else if (')]}'.includes(c)) { if (--lvl < 0) return i; }
    else if (lvl === 0 && (c === ';' || c === ',' || (c === '\n' && !/^\s*[.?:&|+\-*/]/.test(m.slice(i + 1, i + 40))))) return i;
  }
  return m.length;
}
const fns = new Map();
for (const d of m.matchAll(defRe)) {
  const name = d[1] || d[2];
  // `function f(a, {b}={})` : le corps commence après la parenthèse fermante des paramètres.
  let from = d.index + d[0].length - 1;
  if (d[1]) { let lvl = 0; for (; from < m.length; from++) { if (m[from] === '(') lvl++; else if (m[from] === ')' && --lvl === 0) break; } }
  const open = m.indexOf('{', from);
  if (open < 0 || fns.has(name)) continue;
  // corps sans accolades (arrow expression `x => expr`) : jusqu'à la fin de l'expression
  const after = d.index + d[0].length;
  const between = m.slice(after, open);
  let end;
  if (/=>\s*$/.test(d[0]) && /\S/.test(between)) end = exprEnd(after);
  else end = blockEnd(open);
  // IIFE nommée `(async function init(){…})()` : appelée sur place par le code global.
  const iife = /^\s*\)\s*\(/.test(m.slice(end + 1, end + 40));
  const lead = /^[^\w$]/.test(d[0]) ? 1 : 0; // caractère consommé avant `function`/`const`
  fns.set(name, { name, line: lineOf(d.index + lead), start: d.index, end, kind: 'function', iife });
}
const names = [...fns.keys()];

// Écouteurs anonymes de premier niveau : `document.addEventListener('click', (e)=>{…})`.
// Ils deviennent des nœuds synthétiques `@click:2584` pour que leurs appels comptent.
const inNamed = pos => names.some(n => { const f = fns.get(n); return f.start < pos && pos < f.end; });
const synth = [];
const lisRe = /[A-Za-z_$][\w$]*\s*\.\s*addEventListener\s*\(\s*(['"`])/g;
for (const l of m.matchAll(lisRe)) {
  if (inNamed(l.index)) continue;
  const q = l.index + l[0].length - 1;          // guillemet ouvrant (conservé par le masquage)
  const close = m.indexOf(l[1], q + 1);
  const evt = src.slice(q + 1, close);           // nom de l'événement, lu dans le source non masqué
  const rest = m.slice(close + 1);
  const fn = /^\s*,\s*(?:async\s*)?(?:function\b|\([^()]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/.exec(m.slice(close + 1));
  if (!fn) continue; // écouteur nommé : `addEventListener('x', handler)` → simple référence
  let k = m.indexOf('(', l.index), lvl = 0;       // fin = parenthèse fermante d'addEventListener
  for (; k < m.length; k++) { if (m[k] === '(') lvl++; else if (m[k] === ')' && --lvl === 0) break; }
  const line = lineOf(l.index);
  synth.push({ name: `@${evt}:${line}`, line, start: l.index, end: k, kind: 'listener' });
}
// Le reste du code de premier niveau (initialisation, `init()`, tables, setInterval…).
const covered = [...fns.values(), ...synth].filter(f => !inNamed(f.start) || f.kind === 'function');
const GLOBAL = '(global)';
const globalNode = { name: GLOBAL, line: 0, start: 0, end: m.length, kind: 'global' };
const nodes = new Map([...fns, ...synth.map(s => [s.name, s]), [GLOBAL, globalNode]]);
const isGlobalPos = pos => !covered.some(f => f.start <= pos && pos <= f.end);

// Occurrences d'un nom de fonction : appel `nom(` ou référence sans parenthèses
// (`onclick = nom`, `setInterval(nom, …)`, `{ dashboard: nom }`, `[nom]`…).
// `.nom` est un accès de propriété, mais `...nom()` (spread) est un vrai appel.
const tokRe = new RegExp(`(?<![\\w$])(?:(?<=\\.\\.\\.)|(?<!\\.))(${names.map(n => n.replace(/\$/g, '\\$')).join('|')})(?![\\w$])`, 'g');
function classify(pos, len) {
  let a = pos + len; while (/\s/.test(m[a])) a++;
  let b = pos - 1; while (b >= 0 && /\s/.test(m[b])) b--;
  const next = m[a], next2 = m.slice(a, a + 2), prev = m[b];
  if (m[pos] === '$' && m[pos + 1] === '{') return null;            // `${` d'un template, pas la fonction `$`
  if (next === '(' || next2 === '?.') return 'call';
  const before = m.slice(Math.max(0, b - 8), b + 1);
  if (/(?:^|[^\w$])(?:function\s*\*?|const|let|var|class)$/.test(before)) return null; // définition
  if (/^\s*async$/.test(before.slice(-6)) && next2 === '=>') return null;
  if (next === ':' && (prev === '{' || prev === ',')) return null; // clé d'objet
  if (next === '=' && m[a + 1] !== '=') return null;                 // affectation ou paramètre `x =>`
  return 'ref';
}
const edges = new Map(), refs = new Map();
for (const n of nodes.keys()) { edges.set(n, new Set()); refs.set(n, new Set()); }
for (const t of m.matchAll(tokRe)) {
  const kind = classify(t.index, t[1].length);
  if (!kind) continue;
  const owners = [...nodes.values()].filter(f => f.kind !== 'global' && f.start <= t.index && t.index <= f.end);
  if (!owners.length && isGlobalPos(t.index)) owners.push(globalNode);
  for (const o of owners) if (o.name !== t[1]) (kind === 'call' ? edges : refs).get(o.name).add(t[1]);
}
for (const f of fns.values()) if (f.iife) edges.get(GLOBAL).add(f.name);
for (const [n, s] of refs) for (const x of edges.get(n)) s.delete(x); // un appel prime sur une référence
const all = [...nodes.keys()];
const callers = new Map(all.map(n => [n, []])), referrers = new Map(all.map(n => [n, []]));
for (const [a, bs] of edges) for (const b of bs) callers.get(b).push(a);
for (const [a, bs] of refs) for (const b of bs) referrers.get(b).push(a);
const sorted = s => [...s].sort();

if (args.includes('--dead')) {
  // Candidats au code mort : ni appelés ni référencés (hors nœuds synthétiques).
  const dead = names.filter(n => !callers.get(n).length && !referrers.get(n).length)
    .map(n => ({ name: n, line: fns.get(n).line }));
  if (asJson) console.log(JSON.stringify({ file, dead }, null, 2));
  else console.log(dead.length ? dead.map(d => `${file}:${d.line}\t${d.name}`).join('\n') : 'Aucun candidat.');
  process.exit(0);
}

let keep = new Set(all);
if (focus) {
  if (!nodes.has(focus)) { console.error(`Fonction inconnue : ${focus}`); process.exit(1); }
  keep = new Set([focus]);
  let frontier = [focus];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const n of frontier) for (const x of [...edges.get(n), ...refs.get(n), ...callers.get(n), ...referrers.get(n)]) if (!keep.has(x)) { keep.add(x); next.push(x); }
    frontier = next;
  }
}

if (asJson) {
  const k = a => sorted(a).filter(x => keep.has(x));
  const out = [...keep].map(n => ({ name: n, line: nodes.get(n).line, kind: nodes.get(n).kind, calls: k(edges.get(n)), refs: k(refs.get(n)), calledBy: k(callers.get(n)), referencedBy: k(referrers.get(n)) }));
  console.log(JSON.stringify({ file, functions: out.length, nodes: out }, null, 2));
} else {
  const id = n => n.replace(/\$/g, '_S_').replace(/[^\w]/g, '_');
  const label = n => nodes.get(n).kind === 'function' ? id(n) : `${id(n)}["${n}"]`;
  const lines = ['flowchart LR'];
  if (focus) lines.push(`  ${id(focus)}:::focus`, '  classDef focus fill:#fde68a,stroke:#b45309');
  for (const a of keep) {
    for (const b of edges.get(a)) if (keep.has(b)) lines.push(`  ${label(a)} --> ${id(b)}`);
    for (const b of refs.get(a)) if (keep.has(b)) lines.push(`  ${label(a)} -.-> ${id(b)}`);
  }
  console.log(lines.join('\n'));
}
