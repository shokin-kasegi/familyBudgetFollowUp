/* Synchro GitHub entre deux appareils du MÊME compte (PC + téléphone).
   Usage : node tests/sync-multi-appareils.mjs
   Sert le dépôt en local et remplace l'API GitHub par un faux dépôt en
   mémoire (avec sha et conflits 409), puis vérifie :
   - ajout, modification et suppression faits sur le PC → visibles sur le téléphone ;
   - un onglet PC resté ouvert (pas à jour) qui enregistre n'écrase pas ce que
     le téléphone a envoyé entre-temps ;
   - les saisies du partenaire continuent d'arriver ;
   - un onglet resté ouvert récupère tout seul les changements (sondage) ;
   - un compte supprimé ne réapparaît pas quand un appareil qui en a encore
     une copie se relance, et sa session y est fermée ;
   - quand l'admin change le mot de passe d'un compte, les sessions ouvertes
     de ce compte sont fermées (l'admin, lui, reste connecté) ;
   - un gros budget (plusieurs centaines de Ko, puis plus de 1 Mo, comme après
     des imports de relevés) s'envoie et se relit sans erreur. */
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const server = http.createServer((req,res)=>{
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url,'http://x').pathname));
  if(!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()){ res.writeHead(404); return res.end(); }
  res.writeHead(200, {'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript'});
  fs.createReadStream(p).pipe(res);
});
await new Promise(r=>server.listen(0, r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const fixture = fs.readFileSync(path.join(ROOT,'tests/fixtures/demo-solde.js'),'utf8');
const sandbox = {}; vm.runInNewContext(fixture, sandbox);
const DEMO = JSON.parse(JSON.stringify(sandbox.SOLDE_DEMO));

let failures = 0, passes = 0;
const ok = (cond, msg) => { if(cond){ passes++; console.log('  ✓ '+msg); } else { failures++; console.log('  ✗ '+msg); } };

// Faux dépôt GitHub : un fichier = {sha, text}.
const repo = new Map();
let shaN = 0;
const put = (name, obj)=>repo.set(name, {sha:'s'+(++shaN), text:JSON.stringify(obj)});
put('data.json', DEMO.store);
put('auth.json', {users:DEMO.users, setupCodeUsed:true});
const remoteBudget = ()=>JSON.parse(repo.get('data.json').text);

async function fakeGithub(route){
  const req = route.request();
  const pathname = new URL(req.url()).pathname;
  const name = pathname.split('/contents/')[1];
  const cors = {'access-control-allow-origin':'*', 'access-control-allow-headers':'*', 'access-control-allow-methods':'GET,PUT,OPTIONS'};
  const json = obj=>route.fulfill({status:200, headers:{...cors,'content-type':'application/json'}, body:JSON.stringify(obj)});
  if(req.method()==='OPTIONS') return route.fulfill({status:204, headers:cors});
  if(pathname.includes('/git/blobs/')){
    const sha = pathname.split('/git/blobs/')[1];
    const f = [...repo.values()].find(x=>x.sha===sha);
    return f ? json({sha, content:Buffer.from(f.text).toString('base64'), encoding:'base64'}) : route.fulfill({status:404, headers:cors, body:'{}'});
  }
  if(req.method()==='GET'){
    const f = repo.get(name);
    if(!f) return route.fulfill({status:404, headers:cors, body:'{}'});
    const size = Buffer.byteLength(f.text);
    // Comme la vraie API : au-delà de 1 Mo, le contenu n'est pas renvoyé.
    return json({sha:f.sha, size, encoding: size>1024*1024 ? 'none' : 'base64', content: size>1024*1024 ? '' : Buffer.from(f.text).toString('base64')});
  }
  const body = JSON.parse(req.postData());
  const f = repo.get(name);
  if(f && body.sha!==f.sha) return route.fulfill({status:409, headers:cors, body:'{}'});
  repo.set(name, {sha:'s'+(++shaN), text:Buffer.from(body.content,'base64').toString('utf8')});
  return route.fulfill({status:200, headers:{...cors,'content-type':'application/json'}, body:JSON.stringify({content:{sha:repo.get(name).sha}})});
}

async function device(browser, store, me=DEMO.me){
  const ctx = await browser.newContext({viewport:{width:390, height:844}});
  await ctx.route('https://api.github.com/**', fakeGithub);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e=>errors.push(e.message));
  await page.addInitScript(({users, store, me})=>{
    if(sessionStorage.getItem('seeded')) return;
    localStorage.clear();
    localStorage.setItem('force_reset_version','2');
    localStorage.setItem('budget_auth', JSON.stringify({users, setupCodeUsed:true}));
    localStorage.setItem('budget_store', JSON.stringify(store));
    localStorage.setItem('budget_session_remember', JSON.stringify({userId:me, expiresAt:Date.now()+864e5}));
    localStorage.setItem('github_sync_config', JSON.stringify({token:'test'}));
    sessionStorage.setItem('seeded','1');
  }, {users:DEMO.users, store, me});
  await page.goto(BASE + '/index.html#depenses/2026-09');
  await page.waitForSelector('#view > *', {timeout:10000});
  await page.waitForTimeout(300);
  return {ctx, page, errors};
}
// Modifie le budget comme le ferait l'appli, puis attend la fin de l'envoi.
async function edit(page, fn, arg){
  await page.evaluate(async ({src, arg})=>{ (new Function('state','arg', src))(state, arg); await persist(); }, {src:fn, arg});
  await page.waitForTimeout(2200);
}
const has = (st, id)=>st.depenses.some(d=>d.id===id);
const libelle = (st, id)=>(st.depenses.find(d=>d.id===id)||{}).libelle;
const localBudget = page=>page.evaluate(()=>state);

const browser = await chromium.launch();
try{
  const mineIds = DEMO.store.depenses.filter(d=>d.ownerId===DEMO.me).map(d=>d.id);
  const [editId, delId] = mineIds;
  const tpl = DEMO.store.depenses.find(d=>d.id===editId);

  // Le téléphone a une copie ancienne : il démarre avant les saisies du PC.
  const phone = await device(browser, DEMO.store);
  const pc = await device(browser, DEMO.store);

  console.log('\n— Saisies sur le PC');
  await edit(pc.page, `
    state.depenses.push({...arg.tpl, id:'pc-new', libelle:'Ajout PC'});
    state.depenses.find(d=>d.id===arg.editId).libelle = 'Modifié sur PC';
    state.depenses = state.depenses.filter(d=>d.id!==arg.delId);`, {tpl, editId, delId});
  let r = remoteBudget();
  ok(has(r,'pc-new') && libelle(r,editId)==='Modifié sur PC' && !has(r,delId), 'GitHub a reçu les saisies du PC');

  console.log('\n— Le téléphone revient sur l\'appli');
  await phone.page.reload(); await phone.page.waitForTimeout(800);
  let p = await localBudget(phone.page);
  ok(has(p,'pc-new'), 'ajout du PC visible sur le téléphone');
  ok(libelle(p,editId)==='Modifié sur PC', 'modification du PC visible sur le téléphone');
  ok(!has(p,delId), 'suppression du PC appliquée sur le téléphone');

  console.log('\n— Saisie sur le téléphone, puis sur un onglet PC resté ouvert');
  await edit(phone.page, `state.depenses.push({...arg.tpl, id:'tel-new', libelle:'Ajout téléphone'});`, {tpl});
  ok(has(remoteBudget(),'tel-new'), 'GitHub a reçu la saisie du téléphone');
  await edit(pc.page, `state.depenses.push({...arg.tpl, id:'pc-2', libelle:'Deuxième ajout PC'});`, {tpl});
  r = remoteBudget();
  ok(has(r,'tel-new') && has(r,'pc-2'), 'l\'onglet PC n\'a pas écrasé la saisie du téléphone');
  ok(has(await localBudget(pc.page),'tel-new'), 'le PC affiche aussi la saisie du téléphone');

  console.log('\n— Saisie du partenaire');
  const st = remoteBudget();
  st.depenses.push({...tpl, id:'lina-new', ownerId:DEMO.users[1].id, libelle:'Ajout Lina'});
  put('data.json', st);
  await phone.page.evaluate(()=>{ document.dispatchEvent(new Event('visibilitychange')); });
  await phone.page.waitForTimeout(800);
  p = await localBudget(phone.page);
  ok(has(p,'lina-new') && has(p,'pc-2'), 'au retour sur l\'appli, le téléphone récupère les nouveautés');

  console.log('\n— Onglet PC resté ouvert, sans changer d\'onglet');
  const st2 = remoteBudget();
  st2.depenses.push({...tpl, id:'lina-2', ownerId:DEMO.users[1].id, libelle:'Ajout Lina 2'});
  put('data.json', st2);
  await pc.page.evaluate(()=>pollNow());
  ok(has(await localBudget(pc.page),'lina-2'), 'le sondage périodique récupère aussi le budget');

  console.log('\n— L\'admin change le mot de passe de Lina (PC)');
  const lina = await device(browser, DEMO.store, 'u-lina'); // appareil de Lina, copie locale du compte
  ok(await lina.page.evaluate(()=>currentUser()?.id==='u-lina'), 'Lina est connectée sur son appareil');
  await pc.page.evaluate(async ()=>{ const u = authState.users.find(x=>x.id==='u-lina'); u.salt = randomSalt(); u.passwordHash = await hashPassword('nouveau-mdp', u.salt); await persistAuth(); });
  await pc.page.waitForTimeout(2200);
  ok(await pc.page.evaluate(()=>currentUser()?.id==='u-me'), 'l\'admin reste connecté');
  await lina.page.evaluate(()=>pollNow());
  await lina.page.waitForLoadState('load'); await lina.page.waitForTimeout(1000);
  ok(await lina.page.evaluate(()=>!currentUser() && !!document.getElementById('login-form')), 'sur l\'appareil de Lina, la session est fermée : écran de connexion');
  ok(/mot de passe a été modifié/.test(await lina.page.textContent('#auth-root')), 'Lina voit pourquoi elle doit se reconnecter');
  await lina.page.evaluate(()=>{ document.getElementById('li-username').value='lina'; document.getElementById('li-pass').value='nouveau-mdp'; document.getElementById('login-form').requestSubmit(); });
  await lina.page.waitForSelector('#view > *', {timeout:10000});
  ok(await lina.page.evaluate(()=>currentUser()?.id==='u-lina'), 'Lina se reconnecte avec le nouveau mot de passe');

  console.log('\n— Lina change elle-même son mot de passe : son appareil reste connecté');
  await lina.page.evaluate(async ()=>{ const u = authState.users.find(x=>x.id==='u-lina'); u.salt = randomSalt(); u.passwordHash = await hashPassword('mdp-lina', u.salt); refreshSessionStamp(); await persistAuth(); });
  await lina.page.waitForTimeout(2200);
  await lina.page.evaluate(()=>pollNow()); await lina.page.waitForTimeout(500);
  ok(await lina.page.evaluate(()=>currentUser()?.id==='u-lina'), 'l\'appareil où le mot de passe a été changé reste connecté');

  console.log('\n— Suppression du compte de Lina par l\'admin (PC)');
  await lina.page.evaluate(()=>{ document.dispatchEvent(new Event('visibilitychange')); });
  await pc.page.evaluate(async ()=>{ supprimerCompte('u-lina'); await Promise.all([persistAuth(), persistSocial(), persist()]); });
  await pc.page.waitForTimeout(2200);
  const remoteAuth = ()=>JSON.parse(repo.get('auth.json').text);
  ok(!remoteAuth().users.some(u=>u.id==='u-lina'), 'GitHub n\'a plus le compte de Lina');
  ok(!remoteBudget().depenses.some(d=>d.ownerId==='u-lina'), 'GitHub n\'a plus les données de Lina');

  // Un appareil avec une vieille copie (sans la suppression) envoie ses comptes.
  await phone.page.evaluate(async ()=>{ authState.users.find(u=>u.id==='u-me').displayName += ''; await ghPushAuth(); await ghPushBudget(); });
  ok(!remoteAuth().users.some(u=>u.id==='u-lina'), 'une vieille copie ne fait pas réapparaître le compte');

  await lina.page.reload(); await lina.page.waitForTimeout(1000);
  ok(await lina.page.evaluate(()=>!currentUser() && !authState.users.some(u=>u.id==='u-lina')), 'sur l\'appareil de Lina, la session est fermée et le compte a disparu');
  await lina.page.waitForTimeout(2000);
  ok(!remoteAuth().users.some(u=>u.id==='u-lina') && !remoteBudget().depenses.some(d=>d.ownerId==='u-lina'), 'l\'appareil de Lina n\'a rien renvoyé sur GitHub');
  await phone.page.reload(); await phone.page.waitForTimeout(800);
  ok(await phone.page.evaluate(()=>!authState.users.some(u=>u.id==='u-lina') && !state.depenses.some(d=>d.ownerId==='u-lina')), 'le téléphone de l\'admin ne voit plus Lina');

  console.log('\n— Gros budget (imports de relevés)');
  await edit(phone.page, `for(let i=0;i<1500;i++) state.depenses.push({...arg.tpl, id:'gros-'+i, libelle:'Import relevé n°'+i+' — CB CARREFOUR MARKET'});`, {tpl});
  ok(remoteBudget().depenses.filter(d=>d.id.startsWith('gros-')).length===1500, 'un budget de '+Math.round(repo.get('data.json').text.length/1024)+' Ko part du téléphone vers GitHub');
  await pc.page.reload(); await pc.page.waitForTimeout(1500);
  ok((await localBudget(pc.page)).depenses.filter(d=>d.id.startsWith('gros-')).length===1500, 'le PC le récupère au lancement');
  await edit(pc.page, `for(let i=0;i<4000;i++) state.depenses.push({...arg.tpl, id:'tres-gros-'+i, libelle:'Import relevé n°'+i+' — PRLV SEPA ÉLECTRICITÉ'});`, {tpl});
  const taille = repo.get('data.json').text.length;
  ok(taille>1024*1024 && remoteBudget().depenses.some(d=>d.id==='tres-gros-3999'), 'plus de 1 Mo ('+Math.round(taille/1024)+' Ko) : envoyé par le PC');
  await phone.page.reload(); await phone.page.waitForTimeout(2500);
  p = await localBudget(phone.page);
  ok(p.depenses.some(d=>d.id==='tres-gros-3999') && p.depenses.some(d=>d.id==='gros-1499'), 'et relu par le téléphone (fichier de plus de 1 Mo)');
  await edit(phone.page, `state.depenses.push({...arg.tpl, id:'apres-gros', libelle:'Après le gros import'});`, {tpl});
  ok(has(remoteBudget(),'apres-gros') && remoteBudget().depenses.some(d=>d.id==='tres-gros-3999'), 'le téléphone continue d\'envoyer ensuite, sans rien perdre');
  ok(await phone.page.evaluate(()=>ghLastError===null), 'aucune erreur de synchro signalée');

  ok(lina.errors.length===0 && phone.errors.length===0 && pc.errors.length===0, 'aucune erreur JS ('+[...phone.errors, ...pc.errors, ...lina.errors].join(' | ')+')');
}finally{
  await browser.close(); server.close();
}
console.log(`\n${passes} vérifications OK, ${failures} en échec`);
process.exit(failures ? 1 : 0);
