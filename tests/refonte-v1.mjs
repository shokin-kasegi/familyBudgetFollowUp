/* Tests de la refonte V1 — Playwright (Chromium), sans dépendance à installer.
   Usage : node tests/refonte-v1.mjs [--shots dossier]
   Sert le dépôt en local, injecte tests/fixtures/demo-solde.js dans le
   localStorage, puis vérifie sur chaque vue et à 1440 / 768 / 390 px :
   - aucune erreur JS ni console.assert en échec ;
   - aucun « undefined », « null » ou « NaN » à l'écran ;
   - totaux = somme des lignes affichées (tableau de bord, Dépenses, Charges,
     Vue annuelle, Compte joint) ;
   - pas de défilement horizontal de la page à 390 px ;
   - critères du système de design (police unique, pas de flou ni de dégradé
     décoratif, un seul bouton plein par écran). */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Playwright est installé globalement (pas de package.json) : require le trouve via NODE_PATH.
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shotsIdx = process.argv.indexOf('--shots');
const SHOTS = shotsIdx > 0 ? path.resolve(process.argv[shotsIdx+1]) : null;
if(SHOTS) fs.mkdirSync(SHOTS, {recursive:true});

const TYPES = {'.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css'};
const server = http.createServer((req,res)=>{
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url,'http://x').pathname));
  if(!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': TYPES[path.extname(p)]||'application/octet-stream'});
  fs.createReadStream(p).pipe(res);
});
await new Promise(r=>server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const fixture = fs.readFileSync(path.join(ROOT,'tests/fixtures/demo-solde.js'),'utf8');

let failures = 0, passes = 0;
const ok = (cond, msg) => { if(cond){ passes++; } else { failures++; console.log('  ✗ '+msg); } };

// Nombre au format fr-FR (« 1 234,56 € », « −12,00 € ») → Number.
const num = s => { const t = String(s).replace(/[\s  €]/g,'').replace('−','-').replace(',','.'); return Number(t); };

async function openApp(browser, {width, height, hash='#dashboard/2026-09', reducedMotion='no-preference', seed=true}){
  const ctx = await browser.newContext({viewport:{width, height}, reducedMotion});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e=>errors.push('pageerror: '+e.message));
  // Les polices Google peuvent être bloquées (hors ligne, bac à sable) : ce n'est pas une erreur de l'app.
  page.on('console', m=>{ if(/Failed to load resource/.test(m.text())) return; if(m.type()==='error' || m.type()==='assert' || /Assertion failed/.test(m.text())) errors.push(m.type()+': '+m.text()); });
  if(seed) await page.addInitScript(`${fixture};
    if(!sessionStorage.getItem('seeded')){
      localStorage.clear();
      localStorage.setItem('force_reset_version','2');
      localStorage.setItem('budget_auth', JSON.stringify({users:SOLDE_DEMO.users, setupCodeUsed:true}));
      localStorage.setItem('budget_store', JSON.stringify(SOLDE_DEMO.store));
      localStorage.setItem('budget_session_remember', JSON.stringify({userId:SOLDE_DEMO.me, expiresAt:Date.now()+864e5}));
      sessionStorage.setItem('seeded','1');
    }`);
  await page.goto(BASE + '/index.html' + hash);
  await page.waitForSelector('#view > *', {timeout:10000}).catch(()=>{});
  await page.waitForTimeout(400);
  return {ctx, page, errors};
}
async function gotoView(page, hash){
  await page.evaluate(h=>{ location.hash = h; }, hash);
  await page.waitForTimeout(450);
}
async function visibleText(page){ return page.evaluate(()=>document.getElementById('view').innerText); }

const VIEWS = ['#dashboard/2026-09','#revenus/2026-09','#depenses/2026-09','#echeances/2026-09','#objectifs/2026-09','#charges/2026-09','#compteJoint/2026-09','#annuelle/2026','#analyse','#parametres'];

