/* Tests « solde du compte et échéances à venir » — Playwright (Chromium), sans dépendance à installer.
   Usage : node tests/solde-compte.mjs [--shots dossier]
   - sans solde connu, le reste à vivre ne compte que le mois, et invite à indiquer le solde ;
   - un solde saisi (ou retenu à l'import) sert d'ancre : le mois retombe exactement
     dessus, les autres en découlent par report ;
   - les abonnements, charges et mensualités à venir sont déduits, prolongés sur les
     mois suivants ; une prévision passée non validée ne l'est pas ;
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

// Le jour « courant » est figé.
async function ouvrir(jour, hash){
  await page.clock.setFixedTime(new Date(jour+'T10:00:00'));
  await page.goto(BASE + '/index.html' + hash);
  await page.waitForSelector('#view > *', {timeout:10000});
  await page.waitForTimeout(300);
}
async function aller(hash){ await page.evaluate(h=>{ location.hash = h; }, hash); await page.waitForTimeout(350); }
await page.addInitScript(()=>{ window.num = s => Number(String(s||'').replace(/[\s  €%]/g,'').replace('−','-').replace(',','.')); });
const hero = () => page.evaluate(()=>({
  reste: num(document.querySelector('[data-dash="reste"]')?.innerText),
  solde: document.querySelector('.hero-solde')?.innerText || '',
  notes: [...document.querySelectorAll('.hero-note')].map(x=>x.innerText).join(' | '),
  avenir: !!document.querySelector('.flow .seg[data-k="avenir"]'),
}));
const data = k => page.evaluate(k=>{ const d = dashboardData(k); return {entrees:d.entrees, dep:d.totalDepenses, aVenir:d.aVenir, report:d.report, reste:d.reste, solde:d.solde}; }, k);
const shot = async name => { if(SHOTS) await page.screenshot({path:path.join(SHOTS, name+'.png'), fullPage:true}); };
const proche = (a, b) => Math.abs(a - b) < 0.005;

try{
  console.log('\n— Sans solde du compte connu');
  await ouvrir('2026-10-15', '#dashboard/2026-10');
  {
    const d = await data('2026-10'), h = await hero();
    ok(d.report===null && proche(d.reste, d.entrees - d.dep), `reste à vivre = entrées − dépenses du mois (${JSON.stringify(d)})`);
    ok(proche(h.reste, d.reste), `affiché : ${h.reste}`);
    ok(/Indiquer le solde du compte/.test(h.solde), `invitation à indiquer le solde (« ${h.solde} »)`);
  }

  console.log('\n— Solde du compte saisi');
  await page.click('.hero-solde [data-action="solde-compte"]');
  await page.fill('#f_date', '2026-10-15');
  await page.fill('#f_montant', '');
  await page.click('#modal-form button[type=submit]'); await page.waitForTimeout(200);
  ok(await page.locator('#modal-form').count()===1, 'solde vide refusé');
  await page.fill('#f_montant', '1234.56');
  await page.click('#modal-form button[type=submit]'); await page.waitForTimeout(400);
  {
    const oct = await data('2026-10'), sep = await data('2026-09'), h = await hero();
    const apres = await page.evaluate(()=>mouvementEntre('2026-10-15', '2026-10-31'));
    ok(proche(oct.reste, 1234.56 + apres), `octobre : solde du 15 + opérations d’après (${oct.reste})`);
    ok(proche(h.reste, oct.reste), `affiché : ${h.reste}`);
    ok(proche(oct.report, sep.reste), `report d’octobre = reste à vivre de fin septembre (${oct.report} / ${sep.reste})`);
    ok(proche(sep.reste, sep.report + sep.entrees - sep.dep), 'septembre : report + entrées − dépenses');
    ok(/restant fin septembre/.test(h.solde) || /découvert fin septembre/.test(h.solde), `solde reporté affiché (« ${h.solde} »)`);
    await shot('solde-octobre');
  }
  // Solde corrigé à la date de fin de mois : le mois retombe exactement dessus.
  await page.click('.hero-solde [data-action="solde-compte"]');
  ok(await page.inputValue('#f_date')==='2026-10-15', 'formulaire pré-rempli avec le solde connu');
  await page.fill('#f_date', '2026-10-31'); await page.fill('#f_montant', '2151.35');
  await page.click('#modal-form button[type=submit]'); await page.waitForTimeout(400);
  ok(proche((await hero()).reste, 2151.35), 'octobre : reste à vivre = solde de la banque au 31');
  ok(await page.evaluate(()=>soldeAncre().date)==='2026-10-31', 'le solde le plus récent fait foi');

  console.log('\n— Échéances à venir');
  const resteNov = (await data('2026-11')).reste;
  ok(proche(resteNov, 2151.35 + (await data('2026-11')).solde), 'novembre : part du solde de fin octobre');
  await page.evaluate(()=>{
    const me = currentUser().id;
    // Abonnement validé en octobre (prochain prélèvement le 5 novembre).
    const net = {id:uid(), ownerId:me, libelle:'Netflix', categorie:'Loisirs', montant:13.49, modePaiement:'Unique', date:'2026-10-05'};
    state.depenses.push(net); aboDemarrer(net);
    // Charge trimestrielle validée en octobre (suivante en janvier).
    const ass = {id:uid(), ownerId:me, libelle:'Assurance', categorie:'Logement', montant:90, modePaiement:'Unique', date:'2026-10-20'};
    state.depenses.push(ass); chgDemarrer(ass, 3);
    // Paiement en 3 fois de 300 € : 100 € versés, il en reste deux.
    const tv = {id:uid(), ownerId:me, libelle:'TV', categorie:'Maison', montant:100, modePaiement:'Unique', date:'2026-10-10'};
    state.depenses.push(tv); ppfDemarrer(tv, 300);
    // Prélèvement prévu le 3 octobre, jamais validé : passé, il n'est pas déduit.
    state.depenses.push({id:uid(), ownerId:me, aboId:'vieux', libelle:'Vieux', categorie:'Loisirs', montant:5, modePaiement:'Unique', date:'2026-10-03', prevu:true});
  });
  await page.evaluate(async ()=>{ await persist(); await render(); });
  {
    const oct = await data('2026-10'), nov = await data('2026-11'), dec = await data('2026-12'), jan = await data('2027-01'), fev = await data('2027-02');
    ok(proche(oct.aVenir, 0), `octobre : rien à venir après le 15 (${oct.aVenir})`);
    ok(proche(nov.aVenir, 13.49 + 100 + 5), `novembre : Netflix + mensualité TV + Vieux (${nov.aVenir})`);
    ok(proche(dec.aVenir, 13.49 + 100 + 5), `décembre : prélèvements prolongés, dernière mensualité (${dec.aVenir})`);
    ok(proche(jan.aVenir, 13.49 + 90 + 5), `janvier : TV soldée, assurance trimestrielle (${jan.aVenir})`);
    ok(proche(fev.aVenir, 13.49 + 5), `février : ni TV ni assurance (${fev.aVenir})`);
    ok(proche(nov.report, oct.reste) && proche(dec.report, nov.reste) && proche(jan.report, dec.reste), 'chaque mois part du reste à vivre du précédent');
    ok(proche(nov.reste, nov.report + nov.entrees - nov.dep - nov.aVenir), 'novembre : report + entrées − dépenses − à venir');
  }
  await aller('#dashboard/2026-10');
  {
    const h = await hero();
    ok(/1 abonnement prévu/.test(h.notes) && /compté une fois validé/.test(h.notes), `octobre : la prévision passée n’est pas déduite (« ${h.notes} »)`);
  }
  await aller('#dashboard/2026-12');
  {
    const h = await hero(), d = await data('2026-12');
    ok(proche(h.reste, d.reste), `décembre affiché : ${h.reste}`);
    ok(/2 abonnements prévus/.test(h.notes) && /déduits du reste à vivre/.test(h.notes) && /1 mensualité prévue/.test(h.notes), `décembre : échéances signalées (« ${h.notes} »)`);
    ok(h.avenir, 'barre : segment « à venir »');
    await shot('solde-decembre');
  }

  console.log('\n— Synchro : le solde du compte voyage avec le budget');
  ok(await page.evaluate(()=>OWNED_ARRAYS.includes('soldesCompte') && JSON.parse(localStorage.getItem('budget_store')).soldesCompte.length===2), 'soldes enregistrés et synchronisés');

  ok(errors.length===0, `erreurs console : ${errors.join(' | ')}`);
} catch(e){
  failures++; console.log('  ✗ exception : '+e.stack);
} finally {
  await browser.close(); server.close();
}
console.log(`\n${passes} vérifications réussies, ${failures} en échec.`);
process.exit(failures ? 1 : 0);
