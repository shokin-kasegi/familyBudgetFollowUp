/* Jeux de données « break-ui » pour toute l'application : même forme que
   tests/fixtures/demo-solde.js (users, store, me), injectés dans le localStorage
   avant le chargement de l'app par tests/break-ui-app.html.
   - worst : le pire cas réaliste, un défaut différent par ligne (libellés de
     relevé bancaire, montants à six chiffres et au centime, catégories longues ou
     vides, commentaires longs, noms non latins, découvert, séries en cours…) ;
   - empty : un compte connecté, aucune donnée ;
   - one   : une seule saisie de chaque sorte, chaque compteur à 1 ;
   - huge  : 1 000 dépenses dans le mois affiché (liste non paginée).
   Les données sont datées autour de novembre 2026 (mois affiché).
   DEV UNIQUEMENT — ne jamais charger ce fichier depuis le site. */
(function(global){
  const ME = 'u-me';
  let n = 0; const id = p => `${p}-${++n}`;
  const U = (uid, displayName, username, role) => ({id:uid, displayName, username, role:role||'membre', salt:'x', passwordHash:'x'});
  const cats = (owner, noms) => noms.map(nom=>({id:id('cat'), ownerId:owner, nom}));
  const vide = () => ({
    selectedMonth:'2026-11', selectedYear:2026, analyseYear:2026, analyseTerm:'', analyseCats:[], analyseCatLabel:'',
    tableFilters:{}, chartFilters:{}, revenusExceptionnels:[], depenses:[], categoriesDepenses:[], categoriesRevenus:[],
    importApprentissage:[], abonnementsAlertes:[], soldesCompte:[],
  });
  const dep = (date, montant, categorie, libelle, extra) => ({id:id('dep'), ownerId:ME, libelle, categorie, montant, modePaiement:'Unique', date, notes:'', ...extra});
  const rev = (date, montant, categorie, libelle, extra) => ({id:id('re'), ownerId:ME, date, libelle, categorie, montant, ...extra});

  /* ---------------- Pire cas ---------------- */
  // Catégories : 9 catégories de dépenses (au-delà des 6 couleurs → « Autres »),
  // la plus longue que le champ accepte (40 caractères, maxlength du champ
  // « Nouvelle catégorie »), une avec esperluette et parenthèses, une non latine.
  const CAT_LONGUE = 'Remboursements santé & mutuelle famille';   // 39 car.
  const CAT_ENERGIE = 'Électricité, gaz & eau (Engie, Veolia)';  // 38 car.
  const worstDeps = [
    // Abonnement : libellé brut de relevé, sans espace exploitable dans la référence.
    dep('2026-10-04', 19.99, 'Téléphone & Internet', 'PRLV SEPA FREE MOBILE FACTURE 202610-0045893214 REF:FM-2026-10-0045893214', {aboId:'abo-1'}),
    dep('2026-11-04', 19.99, 'Téléphone & Internet', 'PRLV SEPA FREE MOBILE FACTURE 202610-0045893214 REF:FM-2026-10-0045893214', {aboId:'abo-1'}),
    dep('2026-12-04', 19.99, 'Téléphone & Internet', 'PRLV SEPA FREE MOBILE FACTURE 202610-0045893214 REF:FM-2026-10-0045893214', {aboId:'abo-1', prevu:true}),
    // Abonnement dont la prévision tombe plus tard dans le mois affiché (à venir).
    dep('2026-10-27', 13.49, 'Loisirs', 'Netflix', {aboId:'abo-2'}),
    dep('2026-11-27', 13.49, 'Loisirs', 'Netflix', {aboId:'abo-2', prevu:true}),
    // Paiement en plusieurs fois : libellé de commerçant à rallonge, total à 4 chiffres.
    ...[1,2,3].map(i=>dep(`2026-${String(8+i).padStart(2,'0')}-15`, 416.33, 'Maison', 'CARTE 15/08/26 BOULANGER CB*4589 PAIEMENT EN 4X SANS FRAIS ONEY', {ppfId:'ppf-1', ppfTotal:1665.32})),
    dep('2026-12-15', 416.33, 'Maison', 'CARTE 15/08/26 BOULANGER CB*4589 PAIEMENT EN 4X SANS FRAIS ONEY', {ppfId:'ppf-1', ppfTotal:1665.32, prevu:true}),
    // Paiement en plusieurs fois en dépassement (mensualités > total).
    dep('2026-09-02', 120, 'Maison', 'Canapé', {ppfId:'ppf-2', ppfTotal:200}),
    dep('2026-10-02', 120, 'Maison', 'Canapé', {ppfId:'ppf-2', ppfTotal:200}),
    // Charges : loyer mensuel, taxe foncière annuelle à 4 chiffres.
    dep('2026-10-05', 1150, 'Logement', 'Loyer', {chgId:'chg-1', chgPeriode:1}),
    dep('2026-11-05', 1150, 'Logement', 'Loyer', {chgId:'chg-1', chgPeriode:1}),
    dep('2026-12-05', 1150, 'Logement', 'Loyer', {chgId:'chg-1', chgPeriode:1, prevu:true}),
    dep('2025-11-15', 2147.00, 'Impôts', 'Taxe foncière', {chgId:'chg-2', chgPeriode:12}),
    dep('2026-11-15', 2147.00, 'Impôts', 'Taxe foncière', {chgId:'chg-2', chgPeriode:12, prevu:true}),
    // Charge trimestrielle à la catégorie la plus longue d'énergie.
    dep('2026-08-20', 312.45, CAT_ENERGIE, 'ENGIE — régularisation annuelle gaz et électricité (compteur Linky n° 09 876 543 210 987)', {chgId:'chg-3', chgPeriode:3}),
    dep('2026-11-20', 312.45, CAT_ENERGIE, 'ENGIE — régularisation annuelle gaz et électricité (compteur Linky n° 09 876 543 210 987)', {chgId:'chg-3', chgPeriode:3, prevu:true}),
    // Dépenses du mois, un défaut par ligne.
    dep('2026-11-02', 24980.00, 'Travaux', 'Réfection complète de la toiture et de la charpente (acompte 2/2)', {notes:'Devis n° 2026-0412 signé le 12/09, solde à régler à la réception des travaux après passage de l’expert de l’assurance habitation pour le sinistre du 3 août.'}),
    dep('2026-11-03', 0.01, 'Frais bancaires', 'Commission d’intervention'),
    dep('2026-11-03', 1.20, 'Alimentation', 'Pain'),
    dep('2026-11-06', 6.80, '', 'Café'),                                   // catégorie vide
    dep('2026-11-07', 87.40, CAT_LONGUE, 'Ostéopathe'),
    dep('2026-11-08', 42.00, 'Cadeaux', '<b>Anniversaire</b> & fête de Jo'), // balises et esperluette saisies telles quelles
    dep('2026-11-09', 39.90, 'Loisirs', 'bartholomew.fitzgerald@northwind-industries-holdings.example.com'),
    dep('2026-11-10', 5.50, 'Alimentation', 'Phở Nguyễn — Tết'),
    dep('2026-11-11', 64.00, 'مطعم', 'مطعم الأندلس'),
    dep('2026-11-12', 15.00, 'Loisirs', '🎬 Cinéma'),
    // Même libellé plusieurs fois : ligne regroupée « 7 dépenses ».
    ...[1,5,8,12,15,19,22].map((j,i)=>dep(`2026-11-${String(j).padStart(2,'0')}`, [212.34,8.99,143.10,56.70,9.99,187.45,33.20][i], 'Alimentation', 'Courses')),
    // Mois précédents : pour la moyenne de comparaison et le graphique annuel.
    ...['01','02','03','04','05','06','07','08','09','10'].map((m,i)=>dep(`2026-${m}-14`, 180+i*13.37, 'Alimentation', 'Courses')),
  ];
  const worstStore = {
    ...vide(),
    revenusExceptionnels:[
      rev('2026-11-01', 3245.67, 'Salaire', 'Salaire'),
      rev('2026-11-14', 23.10, CAT_LONGUE, 'Remboursement Sécurité sociale — consultation Dr Bartholomew-Fitzgerald du 14/10/2026', {notes:'Feuille de soins envoyée le 15/10, la part mutuelle (Harmonie Mutuelle) est attendue sous 15 jours ouvrés.'}),
      rev('2026-11-30', 0.01, 'Intérêts', 'Intérêts livret A'),
      rev('2026-11-20', 150, 'Virements reçus', 'VIR SEPA INST DE M. JEAN-BAPTISTE DE LA ROCHEFOUCAULD-MONTMORENCY MOTIF REMBOURSEMENT VACANCES'),
      // Vente d'un bien en octobre : un mois à six chiffres écrase l'échelle du graphique annuel.
      rev('2026-10-18', 312450.00, 'Vente immobilière', 'Vente appartement Lyon 3e (net vendeur)'),
      ...['01','02','03','04','05','06','07','08','09','10'].map(m=>rev(`2026-${m}-01`, 3245.67, 'Salaire', 'Salaire')),
    ],
    depenses: worstDeps,
    categoriesDepenses: cats(ME, ['Alimentation','Cadeaux','Frais bancaires','Impôts','Logement','Loisirs','Maison','Téléphone & Internet','Travaux', CAT_ENERGIE, CAT_LONGUE, 'مطعم']),
    categoriesRevenus: cats(ME, ['Salaire', CAT_LONGUE, 'Intérêts', 'Virements reçus', 'Vente immobilière', 'Autre']),
    // Solde connu : découvert à fin octobre.
    soldesCompte:[{id:'sc-1', ownerId:ME, date:'2026-10-31', montant:-1234.56, source:'saisie'}],
    abonnementsAlertes:[
      {id:'al-1', ownerId:ME, type:'prix', aboId:'abo-1', libelle:'PRLV SEPA FREE MOBILE FACTURE 202610-0045893214 REF:FM-2026-10-0045893214', ancien:15.99, nouveau:19.99, mois:'2026-10', le:'2026-10-04', vue:false},
      {id:'al-2', ownerId:ME, type:'ppf-retard', libelle:'CARTE 15/08/26 BOULANGER CB*4589 PAIEMENT EN 4X SANS FRAIS ONEY', ancien:416.33, mois:'2026-11', le:'2026-11-01', vue:false},
    ],
  };
  const worstUsers = [
    U(ME, 'Aleksandra Wiśniewska-Kowalczyk', 'aleksandra.wisniewska-kowalczyk', 'admin'),
    U('u-2', 'Jo', 'jo'),
    U('u-3', '😀 Léa', 'lea'),
    U('u-4', 'Jean-Baptiste de La Rochefoucauld-Montmorency III', 'jb.larochefoucauld'),
    U('u-5', 'محمد عبد الرحمن', 'mohamed'),
    U('u-6', 'Nguyễn Thị Ánh Tuyết', 'tuyet'),
  ];

  /* ---------------- Un de chaque ---------------- */
  const oneStore = {
    ...vide(),
    revenusExceptionnels:[rev('2026-11-01', 1, 'Salaire', 'Salaire')],
    depenses:[dep('2026-11-03', 1, 'Alimentation', 'Pain'),
      dep('2026-10-10', 9.99, 'Loisirs', 'Spotify', {aboId:'abo-1'}), dep('2026-11-10', 9.99, 'Loisirs', 'Spotify', {aboId:'abo-1', prevu:true})],
    categoriesDepenses: cats(ME, ['Alimentation','Loisirs']),
    categoriesRevenus: cats(ME, ['Salaire']),
    abonnementsAlertes:[{id:'al-1', ownerId:ME, type:'prix', aboId:'abo-1', libelle:'Spotify', ancien:8.99, nouveau:9.99, mois:'2026-10', le:'2026-10-10', vue:false}],
  };

  /* ---------------- 1 000 dépenses ---------------- */
  const libs = ['Courses','Boulangerie','Essence','Pharmacie','Restaurant','Parking','Tabac presse','Marché','Coiffeur','Librairie'];
  const hugeStore = {
    ...vide(),
    revenusExceptionnels:[rev('2026-11-01', 3245.67, 'Salaire', 'Salaire')],
    depenses: Array.from({length:1000}, (_,i)=>dep(`2026-11-${String(1+i%30).padStart(2,'0')}`, Math.round(((i*7919)%9000+100))/100, ['Alimentation','Transport','Santé','Loisirs'][i%4], `${libs[i%10]} n° ${i+1}`)),
    categoriesDepenses: cats(ME, ['Alimentation','Transport','Santé','Loisirs']),
    categoriesRevenus: cats(ME, ['Salaire']),
  };

  const demoMe = U(ME, 'Saïndou Hamza', 'saindou', 'admin');
  global.SOLDE_BREAK = {
    worst: {users:worstUsers, store:worstStore, me:ME},
    empty: {users:[demoMe], store:vide(), me:ME},
    one:   {users:[U(ME, 'A', 'a', 'admin')], store:oneStore, me:ME},
    huge:  {users:[demoMe], store:hugeStore, me:ME},
  };
})(typeof window!=='undefined' ? window : globalThis);
