export function utilisee(x){ return x + 1; }
// Importée par a.js mais jamais appelée : morte malgré l'import.
export function morteMaisImportee(){ return 0; }
export { utilisee as alias };
