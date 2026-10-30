/* Tests « hors revenu total » — Playwright (Chromium), sans dépendance à installer.
   Usage : node tests/hors-revenu.mjs [--shots dossier]
   - une catégorie de revenus (ex. Remboursement) peut être exclue du revenu total
     depuis l'onglet Revenus ;
   - le revenu affiché, la part du revenu engagée et le repère du graphique annuel
     l'ignorent, le reste à vivre et le solde annuel la comptent toujours ;
   - le réglage se défait, et il est enregistré sur la catégorie ;
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
const num = s => Number(String(s).replace(/[\s  €]/g,'').replace('−','-').replace(',','.'));

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

async function ouvrir(jour, hash){
  await page.clock.setFixedTime(new Date(jour+'T10:00:00'));
  await page.goto(BASE + '/index.html' + hash);
  await page.waitForSelector('#view > *', {timeout:10000});
  await page.waitForTimeout(300);
}
const store = () => page.evaluate(()=>JSON.parse(localStorage.getItem('budget_store')));
await page.addInitScript(()=>{ window.num = s => Number(String(s||'').replace(/[\s\u00a0\u202f€%]/g,'').replace('−','-').replace(',','.')); });
const hero = () => page.evaluate(()=>({
  reste: num(document.querySelector('[data-dash="reste"]')?.innerText),
  revenu: num(document.querySelector('[data-dash="revenu"]')?.innerText),
  pct: Number(document.querySelector('.ratio .pct')?.dataset.v),
  hors: document.querySelector('.hero-hors')?.innerText || '',
}));
const revLine = () => page.$eval('.ychart-host g.col[data-k="2026-09"]', g=>g.getAttribute('aria-label'));
const shot = async name => { if(SHOTS) await page.screenshot({path:path.join(SHOTS, name+'.png'), fullPage:true}); };

try{
  console.log('\n— Avant : tout compte dans le revenu');
  await ouvrir('2026-10-15', '#dashboard/2026-09');
  const avant = await hero();
  ok(Math.abs(avant.revenu - 3264.20) < 0.005, `revenu de septembre = salaire + remboursement (${avant.revenu})`);
  ok(avant.hors==='', 'pas de mention hors revenu');

  console.log('\n— Remboursement exclu du revenu total');
  await ouvrir('2026-10-15', '#revenus/2026-09');
  await page.click('[data-action="toggle-hors-revenu"]:has-text("Remboursement")');
  await page.waitForTimeout(400);
  ok(await page.$eval('[data-action="toggle-hors-revenu"]:has-text("Remboursement")', b=>b.getAttribute('aria-pressed'))==='true', 'la puce Remboursement est enfoncée');
  ok(Math.abs(num(await page.$eval('#rev-l + .big', e=>e.innerText)) - 3200) < 0.005, 'onglet Revenus : total hors remboursement');
  ok(/64,20/.test(await page.$eval('.hero-hors', e=>e.innerText)), 'onglet Revenus : le remboursement est signalé à part');
  ok(await page.$$eval('.rtable .pill', p=>p.filter(x=>/hors revenu/.test(x.innerText)).length)===1, 'la ligne du remboursement porte « hors revenu »');
  ok((await store()).categoriesRevenus.some(c=>c.ownerId==='u-me' && c.nom==='Remboursement' && c.horsRevenu===true), 'réglage enregistré sur la catégorie');
  await shot('revenus-hors');

  await ouvrir('2026-10-15', '#dashboard/2026-09');
  const apres = await hero();
  ok(Math.abs(apres.revenu - 3200) < 0.005, `tableau de bord : revenu hors remboursement (${apres.revenu})`);
  ok(Math.abs(apres.reste - avant.reste) < 0.005, `le reste à vivre ne change pas (${avant.reste} → ${apres.reste})`);
  ok(apres.pct > avant.pct, `la part engagée se calcule sur le revenu hors remboursement (${avant.pct} → ${apres.pct})`);
  ok(/64,20/.test(apres.hors) && /Remboursement/.test(apres.hors), `mention du montant hors revenu (${apres.hors})`);
  ok(/3\s?200,00\s?€ de revenu/.test((await revLine()).replace(/[\u00a0\u202f]/g,' ')), `graphique annuel : repère du revenu hors remboursement (${await revLine()})`);
  await shot('dashboard-hors');

  await ouvrir('2026-10-15', '#annuelle');
  ok(/64,20/.test(await page.$eval('#view', v=>v.innerText)), 'vue annuelle : le montant hors revenu est expliqué');

  console.log('\n— Réglage défait');
  await ouvrir('2026-10-15', '#revenus/2026-09');
  await page.click('[data-action="toggle-hors-revenu"]:has-text("Remboursement")');
  await page.waitForTimeout(400);
  await ouvrir('2026-10-15', '#dashboard/2026-09');
  const retour = await hero();
  ok(Math.abs(retour.revenu - avant.revenu) < 0.005 && retour.hors==='', 'le remboursement revient dans le revenu');

  ok(errors.length===0, `erreurs console\n    ${errors.join('\n    ')}`);
} finally {
  await browser.close();
  server.close();
}
console.log(`\n${passes} vérifications réussies, ${failures} en échec.`);
process.exit(failures ? 1 : 0);
