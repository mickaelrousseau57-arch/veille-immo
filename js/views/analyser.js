/* Ecran "Analyser" : coller ou saisir une annonce, savoir si c'est une bonne affaire. */

import { esc, toNumber } from '../util.js';
import { carte, champ, choix, segments, brancherSegments, selecteurHTML, brancherSelecteur, lire, toast, recents, basculeAnalyse } from '../ui.js';
import { chercher, communeParInsee } from '../data.js';
import { getCommune, setCommune, annonces } from '../state.js';
import { parseAnnonce } from '../parse.js';
import { evaluer } from '../evaluer.js';
import { resultatAchat, resultatLocation } from './resultat.js';
import { icon } from '../icons.js';

export async function render(root, params = {}) {
  let commune = getCommune();
  if (params.insee) { const c = await communeParInsee(params.insee); if (c) commune = c; }
  let mode = params.mode || 'vente';
  let valeurs = { type: 'Appartement', prix: '', surface: '', pieces: '', dpe: '', terrain: '', url: '', titre: '', portail: '' };
  let derniere = null;

  if (params.text || params.url) {
    // Ouverture depuis le partage d'une annonce (menu Partager du telephone).
    const p = parseAnnonce(`${params.text || ''} ${params.url || ''}`);
    appliquer(p);
  }

  function appliquer(p) {
    if (p.mode) mode = p.mode;
    valeurs = { ...valeurs, type: p.type || valeurs.type, prix: p.prix ?? valeurs.prix, surface: p.surface ?? valeurs.surface, pieces: p.pieces ?? valeurs.pieces, dpe: p.dpe || valeurs.dpe, terrain: p.terrain ?? valeurs.terrain, url: p.url || valeurs.url, portail: p.portail || valeurs.portail, cp: p.cp || valeurs.cp };
  }

  function formulaire() {
    return carte('Analyser une annonce', `
      <p class="lead">Copiez le texte de l'annonce (ou son lien) sur le site, collez-le ici : l'application lit le prix, la surface et le reste. Vous pouvez corriger chaque champ.</p>
      <div class="field"><label for="colle">Texte ou lien de l'annonce</label><div class="inp"><textarea id="colle" rows="4" placeholder="Collez ici le texte de l'annonce..."></textarea></div></div>
      <div class="actions"><button class="btn" id="btn-lire">${icon('scan')}Lire l'annonce</button></div>
      <hr>
      ${segments('seg-mode', [['vente', 'Vente'], ['location', 'Location']], mode)}
      ${selecteurHTML('pick-ann', commune ? commune.nom : '')}
      <div class="grid2">
        ${choix({ id: 'type', label: 'Type de bien', options: [['Appartement', 'Appartement'], ['Maison', 'Maison']], valeur: valeurs.type })}
        ${champ({ id: 'prix', label: mode === 'location' ? 'Loyer charges comprises' : 'Prix demandé', type: 'number', valeur: valeurs.prix, suffixe: mode === 'location' ? '€/mois' : '€' })}
        ${champ({ id: 'surface', label: 'Surface habitable', type: 'number', valeur: valeurs.surface, suffixe: 'm²' })}
        ${champ({ id: 'pieces', label: 'Pièces', type: 'number', valeur: valeurs.pieces })}
        ${choix({ id: 'dpe', label: 'DPE (énergie)', options: [['', 'Inconnu'], ...'ABCDEFG'.split('').map((x) => [x, x])], valeur: valeurs.dpe })}
        ${champ({ id: 'terrain', label: 'Terrain (maison)', type: 'number', valeur: valeurs.terrain, suffixe: 'm²' })}
      </div>
      ${champ({ id: 'titre', label: 'Nom de l\'annonce (facultatif)', valeur: valeurs.titre })}
      ${champ({ id: 'url', label: 'Lien (facultatif)', type: 'url', valeur: valeurs.url })}
      <div class="actions"><button class="btn primary" id="btn-analyser">Analyser</button></div>`);
  }

  function dessiner() {
    root.innerHTML = basculeAnalyse('une') + formulaire() + '<div id="res"></div>';
    brancherSegments(root, 'seg-mode', (v) => { mode = v; relire(); dessiner(); });
    brancherSelecteur(root, 'pick-ann', (c) => { commune = c; setCommune(c); recents.add(c); });
    root.querySelector('#btn-lire').addEventListener('click', lireAnnonce);
    root.querySelector('#btn-analyser').addEventListener('click', analyser);
    if (derniere) afficher(derniere.res, derniere.a);
  }

  function relire() {
    valeurs = { ...valeurs, type: lire(root, 'type') || valeurs.type, prix: lire(root, 'prix'), surface: lire(root, 'surface'), pieces: lire(root, 'pieces'), dpe: lire(root, 'dpe'), terrain: lire(root, 'terrain'), titre: lire(root, 'titre'), url: lire(root, 'url') };
  }

  async function lireAnnonce() {
    const p = parseAnnonce(lire(root, 'colle'));
    if (!p.prix && !p.surface && !p.cp) { toast('Rien de reconnu : saisissez les champs à la main'); return; }
    relire();
    appliquer(p);
    if (p.cp) {
      try {
        const r = await chercher(p.cp, 1);
        if (r[0]) { commune = { ...r[0], cp: p.cp }; setCommune(commune); recents.add(commune); }
      } catch { /* l'utilisateur choisira la commune */ }
    }
    derniere = null;
    dessiner();
    toast(p.prix ? 'Annonce lue : vérifiez les champs' : 'Lecture partielle : complétez les champs');
  }

  async function analyser() {
    relire();
    const prix = toNumber(valeurs.prix), surface = toNumber(valeurs.surface);
    if (!commune) { toast('Choisissez la commune du bien'); return; }
    if (!(prix > 0) || !(surface > 0)) { toast('Indiquez le prix et la surface'); return; }
    const a = { mode, type: valeurs.type, prix, surface, pieces: toNumber(valeurs.pieces), dpe: valeurs.dpe || null, terrain: toNumber(valeurs.terrain), insee: commune.insee, cp: commune.cp || null, communeNom: commune.nom, dep: commune.dep, url: /^https?:\/\//.test(valeurs.url) ? valeurs.url : '', titre: valeurs.titre, portail: valeurs.portail };
    const box = root.querySelector('#res');
    box.innerHTML = '<div class="skeleton" aria-busy="true"><div></div><div></div></div>';
    let res;
    try { res = await evaluer(a, { avecComparables: true }); } catch (e) { box.innerHTML = carte('', `<div class="notice warn"><p>Analyse impossible : ${esc(e.message)}</p></div>`); return; }
    derniere = { res, a };
    afficher(res, a);
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function afficher(res, a) {
    const box = root.querySelector('#res');
    const corps = a.mode === 'location' ? resultatLocation(res, a) : resultatAchat(res, a);
    box.innerHTML = carte(`${esc(a.type)} · ${esc(a.communeNom)}`, `${corps}
      <div class="actions">
        <button class="btn primary" id="btn-suivre">${icon('eye')}Suivre cette annonce</button>
        ${a.mode === 'vente' ? `<a class="btn" href="#credit?prix=${a.prix}&insee=${esc(a.insee)}">${icon('calc')}Simuler le crédit</a>` : ''}
      </div>`);
    box.querySelector('#btn-suivre').addEventListener('click', () => {
      const { insee, mode: md, type, prix, surface, pieces, dpe, terrain, url, titre, portail, communeNom, dep, cp } = a;
      annonces.add({ insee, mode: md, type, prix, surface, pieces, dpe, terrain, url, titre: titre || `${type} ${communeNom}`, portail, communeNom, dep, cp });
      toast('Ajoutée à Ma veille');
    });
  }

  dessiner();
}
