/* Bloc "marque-page" partage par les ecrans Analyser et Plusieurs annonces. */

import { esc } from '../util.js';
import { copier, toast } from '../ui.js';
import { codeMarquePage } from '../extract.js';
import { icon } from '../icons.js';

const bm = codeMarquePage();

export function marquePageHTML({ ouvert = true } = {}) {
  return `<details${ouvert ? ' open' : ''}><summary>Remplissage automatique : le marque-page</summary>
    <ol class="steps">
      <li>Sur ordinateur, affichez la barre de favoris et glissez ce bouton dessus : <a class="btn bm" id="bm" href="${esc(bm)}" draggable="true">${icon('copy')}Copier l'annonce</a></li>
      <li>Ouvrez l'annonce (ou une page de résultats, après avoir fait défiler) sur le site, puis cliquez sur le favori.</li>
      <li>Revenez dans cette application : elle lit le contenu copié et remplit tout, sans coller. La première fois, le navigateur demande l'autorisation de lire le presse-papiers : acceptez.</li>
    </ol>
    <div class="actions"><button class="btn ghost" id="bm-copy">${icon('copy')}Copier le code (pour un téléphone)</button></div>
    <p class="note">Sur téléphone, créez un favori quelconque dans votre navigateur, remplacez son adresse par le code copié, nommez-le « Copier l'annonce ». Sur la page de l'annonce, ouvrez ce favori (avec Chrome, taper son nom dans la barre d'adresse peut suffire selon la version). Le marque-page lit uniquement ce que votre navigateur affiche et le copie dans votre presse-papiers : rien n'est envoyé nulle part.</p>
  </details>`;
}

export function brancherMarquePage(root) {
  const lien = root.querySelector('#bm');
  if (lien) lien.addEventListener('click', (e) => { e.preventDefault(); toast('Glissez ce bouton dans la barre de favoris, sans cliquer ici'); });
  const b = root.querySelector('#bm-copy');
  if (b) b.addEventListener('click', () => copier(decodeURIComponent(bm.slice('javascript:'.length))));
}