const browser = await chromium.launch();
try{
  for(const [w,h] of [[1440,900],[768,1024],[390,844]]){
    console.log(`\n— ${w} px`);
    const {ctx, page, errors} = await openApp(browser, {width:w, height:h});
    for(const v of VIEWS){
      await gotoView(page, v);
      const txt = await visibleText(page);
      ok(!/\bundefined\b|\bNaN\b|\bnull\b/.test(txt), `${v} @${w} : « undefined/null/NaN » affiché`);
      if(w===390){
        const overflow = await page.evaluate(()=>document.documentElement.scrollWidth - document.documentElement.clientWidth);
        ok(overflow<=1, `${v} @390 : la page défile horizontalement (${overflow}px)`);
      }
      const primaries = await page.evaluate(()=>[...document.querySelectorAll('#view .btn-primary')].filter(b=>b.offsetParent && !b.closest('.col-filter-panel')).length);
      ok(primaries<=1, `${v} @${w} : ${primaries} boutons pleins (1 maximum)`);
      if(SHOTS){
        await page.waitForTimeout(900);
        await page.screenshot({path:path.join(SHOTS, `${v.replace(/[#/]/g,'_').replace(/^_/,'')}-${w}.png`), fullPage:true});
      }
    }
    ok(errors.length===0, `@${w} : erreurs console\n    ${errors.join('\n    ')}`);
    await ctx.close();
  }

  console.log('\n— Données (phase 0)');
  {
    const {ctx, page, errors} = await openApp(browser, {width:1440, height:900});
    // Tableau de bord : 5 postes + reste = revenu, sur 12 mois (console.assert).
    for(let m=1;m<=12;m++){ await gotoView(page, `#dashboard/2026-${String(m).padStart(2,'0')}`); }
    await page.waitForTimeout(900);
    ok(errors.length===0, `tableau de bord sur 12 mois : erreurs console\n    ${errors.join('\n    ')}`);
    await gotoView(page, '#dashboard/2026-09');
    await page.waitForTimeout(900);
    const dash = await page.evaluate(()=>({
      reste: document.querySelector('[data-dash="reste"]')?.innerText,
      revenu: document.querySelector('[data-dash="revenu"]')?.innerText,
      postes: [...document.querySelectorAll('.poste .val')].map(e=>e.innerText),
    }));
    const sumPostes = dash.postes.reduce((s,v)=>s+num(v),0);
    ok(dash.postes.length===5, `tableau de bord : 5 postes attendus, ${dash.postes.length} trouvés`);
    ok(Math.abs(sumPostes + num((dash.reste||'').replace(/\n/g,'')) - num(dash.revenu)) < 0.005, `tableau de bord : postes (${sumPostes}) + reste (${dash.reste}) ≠ revenu (${dash.revenu})`);
    ok(/3 264,20 €/.test(dash.revenu), `revenu de septembre : séparateur de milliers visible (« 3 264,20 € ») — reçu « ${dash.revenu} »`);

    // Totaux de tableaux = somme des lignes affichées.
    const checkTables = async (hash, label) => {
      await gotoView(page, hash);
      const res = await page.evaluate(()=>[...document.querySelectorAll('#view table[data-total-col]')].map(t=>{
        const col = Number(t.dataset.totalCol);
        const cell = tr => tr.querySelectorAll('td')[col];
        const rows = [...t.querySelectorAll('tbody tr')].map(cell).filter(Boolean).map(c=>c.dataset.v ?? c.innerText);
        const foot = t.querySelector('tfoot tr') && cell(t.querySelector('tfoot tr'));
        return {name:t.dataset.name||'', rows, total: foot ? (foot.dataset.v ?? foot.innerText) : null};
      }));
      ok(res.length>0, `${label} : aucun tableau totalisé trouvé`);
      res.forEach(r=>{
        const s = r.rows.reduce((a,v)=>a+num(v),0);
        ok(r.total!==null && Math.abs(s - num(r.total)) < 0.005, `${label} ${r.name} : total ${r.total} ≠ somme des lignes ${s.toFixed(2)}`);
      });
    };
    await checkTables('#depenses/2026-09', 'Dépenses');
    await checkTables('#charges/2026-09', 'Charges');
    await checkTables('#annuelle/2026', 'Vue annuelle');
    await checkTables('#compteJoint/2026-09', 'Compte joint');
    await checkTables('#revenus/2026-09', 'Revenus');

    // Échéances : le reste à payer diminue quand une mensualité est échue.
    await gotoView(page, '#echeances/2026-09');
    const resteSep = await page.evaluate(()=>document.querySelector('[data-ech="reste"]')?.innerText);
    await gotoView(page, '#echeances/2026-10');
    const resteOct = await page.evaluate(()=>document.querySelector('[data-ech="reste"]')?.innerText);
    ok(resteSep && num(resteSep)===540, `Échéances septembre : reste à payer 540,00 € attendu, reçu « ${resteSep} »`);
    ok(resteOct && num(resteOct)===360, `Échéances octobre : reste à payer 360,00 € attendu, reçu « ${resteOct} »`);
    await ctx.close();
  }

  console.log('\n— Système de design');
  {
    const html = fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
    const style = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    ok(!/backdrop-filter/.test(html), 'index.html contient encore backdrop-filter');
    ok(!/radial-gradient/.test(html), 'index.html contient encore un radial-gradient');
    // Seules exceptions : les hachures du dépassement (repeating-, un motif qui porte un sens) et les masques de défilement des tableaux.
    const gradients = (html.match(/(?<!repeating-)linear-gradient\([^;]*/g)||[]).filter(g=>!/black/.test(g));
    ok(gradients.length===0, `dégradés décoratifs restants : ${gradients.slice(0,3).join(' | ')}`);
    ok(/family=Instrument\+Sans/.test(html) && !/Space\+Grotesk|family=Inter/.test(html), 'une seule famille chargée (Instrument Sans)');
    ok(!/chart\.umd/.test(html), 'Chart.js ne doit plus être chargé');
    ok(!/\.card\{[^}]*box-shadow/.test(style), 'les cartes au repos ne doivent pas avoir d’ombre');
  }

  console.log('\n— Mouvement');
  {
    // Réduire les animations : tout est affiché tout de suite, valeurs finales.
    const {ctx, page, errors} = await openApp(browser, {width:1440, height:900, reducedMotion:'reduce'});
    const reste = await page.evaluate(()=>document.querySelector('[data-dash="reste"]')?.innerText);
    ok(reste && Math.abs(num(reste.replace(/\n/g,'')) - 1567.27) < 0.005, `réduire les animations : reste affiché immédiatement (1 567,27 € attendu, reçu « ${reste} »)`);
    // Clavier : ← → changent de mois.
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    ok(/#dashboard\/2026-10/.test(page.url()), `→ au clavier : mois suivant attendu, URL ${page.url()}`);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);
    ok(/#dashboard\/2026-09/.test(page.url()), `← au clavier : retour à septembre attendu, URL ${page.url()}`);
    // Clic sur une colonne de l'année : affiche ce mois.
    await page.click('.ychart .col[data-k="2026-03"]');
    await page.waitForTimeout(200);
    ok(/#dashboard\/2026-03/.test(page.url()), `clic sur la colonne mars : URL ${page.url()}`);
    ok(errors.length===0, `mouvement réduit : erreurs console\n    ${errors.join('\n    ')}`);
    await ctx.close();
  }
  {
    // Sans View Transitions : tout fonctionne quand même.
    const ctx = await browser.newContext({viewport:{width:1440,height:900}});
    await ctx.addInitScript(()=>{ delete Document.prototype.startViewTransition; });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e=>errors.push(e.message));
    await page.addInitScript(`${fixture};
      localStorage.setItem('force_reset_version','2');
      localStorage.setItem('budget_auth', JSON.stringify({users:SOLDE_DEMO.users, setupCodeUsed:true}));
      localStorage.setItem('budget_store', JSON.stringify(SOLDE_DEMO.store));
      localStorage.setItem('budget_session_remember', JSON.stringify({userId:SOLDE_DEMO.me, expiresAt:Date.now()+864e5}));`);
    await page.goto(BASE+'/index.html#dashboard/2026-09');
    await page.waitForSelector('.stepper');
    await page.click('[data-stepper][data-dir="1"]');
    await page.waitForTimeout(200);
    await page.click('[data-nav="depenses"]');
    await page.waitForTimeout(200);
    ok(/#depenses\/2026-10/.test(page.url()) && errors.length===0, `sans startViewTransition : navigation KO (${page.url()}) ${errors.join(' ')}`);
    await ctx.close();
  }
  {
    // Écran de connexion (sans session).
    const ctx = await browser.newContext({viewport:{width:390,height:844}});
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e=>errors.push(e.message));
    await page.addInitScript(`${fixture};
      localStorage.setItem('force_reset_version','2');
      localStorage.setItem('budget_auth', JSON.stringify({users:SOLDE_DEMO.users, setupCodeUsed:true}));`);
    await page.goto(BASE+'/index.html');
    await page.waitForSelector('.auth-card');
    ok(await page.$('.auth-card .mark') !== null, 'écran de connexion : logo anneau absent');
    ok(errors.length===0, `écran de connexion : ${errors.join(' ')}`);
    if(SHOTS){ await page.waitForTimeout(900); await page.screenshot({path:path.join(SHOTS,'login-390.png')}); }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} vérifications réussies, ${failures} en échec.`);
process.exit(failures ? 1 : 0);
