/* Presse-papiers : l'export du marque-page (texte commencant par IMMOVEILLE:) est lu automatiquement quand on revient dans l'application.
   Sans autorisation deja accordee, rien n'est lu : aucun autre contenu du presse-papiers n'est jamais traite. */

import { PREFIXE } from './multi.js';

/* Lecture manuelle (bouton "Coller") : le navigateur peut demander l'autorisation une premiere fois. */
export async function collerTexte() {
  try { return await navigator.clipboard.readText(); } catch { return null; }
}

/* Lecture automatique : seulement si l'autorisation est deja accordee, et seulement pour un export du marque-page. */
export async function exportDisponible() {
  if (!navigator.clipboard || !navigator.clipboard.readText || !navigator.permissions) return null;
  try {
    const st = await navigator.permissions.query({ name: 'clipboard-read' });
    if (st.state !== 'granted') return null;
    const t = await navigator.clipboard.readText();
    return t && t.startsWith(PREFIXE) ? t : null;
  } catch { return null; }
}

/* Appelle rappel(texte) a l'ouverture de l'ecran puis a chaque retour dans l'application, tant que l'element existe. */
export function surRetour(element, rappel) {
  let dernier = '';
  const verifier = async () => {
    if (!element.isConnected) { document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', verifier); return; }
    if (document.visibilityState === 'hidden') return;
    const t = await exportDisponible();
    if (t && t !== dernier) { dernier = t; rappel(t); }
  };
  const onVis = () => { if (document.visibilityState === 'visible') verifier(); };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('focus', verifier);
  verifier();
}
