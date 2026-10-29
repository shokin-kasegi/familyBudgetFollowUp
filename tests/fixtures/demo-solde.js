/* Jeu de données de démonstration (repris du prototype de la refonte) : deux
   comptes liés par un compte joint, une année 2026 complète. Injecté dans le
   localStorage avant le chargement de l'app par tests/refonte-v1.mjs.
   DEV UNIQUEMENT — ne jamais charger ce fichier depuis le site. */
(function(global){
  const ME = 'u-me', LINA = 'u-lina';
  let n = 0; const id = p => `${p}-${++n}`;
  const users = [
    {id:ME, displayName:'Saïndou Hamza', username:'saindou', role:'admin', jointWith:LINA, salt:'x', passwordHash:'x'},
    {id:LINA, displayName:'Lina', username:'lina', role:'membre', jointWith:ME, salt:'x', passwordHash:'x'},
  ];
  const cats = (owner, noms) => noms.map(nom=>({id:id('cat'), ownerId:owner, nom}));
  const achats = [
    ['2026-01-14',204.10,'Alimentation','Courses'],['2026-02-11',188.60,'Alimentation','Courses'],['2026-03-09',226.30,'Alimentation','Courses'],
    ['2026-04-15',197.40,'Alimentation','Courses'],['2026-05-12',213.90,'Alimentation','Courses'],['2026-06-16',231.20,'Alimentation','Courses'],
    ['2026-07-08',198.75,'Alimentation','Courses'],['2026-07-19',52.00,'Sorties','Restaurant'],['2026-07-22',86.00,'Transport','Train'],
    ['2026-08-10',241.30,'Alimentation','Courses'],['2026-08-24',59.80,'Transport','Essence'],
    ['2026-09-07',286.40,'Alimentation','Courses'],['2026-09-13',74.50,'Sorties','Cinéma et restaurant'],['2026-09-18',68.20,'Transport','Essence'],['2026-09-25',45.00,'Cadeaux','Anniversaire'],
  ].map(([date,montant,categorie,libelle])=>({id:id('dep'), ownerId:ME, libelle, categorie, compte:'Compte Perso', montant, modePaiement:'Unique', date, notes:''}));
  const abos = [
    ['Netflix','Loisirs',13.49,'Compte Perso'],['Forfait mobile','Mobile',19.99,'Compte Perso'],
    ['Salle de sport','Sport',34.90,'Compte Perso'],['Spotify Duo','Loisirs',16.99,'Compte Joint'],
  ].map(([libelle,categorie,montant,compte])=>({id:id('abo'), ownerId:ME, libelle, categorie, compte, montant, modePaiement:'Recurrent', frequence:'Mensuel', statut:'Actif', notes:''}));
  const store = {
    selectedMonth:'2026-09', selectedYear:2026, analyseYear:2026, analyseTerm:'', tableFilters:{}, chartFilters:{},
    revenusRecurrents:[
      {id:id('rr'), ownerId:ME, libelle:'Salaire', categorie:'Salaire', montant:3200, dateDebut:'2025-01-01', dateFin:null},
      {id:id('rr'), ownerId:LINA, libelle:'Salaire', categorie:'Salaire', montant:2600, dateDebut:'2025-01-01', dateFin:null},
    ],
    revenusExceptionnels:[
      {id:id('re'), ownerId:ME, date:'2026-09-12', libelle:'Remboursement mutuelle', categorie:'Remboursement', montant:64.20},
    ],
    depenses:[
      ...abos, ...achats,
      {id:'dep-canape', ownerId:ME, libelle:'Canapé', categorie:'Maison', compte:'Compte Perso', montant:1080, modePaiement:'Echelonne', dateDebut:'2026-07-05', nbMensualites:6, moisRetires:[], notes:''},
      {id:id('dep'), ownerId:LINA, libelle:'Courses communes', categorie:'Alimentation', compte:'Compte Joint', montant:212.80, modePaiement:'Unique', date:'2026-09-20', notes:''},
    ],
    objectifs:[
      // Pas de priorité : ancien enregistrement, ne doit jamais afficher « undefined ».
      {id:'obj-vac', ownerId:ME, nom:'Vacances été 2027', categorie:'Voyage', montantCible:2400, dateDebut:'2026-01-01', dateFin:'2027-06-30'},
    ],
    versements:[
      {id:id('v'), ownerId:ME, objectifNom:'Vacances été 2027', date:'2026-03-02', montant:200, note:''},
      {id:id('v'), ownerId:ME, objectifNom:'Vacances été 2027', date:'2026-06-02', montant:200, note:''},
      {id:id('v'), ownerId:ME, objectifNom:'Vacances été 2027', date:'2026-09-02', montant:200, note:''},
    ],
    echVersements:[],
    charges:[
      {id:id('ch'), ownerId:ME, categorie:'Loyer', type:'Fixe', description:'Appartement', budget:1150, compte:'Compte Joint', dateDebut:'2025-09-01', dateFin:null, notes:''},
      {id:id('ch'), ownerId:ME, categorie:'Électricité', type:'Fixe', description:'EDF', budget:78, compte:'Compte Joint', dateDebut:'2025-09-01', dateFin:null, notes:''},
      {id:id('ch'), ownerId:ME, categorie:'Assurance', type:'Fixe', description:'Assurance auto', budget:46.30, compte:'Compte Perso', dateDebut:'2025-09-01', dateFin:null, notes:''},
      {id:id('ch'), ownerId:LINA, categorie:'Internet', type:'Fixe', description:'Box', budget:29.99, compte:'Compte Joint', dateDebut:'2025-09-01', dateFin:null, notes:''},
    ],
    categoriesDepenses:[...cats(ME,['Alimentation','Cadeaux','Loisirs','Maison','Mobile','Sorties','Sport','Transport']), ...cats(LINA,['Alimentation'])],
    categoriesRevenus:[...cats(ME,['Salaire','Remboursement','Autre']), ...cats(LINA,['Salaire'])],
    categoriesObjectifs:cats(ME,['Voyage','Épargne']),
    categoriesCharges:cats(ME,['Loyer','Électricité','Assurance','Internet']),
  };
  global.SOLDE_DEMO = { users, store, me:ME };
})(typeof window!=='undefined' ? window : globalThis);
