// Génère prototype/moderne.html à partir de index.html + prototype/moderne.css.
// Usage : node prototype/build-moderne.mjs
// L'application reste la même (données, logique, comptes) : seuls le thème,
// quelques couleurs de données et une barre d'onglets mobile changent.
// Chaque remplacement doit trouver sa cible, sinon le script échoue — signe
// que index.html a changé et que le prototype doit être mis à jour.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
let html = readFileSync(join(here, '..', 'index.html'), 'utf8');
const css = readFileSync(join(here, 'moderne.css'), 'utf8');

function patch(from, to, { all = false } = {}){
  const count = html.split(from).length - 1;
  if(count === 0) throw new Error(`Cible introuvable dans index.html : ${from.slice(0, 80)}`);
  html = all ? html.split(from).join(to) : html.replace(from, to);
}

// En-tête : titre, couleur de thème, police Geist.
patch('<title>Solde — Gestion budgétaire</title>', '<title>Solde Moderne — prototype</title>');
patch('<meta name="theme-color" content="#000000">', '<meta name="theme-color" content="#09090B">');
patch('family=Space+Grotesk:wght@400;500;600;700&', 'family=Geist:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&');

// Thème : la feuille du prototype passe après celle de l'app.
patch('</style>\n</head>', `</style>\n<style id="theme-moderne">\n${css}</style>\n</head>`);

// Couleurs de données du tableau de bord : palette catégorielle au lieu des gris.
patch("color:'#E6E6E6'", "color:'var(--cat-1)'");
patch("color:'#ABABAB'", "color:'var(--cat-2)'");
patch("color:'#737373'", "color:'var(--cat-3)'");
patch("color:'#4A4A4A'", "color:'var(--cat-4)'");
patch('#D9D9D9', 'var(--cat-1)', { all: true });
patch('#6B6B6B', 'var(--cat-2)', { all: true });
patch("i===0?'var(--text)':'#5C5C5C'", "i===0?'var(--accent)':'#52525B'");

// Graphiques (Chart.js ne lit pas les variables CSS : valeurs en dur).
patch("borderColor:'#8A8A8A', backgroundColor:'#8A8A8A'", "borderColor:'#4CC2FF', backgroundColor:'#4CC2FF'");
patch("label:'Dépenses', data:months.map(m=>m.totalDepenses), borderColor:'#FFFFFF', backgroundColor:'#FFFFFF'", "label:'Dépenses', data:months.map(m=>m.totalDepenses), borderColor:'#8B7CF6', backgroundColor:'#8B7CF6'");
patch("backgroundColor:'rgba(191,233,210,0.65)'", "backgroundColor:'rgba(61,220,151,0.75)'");
patch("backgroundColor:'rgba(239,182,172,0.65)'", "backgroundColor:'rgba(255,107,129,0.75)'");
patch("label:'Solde', data:months.map(m=>m.solde), borderColor:'#FFFFFF', borderWidth:2.5, pointRadius:3, pointBackgroundColor:'#FFFFFF'", "label:'Solde', data:months.map(m=>m.solde), borderColor:'#A99BFF', borderWidth:2.5, pointRadius:3, pointBackgroundColor:'#A99BFF'");
patch("font:{family:'Inter', size:12}", "font:{family:'Geist', size:12}", { all: true });

// Barre d'onglets mobile (4 premières vues de l'ordre choisi + « Plus »)
// et pastille « Prototype » renvoyant vers la version actuelle.
patch('<div id="modal-root"></div>', `<nav class="tabbar" id="tabbar" aria-label="Navigation principale"></nav>
<a class="proto-ribbon" href="../index.html">Prototype · revenir à la version actuelle</a>

<div id="modal-root"></div>`);
patch('</script>\n</body>', `
/* ============================== PROTOTYPE MODERNE ============================== */
function renderTabbar(){
  const bar = document.getElementById('tabbar');
  if(!bar) return;
  const items = orderedNavItems().slice(0, 4);
  bar.innerHTML = items.map(n=>\`<button class="\${currentView===n.id?'active':''}" data-nav="\${n.id}" \${currentView===n.id?'aria-current="page"':''}>\${icon(n.icon)}<span>\${n.id==='dashboard'?'Accueil':n.label}</span></button>\`).join('')
    + \`<button class="\${items.some(n=>n.id===currentView)?'':'active'}" id="tabbar-more" aria-label="Plus de vues">\${icon('more')}<span>Plus</span></button>\`;
  document.getElementById('tabbar-more').onclick = ()=>document.getElementById('burger').click();
}
const renderSidebarApp = renderSidebar;
renderSidebar = function(){ renderSidebarApp(); renderTabbar(); };
</script>
</body>`);

writeFileSync(join(here, 'moderne.html'), html);
console.log('prototype/moderne.html généré');
