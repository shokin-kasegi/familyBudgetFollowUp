/* Solde — données d'exemple partagées par les trois propositions.
   Tout est calculé à partir des lignes : les totaux ne sont jamais saisis à part.
   Le foyer, les montants et les libellés sont fictifs (à remplacer par les vraies données de l'app). */
(() => {
  const TODAY = { y: 2026, m: 9, d: 29 };           // « aujourd'hui » figé pour la démo : 29 octobre 2026 (mois 0-indexé)
  const MOIS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
  const MOIS_COURT = ['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];

  const moi = { id:'ines', nom:'Inès', initiale:'I', revenus:[{ libelle:'Salaire', montant:2480, jour:1 }, { libelle:'Prime transport', montant:45, jour:1 }] };
  const partenaire = { id:'karim', nom:'Karim', initiale:'K', revenuTotal:2210 };

  const abonnements = [
    { libelle:'Forfait mobile', montant:15.99, jour:5,  categorie:'Abonnements' },
    { libelle:'Spotify',        montant:10.99, jour:12, categorie:'Abonnements' },
    { libelle:'Netflix',        montant:13.49, jour:18, categorie:'Abonnements' },
    { libelle:'Salle de sport', montant:34.90, jour:31, categorie:'Abonnements' },
  ];
  const charges = [
    { libelle:'Assurance auto', montant:46.20,  jour:10, categorie:'Transport' },
    { libelle:'Crédit auto',    montant:189.00, jour:30, categorie:'Transport', fin:'mars 2028' },
  ];
  const chargesJoint = [
    { libelle:'Loyer',                 montant:1180.00, jour:2 },
    { libelle:'Courses communes',      montant:420.00,  jour:2 },
    { libelle:'Électricité',           montant:78.40,   jour:8 },
    { libelle:'Internet',              montant:29.99,   jour:14 },
    { libelle:'Assurance habitation',  montant:21.40,   jour:20 },
  ];
  const objectifs = [
    { libelle:'Vacances à Lisbonne', cible:1800, depart:140,  versement:150, jour:3, echeance:'juin 2027' },
    { libelle:"Fonds d'urgence",     cible:6000, depart:2100, versement:200, jour:3, echeance:'déc. 2027' },
  ];
  // Achats du quotidien (hors compte joint), par catégorie et par mois, janvier → octobre.
  const ACHATS = {
    'Courses':     [301.20, 287.65, 318.40, 296.10, 309.85, 322.30, 284.70, 263.15, 311.90, 398.60],
    'Restaurants': [ 64.50,  48.00,  92.30,  71.80, 104.60, 126.40, 138.20,  97.50,  83.70, 112.40],
    'Transport':   [ 72.40,  69.90,  75.10,  81.30,  66.20,  70.80,  58.40,  49.90,  77.60,  68.30],
    'Santé':       [ 28.00,  12.50,   0,     46.30,  23.00,   0,     18.90,   0,     35.40,  23.00],
    'Vêtements':   [ 54.90,   0,     39.99,  72.00,  29.90,  64.50,  98.00,   0,     45.00,  89.90],
    'Maison':      [ 38.70,  61.20,  24.90,  89.40,  33.10,  47.60,  29.80,  52.30,  41.20,  54.20],
    'Loisirs':     [ 35.00,  42.90,  28.50,  39.00,  61.70,  74.20,  92.40, 118.60,  33.50,  46.80],
  };
  // Lieux plausibles par catégorie, pour donner un libellé à chaque ticket.
  const LIEUX = {
    'Courses':['Carrefour Market','Biocoop','Marché Saint-Quentin','Lidl','Picard'],
    'Restaurants':['Le Petit Cambodge','Pizzeria Dalla','Boulangerie Moderne','Café des Arts'],
    'Transport':['Navigo','Total Énergies','Uber','SNCF'],
    'Santé':['Pharmacie du Canal','Médecin généraliste'],
    'Vêtements':['Uniqlo','Decathlon','Sézane'],
    'Maison':['Leroy Merlin','IKEA','Monoprix'],
    'Loisirs':['UGC Ciné Cité','Fnac','Librairie Gallimard','Piscine Pontoise'],
  };

  const r2 = (v) => Math.round(v * 100) / 100;
  const sum = (a, f = (x) => x) => r2(a.reduce((s, x) => s + f(x), 0));
  const daysIn = (y, m) => new Date(y, m + 1, 0).getDate();
  // Pseudo-aléatoire déterministe : la même démo à chaque chargement.
  const rng = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // Un montant découpé en tickets datés ; le dernier ticket absorbe l'arrondi, la somme est exacte.
  function tickets(total, cat, y, m, lastDay, seed) {
    if (total <= 0) return [];
    const rnd = rng(seed), n = Math.max(1, Math.min(7, Math.round(total / 45)));
    const w = Array.from({ length: n }, () => 0.5 + rnd()), ws = w.reduce((a, b) => a + b, 0);
    const out = []; let acc = 0;
    w.forEach((x, i) => {
      const montant = i === n - 1 ? r2(total - acc) : r2(total * x / ws); acc = r2(acc + montant);
      const lieux = LIEUX[cat];
      out.push({ libelle: lieux[Math.floor(rnd() * lieux.length)], categorie: cat, montant, jour: 1 + Math.floor(rnd() * lastDay) });
    });
    return out;
  }

  function mois(y, m) {
    const nbJours = daysIn(y, m);
    const passe = y < TODAY.y || (y === TODAY.y && m < TODAY.m);
    const courant = y === TODAY.y && m === TODAY.m;
    const futur = !passe && !courant;
    const jourCourant = courant ? TODAY.d : passe ? nbJours : 0;
    const jourDe = (j) => Math.min(j, nbJours);

    const revenusPerso = moi.revenus.map((r) => ({ ...r, jour: jourDe(r.jour) }));
    const revenu = sum(revenusPerso, (r) => r.montant);
    const totalJoint = sum(chargesJoint, (c) => c.montant);
    const partMoi = revenu / (revenu + partenaire.revenuTotal);
    const virementJoint = r2(totalJoint * partMoi);
    const virementPartenaire = r2(totalJoint - virementJoint);

    // Toutes les sorties du mois, datées : c'est la source de chaque total affiché.
    const sorties = [];
    abonnements.forEach((a) => sorties.push({ ...a, poste: 'abonnements', jour: jourDe(a.jour), fixe: true }));
    charges.forEach((c) => sorties.push({ ...c, poste: 'charges', jour: jourDe(c.jour), fixe: true }));
    sorties.push({ libelle: 'Virement au compte joint', montant: virementJoint, jour: 1, poste: 'joint', categorie: 'Compte joint', fixe: true });
    // Épargne : le versement s'arrête quand l'objectif est atteint.
    const moisDepuisJanv = (y - 2026) * 12 + m;
    const objectifsMois = objectifs.map((o) => {
      const avant = Math.min(o.cible, o.depart + o.versement * moisDepuisJanv);
      const versement = r2(Math.min(o.versement, o.cible - avant));
      const apres = r2(avant + versement);
      if (versement > 0) sorties.push({ libelle: o.libelle, montant: versement, jour: jourDe(o.jour), poste: 'epargne', categorie: 'Épargne', fixe: true });
      return { ...o, epargne: apres, versementMois: versement, part: apres / o.cible, restant: r2(o.cible - apres), atteint: apres >= o.cible };
    });
    const idx = (y - 2026) * 12 + m;
    if (!futur) {
      const lastDay = courant ? TODAY.d : nbJours;
      Object.entries(ACHATS).forEach(([cat, vals], k) => {
        tickets(vals[idx] || 0, cat, y, m, lastDay, 1000 + idx * 97 + k * 13).forEach((t) => sorties.push({ ...t, poste: 'achats', fixe: false }));
      });
    }
    sorties.sort((a, b) => a.jour - b.jour || b.montant - a.montant);

    const par = (p) => sum(sorties.filter((s) => s.poste === p), (s) => s.montant);
    const postes = {
      abonnements: par('abonnements'), charges: par('charges'), achats: par('achats'), joint: par('joint'), epargne: par('epargne'),
    };
    const totalSorties = sum(Object.values(postes));
    const reste = r2(revenu - totalSorties);
    // Déjà débité / encore à venir ce mois-ci (les prélèvements fixes datés après aujourd'hui).
    const aVenir = sorties.filter((s) => s.jour > jourCourant);
    const engage = sum(aVenir, (s) => s.montant);
    const debite = r2(totalSorties - engage);
    const joursRestants = courant ? nbJours - TODAY.d + 1 : futur ? nbJours : 0;

    // Répartition des achats du quotidien par catégorie, triée.
    const repartition = Object.keys(ACHATS).map((cat) => ({ label: cat, value: sum(sorties.filter((s) => s.poste === 'achats' && s.categorie === cat), (s) => s.montant) }))
      .filter((r) => r.value > 0).sort((a, b) => b.value - a.value);
    // Écart des courses à un mois habituel (moyenne des mois précédents de l'année).
    const courses = repartition.find((r) => r.label === 'Courses');
    const prec = ACHATS['Courses'].slice(0, idx).filter((v) => v > 0);
    const habitudeCourses = prec.length ? r2(prec.reduce((a, b) => a + b, 0) / prec.length) : null;
    const ecartCourses = courses && habitudeCourses != null ? r2(courses.value - habitudeCourses) : null;

    // Dépense cumulée jour par jour (pour le rythme du mois).
    const cumul = []; let c = 0;
    for (let j = 1; j <= nbJours; j++) { c = r2(c + sum(sorties.filter((s) => s.jour === j), (s) => s.montant)); cumul.push(c); }

    // Contrôles : les postes plus le reste redonnent le revenu ; le compte joint se partage exactement.
    console.assert(Math.abs(totalSorties + reste - revenu) < 0.005, 'postes + reste ≠ revenu', y, m);
    console.assert(Math.abs(virementJoint + virementPartenaire - totalJoint) < 0.005, 'parts du joint ≠ total', y, m);
    console.assert(Math.abs(debite + engage - totalSorties) < 0.005, 'débité + à venir ≠ sorties', y, m);
    console.assert(Math.abs(cumul[nbJours - 1] - totalSorties) < 0.005, 'cumul ≠ sorties', y, m);

    return {
      y, m, cle: `${y}-${String(m + 1).padStart(2, '0')}`, label: `${MOIS[m]} ${y}`, labelCourt: MOIS_COURT[m], nom: MOIS[m],
      passe, courant, futur, nbJours, jourCourant, joursRestants,
      revenusPerso, revenu, sorties, postes, totalSorties, reste, aVenir, engage, debite,
      parJour: joursRestants ? r2(reste / joursRestants) : null,
      repartition, ecartCourses, habitudeCourses,
      joint: { charges: chargesJoint, total: totalJoint, partMoi, partPartenaire: 1 - partMoi, virementMoi: virementJoint, virementPartenaire },
      objectifs: objectifsMois, cumul,
      nbAbonnements: abonnements.length, nbCharges: charges.length,
    };
  }

  // Les prochaines échéances à partir d'aujourd'hui, sur deux mois.
  function echeances(limite = 6) {
    const cur = mois(TODAY.y, TODAY.m), nxt = mois(TODAY.y, TODAY.m + 1);
    const lignes = [
      ...cur.sorties.filter((s) => s.fixe && s.jour >= TODAY.d).map((s) => ({ ...s, m: cur.m, y: cur.y })),
      ...nxt.sorties.filter((s) => s.fixe).map((s) => ({ ...s, m: nxt.m, y: nxt.y })),
    ].sort((a, b) => (a.y * 12 + a.m) * 40 + a.jour - ((b.y * 12 + b.m) * 40 + b.jour) || b.montant - a.montant);
    return lignes.slice(0, limite).map((l) => ({ ...l, dans: Math.round((new Date(l.y, l.m, l.jour) - new Date(TODAY.y, TODAY.m, TODAY.d)) / 864e5) }));
  }

  // Revenus et sorties de janvier à novembre (novembre : prévisionnel, sans les achats).
  function annee() {
    const ms = Array.from({ length: 11 }, (_, i) => mois(2026, i));
    return { labels: ms.map((x) => x.labelCourt), revenus: ms.map((x) => x.revenu), sorties: ms.map((x) => x.totalSorties), restes: ms.map((x) => x.reste), courant: TODAY.m, prevision: 10 };
  }

  const nfEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const nfEUR0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const nfPct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
  const MINUS = '−';
  const fmt = {
    eur: (v) => (v < 0 ? MINUS : '') + nfEUR.format(Math.abs(v)),
    eur0: (v) => (v < 0 ? MINUS : '') + nfEUR0.format(Math.abs(v)),
    signe: (v) => (v > 0 ? '+' : v < 0 ? MINUS : '') + nfEUR.format(Math.abs(v)),
    pct: (v) => nfPct.format(v),
    // Les euros et les centimes séparés, pour composer un grand montant.
    parts: (v) => { const s = nfEUR.format(Math.abs(v)); const m = s.match(/^(.*?)(,\d\d)(\s*€)$/); return { signe: v < 0 ? MINUS : '', euros: m ? m[1] : s, cents: m ? m[2] : '', devise: m ? m[3].trim() : '' }; },
    jour: (l) => `${l.jour} ${MOIS_COURT[l.m]}`,
    dans: (n) => n === 0 ? "aujourd'hui" : n === 1 ? 'demain' : `dans ${n} jours`,
    plural: (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`,
  };

  // Icônes au trait, 1,5 px, une seule famille.
  const P = {
    dashboard:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    income:'<path d="M12 19V5"/><path d="m6 11 6-6 6 6"/>',
    wallet:'<path d="M4 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1V7Z"/><path d="M4 7V6a2 2 0 0 1 2-2h10"/><circle cx="16" cy="13.5" r="1.2"/>',
    calendar:'<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    target:'<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
    home:'<path d="m4 11 8-7 8 7"/><path d="M6 9.5V20h12V9.5"/>',
    users:'<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18.5 14.5A6.5 6.5 0 0 1 21.5 20"/>',
    chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>',
    bell:'<path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    chevL:'<path d="m15 6-6 6 6 6"/>', chevR:'<path d="m9 6 6 6-6 6"/>', plus:'<path d="M12 5v14M5 12h14"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
    moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
    monitor:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    menu:'<path d="M4 7h16M4 12h16M4 17h16"/>', close:'<path d="M6 6l12 12M18 6 6 18"/>',
    logout:'<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="m10 16-4-4 4-4M6 12h10"/>',
    arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  };
  const icon = (n, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;
  const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);

  const NAV = [
    { id:'dashboard', label:'Tableau de bord', icon:'dashboard' },
    { id:'revenus', label:'Revenus', icon:'income' },
    { id:'depenses', label:'Dépenses', icon:'wallet' },
    { id:'echeances', label:'Échéances', icon:'calendar' },
    { id:'objectifs', label:'Objectifs', icon:'target' },
    { id:'charges', label:'Charges', icon:'home' },
    { id:'compteJoint', label:'Compte joint', icon:'users' },
    { id:'annuelle', label:'Vue annuelle', icon:'chart' },
    { id:'analyse', label:'Analyse', icon:'search' },
  ];

  window.Solde = { TODAY, MOIS, MOIS_COURT, moi, partenaire, mois, echeances, annee, fmt, icon, esc, NAV, r2 };
})();
