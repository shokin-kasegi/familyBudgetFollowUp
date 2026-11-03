/* Gabarits HTML communs (en-tête de page). */

/* ============================== GABARITS COMMUNS ============================== */
// Rangée de titre identique dans toutes les vues : titre + phrase calculée à
// gauche ; sélecteur (mois ou année) puis un seul bouton plein à droite.
export function pageHeadHTML({title, finding, stepper, action, color, findingKey}){
  return `
    <div class="page-head">
      <div class="page-head-text">
        <h1 class="page-title">${color?`<span class="dot" style="background:${color}" aria-hidden="true"></span>`:''}${title}</h1>
        ${finding ? `<p class="finding${findingKey?' swap':''}"${findingKey?` data-swap="${findingKey}"`:''}>${finding}</p>` : ''}
      </div>
      ${(stepper||action) ? `<div class="page-tools">${stepper||''}${action||''}</div>` : ''}
    </div>`;
}
