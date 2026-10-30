/* Tests « Couleur des catégories » — Playwright (Chromium), sans dépendance à installer.
   Usage : node tests/couleur-categories.mjs [--shots dossier]
   - le point d'un poste ouvre le choix de couleur (pastilles, intensité, couleur libre) ;
   - la couleur choisie est enregistrée sur la catégorie et s'affiche ;
   - reprendre une couleur déjà associée réunit les catégories en un seul poste ;
   - « Couleur automatique » rend son poste à la catégorie ;
   - sur mobile, la fenêtre tient dans l'écran ;
   - pas d'erreur console. */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const browser = await chromium.launch();
const ctx = await browser.newContext({viewport:{width:1280, height:900}, reducedMotion:'reduce'});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e=>errors.push('pageerror: '+e.message));
page.on('console', m=>{ if(/Failed to load resource/.test(m.text())) return; if(m.type()==='error' || m.type()==='assert') errors.push(m.type()+': '+m.text()); });
await page.addInitScript(`${fixture};
  if(!sessionStorage.getItem('seeded')){
    localStorage.clear();
    localStorage.setItem('force_reset_version','2');
    localStorage.setItem('budget_auth', JSON.stringify({users:SOLDE_DEMO.users, setupCodeUsed:true}));
    localStorage.setItem('budget_store', JSON.stringify(SOLDE_DEMO.store));
    localStorage.setItem('budget_session_remember', JSON.stringify({userId:SOLDE_DEMO.me, expiresAt:Date.now()+400*864e5}));
    sessionStorage.setItem('seeded','1');
  }`);

await page.clock.setFixedTime(new Date('2026-10-15T10:00:00'));
const aller = async hash => { await page.evaluate(h=>{ location.hash = h; }, hash); await page.waitForTimeout(350); };
const store = () => page.evaluate(()=>JSON.parse(localStorage.getItem('budget_store')));

const shot = async name => { if(SHOTS) await page.screenshot({path:path.join(SHOTS, name+'.png'), fullPage:true}); };
const mesCats = async () => (await store()).categoriesDepenses.filter(c=>c.ownerId==='u-me');
const postes = () => page.$$eval('#view .poste .lbl', els=>els.map(e=>e.innerText.trim()));

try {
  await page.goto(BASE+'/index.html#dashboard/2026-09');
    await page.waitForSelector('#view .poste');

  console.log('— Ouvrir le choix de couleur depuis le point d’un poste');
  const avant = await postes();
  ok(avant.length>=2, `au moins deux postes (${avant.join(' | ')})`);
  const [catA, catB] = avant.filter(l=>l!=='Autres' && !l.includes(' + '));
  await page.click(`#view .poste-color[data-g="${catA}"]`);
  await page.waitForSelector('#cc-swatches .cc-sw');
  ok(await page.$eval('#cc-name', e=>e.textContent)===catA, 'la fenêtre nomme la catégorie');
  ok(await page.$$eval('#cc-swatches .cc-sw', b=>b.length)===12, 'douze couleurs proposées');
  ok(await page.$('#cc-int') !== null && await page.$('#cc-input') !== null, 'intensité et couleur libre présentes');
  await page.click('#cc-swatches .cc-sw[data-cc-hex="#e5484d"]');
  await page.fill('#cc-int', '80'); await page.dispatchEvent('#cc-int', 'input');
  const fonce = await page.$eval('#cc-input', i=>i.value);
  ok(fonce!=='#e5484d' && /^#[0-9a-f]{6}$/.test(fonce), `l’intensité change la teinte (${fonce})`);
  await page.fill('#cc-int', '50'); await page.dispatchEvent('#cc-int', 'input');
  await shot('couleur-choix');
  await page.click('#cc-save');
  await page.waitForTimeout(300);
  ok((await mesCats()).find(c=>c.nom===catA).couleur==='#e5484d', 'couleur enregistrée sur la catégorie');
  ok(await page.$eval(`#view .poste-cell:has(.poste-color[data-g="${catA}"]) .dot`, d=>getComputedStyle(d).backgroundColor)==='rgb(229, 72, 77)', 'le point du poste prend la couleur');

  console.log('\n— Même couleur pour une seconde catégorie : réunies dans le graphique');
  await page.click(`#view .poste-color[data-g="${catB}"]`);
  await page.waitForSelector('#cc-used .cc-used-row');
  ok((await page.$eval('#cc-used', e=>e.innerText)).includes(catA), 'la couleur déjà associée nomme la catégorie');
  ok(await page.$('#cc-swatches .cc-sw.used[data-cc-hex="#e5484d"]') !== null, 'la pastille prise est marquée');
  await page.click('#cc-used .cc-used-row[data-cc-hex="#e5484d"]');
  ok((await page.$eval('#cc-assoc', e=>e.textContent)).includes(catA), 'la fenêtre annonce l’association');
  await shot('couleur-association');
  await page.click('#cc-save');
  await page.waitForTimeout(300);
  const apres = await postes();
  ok(apres.includes(`${catA} + ${catB}`) || apres.includes(`${catB} + ${catA}`), `un seul poste réunit les deux (${apres.join(' | ')})`);
  ok(!apres.includes(catA) && !apres.includes(catB), 'les deux postes séparés ont disparu');
  ok((await page.$eval('#view .legend', e=>e.innerText)).includes(' + '), 'la légende annuelle suit');
  await shot('couleur-graphique');

  console.log('\n— Couleur automatique');
  await page.click(`#view .legend-item[data-g*="${catB}"]`);
  await page.waitForSelector('[data-cc-cat]');
  await page.click(`[data-cc-cat="${catB}"]`);
  await page.click('#cc-auto');
  await page.waitForTimeout(300);
  ok(!(await mesCats()).find(c=>c.nom===catB).couleur, 'la couleur est retirée');
  ok((await postes()).includes(catB), 'la catégorie retrouve son poste');

  console.log('\n— Mobile : pastilles proposées, la fenêtre tient dans l’écran');
  await page.setViewportSize({width:390, height:844});
  await page.waitForTimeout(300);
  await page.click(`#view .poste-color[data-g="${catA}"]`);
  await page.waitForSelector('#cc-swatches .cc-sw');
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth), 'pas de défilement horizontal');
  await page.click('#cc-swatches .cc-sw[data-cc-hex="#2bb3c0"]');
  ok(await page.$$eval('#modal-root .cc-actions .btn', bs=>bs.every(b=>{ const r = b.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth; })), 'les boutons tiennent dans l’écran');
  if(SHOTS) await page.screenshot({path:path.join(SHOTS,'couleur-mobile.png')});
  await page.click('#cc-cancel');

  ok(errors.length===0, `erreurs console\n    ${errors.join('\n    ')}`);
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} vérifications réussies, ${failures} en échec.`);
process.exit(failures ? 1 : 0);
