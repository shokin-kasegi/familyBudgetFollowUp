#!/usr/bin/env node
// Extrait le graphe d'appels des fonctions JS d'un fichier (HTML ou JS).
// Usage : node graphify.mjs <fichier> [--focus nom] [--depth N] [--json]
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--') && !/^\d+$/.test(a)) || 'index.html';
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const focus = opt('--focus');
const depth = Number(opt('--depth') ?? 1);
const asJson = args.includes('--json');

let src = readFileSync(file, 'utf8');
if (/\.html?$/i.test(file)) {
  const blocks = [...src.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
  src = blocks.join('\n;\n');
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
const fns = new Map();
for (const d of m.matchAll(defRe)) {
  const name = d[1] || d[2];
  const open = m.indexOf('{', d.index + d[0].length - 1);
  if (open < 0 || fns.has(name)) continue;
  // corps sans accolades (arrow expression) : jusqu'à la fin de ligne
  const between = m.slice(d.index + d[0].length, open);
  let end;
  if (/=>\s*$/.test(d[0]) && /\S/.test(between.replace(/^[^)]*\)?/, ''))) {
    end = m.indexOf('\n', d.index); if (end < 0) end = m.length;
  } else {
    let k = open, lvl = 0;
    for (; k < m.length; k++) { if (m[k] === '{') lvl++; else if (m[k] === '}' && --lvl === 0) break; }
    end = k;
  }
  const line = src.slice(0, d.index).split('\n').length;
  fns.set(name, { name, line, start: d.index, end });
}

const names = [...fns.keys()];
const callRe = new RegExp(`(?<![\\w$.])(${names.map(n => n.replace(/\$/g, '\\$')).join('|')})\\s*\\(`, 'g');
const edges = new Map();
for (const f of fns.values()) {
  const body = m.slice(f.start, f.end);
  const callees = new Set();
  for (const c of body.matchAll(callRe)) if (c[1] !== f.name) callees.add(c[1]);
  // exclut les fonctions imbriquées appelées uniquement dans leur propre définition
  edges.set(f.name, [...callees].sort());
}
// Tables d'actions (`const actionsXxx = { 'nom': fonction, … }`) : handleAction appelle
// leurs fonctions par référence, ce que callRe ne voit pas. On ajoute ces arêtes.
if (edges.has('handleAction')) {
  const viaTables = new Set(edges.get('handleAction'));
  for (const t of m.matchAll(/(?:const|let|var)\s+actions\w*\s*=\s*\{([^{}]*)\}/g))
    for (const r of t[1].matchAll(/:\s*([A-Za-z_$][\w$]*)/g)) if (fns.has(r[1])) viaTables.add(r[1]);
  edges.set('handleAction', [...viaTables].sort());
}
const callers = new Map(names.map(n => [n, []]));
for (const [a, bs] of edges) for (const b of bs) callers.get(b).push(a);

let keep = new Set(names);
if (focus) {
  if (!fns.has(focus)) { console.error(`Fonction inconnue : ${focus}`); process.exit(1); }
  keep = new Set([focus]);
  let frontier = [focus];
  for (let d = 0; d < depth; d++) {
    const next = [];
    for (const n of frontier) for (const x of [...edges.get(n), ...callers.get(n)]) if (!keep.has(x)) { keep.add(x); next.push(x); }
    frontier = next;
  }
}

if (asJson) {
  const out = [...keep].map(n => ({ name: n, line: fns.get(n).line, calls: edges.get(n).filter(x => keep.has(x)), calledBy: callers.get(n).filter(x => keep.has(x)) }));
  console.log(JSON.stringify({ file, functions: out.length, nodes: out }, null, 2));
} else {
  const id = n => n.replace(/\$/g, '_S_');
  const lines = ['flowchart LR'];
  if (focus) lines.push(`  ${id(focus)}:::focus`, '  classDef focus fill:#fde68a,stroke:#b45309');
  for (const a of keep) for (const b of edges.get(a)) if (keep.has(b)) lines.push(`  ${id(a)} --> ${id(b)}`);
  console.log(lines.join('\n'));
}
