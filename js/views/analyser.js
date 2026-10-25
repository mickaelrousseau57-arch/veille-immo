/* Ecran "Analyser" : coller ou saisir une annonce, savoir si c'est une bonne affaire. */

import { esc, toNumber } from '../util.js';
import { carte, champ, choix, segments, brancherSegments, selecteurHTML, brancherSelecteur, lire, toast, recents, basculeAnalyse, veilleSelectHTML, brancherVeilleSelect } from '../ui.js';
import { chercher, communeParInsee } from '../data.js';
import { getCommune, setCommune, annonces, veilles } from '../state.js';
import { parseAnnonce } from '../parse.js';
import { EQUIPEMENTS, ETATS, champsDe } from '../caracteristiques.js';
import { lireCollage, PREFIXE, titreDe, titreAuto } from '../multi.js';
import { collerTexte, surRetour } from '../presse.js';
import { marquePageHTML, brancherMarquePage } from './marquepage.js';
import { evaluer } from '../evaluer.js';
import { resultatAchat, resultatLocation } from './resultat.js';
import { icon } from '../icons.js';

export async function render(root, params = {}) {
  let commune = getCommune();
  if (params.insee) { const c = await communeParInsee(params.insee); if (c) commune = c; }
  let mode = params.mode || 'vente';
  let valeurs = { type: 'Appartement', prix: '', surface: '', pieces: '', dpe: '', terrain: '', url: '', titre: '', portail: '', chambres: '', sdb: '', annee: '', etage: '', etat: '', extras: [] };
  let derniere = null;
  let veilleCible = veilles.pourAjout();

  let partage = null;
  if (params.text || params.url) {
    // Ouverture depuis le partage d'une annonce (menu Partager du telephone).
    const p = parseAnnonce(`${params.text || ''}\n${params.url || ''}`);
    appliquer(p);
    partage = { p, texte: params.text || '', url: params.url || '' };
  }

  function appliquer(p) {
    if (p.mode) mode = p.mode;
    valeurs = { ...valeurs, type: p.type || valeurs.type, prix: p.prix ?? valeurs.prix, surface: p.surface ?? valeurs.surface, pieces: p.pieces ?? valeurs.pieces, dpe: p.dpe || valeurs.dpe, terrain: p.terrain ?? valeurs.terrain, url: p.url || valeurs.url, portail: p.portail || valeurs.portail, cp: p.cp || valeurs.cp, chambres: p.chambres ?? valeurs.chambres, sdb: p.sdb ?? valeurs.sdb, annee: p.annee ?? valeurs.annee, etage: p.etage ?? valeurs.etage, etat: p.etat || valeurs.etat, extras: p.extras && p.extras.length ? p.extras : valeurs.extras };
  }

  function formulaire() {
    return carte('Analyser une annonce', `
      <p class="lead">Copiez le texte de l'annonce (ou son lien) sur le site, collez-le ici : l'application lit le prix, la surface et le reste. Vous pouvez corriger chaque champ.</p>
      <div class="field"><label for="colle">Texte ou lien de l'annonce</label><div class="inp"><textarea id="colle" rows="4" placeholder="Collez ici le texte de l'annonce..."></textarea></div></div>
      <div class="actions"><button class="btn" id="btn-coller-un">${icon('copy')}Coller</button><button class="btn" id="btn-lire">${icon('scan')}Lire l'annonce</button></div>
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
      <details${valeurs.chambres || valeurs.annee || valeurs.etat || valeurs.extras.length ? ' open' : ''}><summary>Plus de critères (chambres, année, jardin, piscine...)</summary>
        <div class="grid2">
          ${champ({ id: 'chambres', label: 'Chambres', type: 'number', valeur: valeurs.chambres })}
          ${champ({ id: 'sdb', label: 'Salles de bain', type: 'number', valeur: valeurs.sdb })}
          ${champ({ id: 'annee', label: 'Année de construction', type: 'number', valeur: valeurs.annee })}
          ${champ({ id: 'etage', label: 'Étage', type: 'number', valeur: valeurs.etage })}
          ${choix({ id: 'etat', label: 'État', options: [['', 'Inconnu'], ...ETATS], valeur: valeurs.etat })}
        </div>
        <div class="chips" id="an-equip">${EQUIPEMENTS.map(([k, n]) => `<button type="button" class="chip${valeurs.extras.includes(k) ? ' on' : ''}" data-v="${k}" aria-pressed="${valeurs.extras.includes(k)}">${esc(n)}</button>`).join('')}</div>
      </details>
      ${champ({ id: 'titre', label: 'Nom de l\'annonce (facultatif)', valeur: valeurs.titre })}
      ${champ({ id: 'url', label: 'Lien (facultatif)', type: 'url', valeur: valeurs.url })}
      <div class="actions"><button class="btn primary" id="btn-analyser">Analyser</button></div>`);
  }

  function dessiner() {
    root.innerHTML = basculeAnalyse('une') + bilanPartage() + '<div class="cols"><div>' + formulaire() + '</div><div class="side libre"><div id="res"></div>' + carte('Remplir automatiquement', marquePageHTML({ ouvert: !!(partage && !(partage.p.prix && partage.p.surface)) })) + '</div></div>';
    brancherMarquePage(root);
    root.querySelector('#btn-coller-un').addEventListener('click', async () => {
      const t = await collerTexte();
      if (t == null) { toast('Collez à la main dans la zone de texte'); return; }
      root.querySelector('#colle').value = t;
      if (t) lireAnnonce();
    });
    brancherSegments(root, 'seg-mode', (v) => { mode = v; relire(); dessiner(); });
    brancherSelecteur(root, 'pick-ann', (c) => { commune = c; setCommune(c); recents.add(c); });
    root.querySelector('#an-equip').addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (c) { c.classList.toggle('on'); c.setAttribute('aria-pressed', String(c.classList.contains('on'))); }
    });
    root.querySelector('#btn-lire').addEventListener('click', lireAnnonce);
    root.querySelector('#btn-analyser').addEventListener('click', analyser);
    if (derniere) afficher(derniere.res, derniere.a);
  }

  /* Ce que le telephone a transmis lors d'un partage, et pourquoi le reste manque. */
  function bilanPartage() {
    if (!partage) return '';
    const p = partage.p;
    const lus = [p.type && p.type.toLowerCase(), p.pieces && `${p.pieces} pièce(s)`, p.cp && `code postal ${p.cp}`, p.prix && `prix ${p.prix} €`, p.surface && `${p.surface} m²`].filter(Boolean);
    const complet = p.prix && p.surface;
    return carte('Annonce reçue par le partage', `
      <p class="muted" style="margin:0">Lien : ${esc(partage.url || 'aucun')}<br>Texte transmis : ${esc(partage.texte.replace(/\s+/g, ' ').trim().slice(0, 160) || 'aucun')}</p>
      <p class="line">Lu automatiquement : ${esc(lus.join(', ') || 'rien')}.</p>
      ${complet ? '' : `<div class="notice warn"><p>Le prix et la surface ne figurent pas dans ce qui a été transmis : seul le lien (et parfois le titre) est partagé. L'application ne peut pas ouvrir la page de l'annonce à votre place : le site l'interdit et le navigateur le bloque. Pour remplir le reste automatiquement, utilisez le marque-page ci-dessous. Sinon, copiez le texte de l'annonce et touchez « Coller ».</p></div>`}`);
  }

  function relire() {
    valeurs = { ...valeurs, type: lire(root, 'type') || valeurs.type, prix: lire(root, 'prix'), surface: lire(root, 'surface'), pieces: lire(root, 'pieces'), dpe: lire(root, 'dpe'), terrain: lire(root, 'terrain'), titre: lire(root, 'titre'), url: lire(root, 'url'), chambres: lire(root, 'chambres'), sdb: lire(root, 'sdb'), annee: lire(root, 'annee'), etage: lire(root, 'etage'), etat: lire(root, 'etat'), extras: Array.from(root.querySelectorAll('#an-equip .chip.on')).map((c) => c.dataset.v) };
  }

  async function lireAnnonce() {
    let brut = lire(root, 'colle').trim();
    if (brut.startsWith(PREFIXE)) {
      let r;
      try { r = lireCollage(brut, mode); } catch (e) { toast(e.message); return; }
      if (r.items.length > 1) {
        // Une page de resultats : l'ecran "Plusieurs annonces" les traite toutes.
        sessionStorage.setItem('immo-import', brut);
        location.hash = '#importer';
        return;
      }
      if (!r.items.length) { toast('Aucune annonce dans le contenu collé'); return; }
      brut = `${r.items[0].text}\n${r.items[0].url || ''}`;
    }
    const p = parseAnnonce(brut);
    if (!p.prix && !p.surface && !p.cp) { toast('Rien de reconnu : saisissez les champs à la main'); return; }
    relire();
    appliquer(p);
    const tt = titreDe(brut);
    if (tt && !valeurs.titre) valeurs.titre = tt;
    if (p.cp) {
      try {
        const r = await chercher(p.cp, 1);
        if (r[0]) { commune = { ...r[0], cp: p.cp }; setCommune(commune); recents.add(commune); }
      } catch { /* l'utilisateur choisira la commune */ }
    }
    derniere = null;
    dessiner();
    if (p.prix && p.surface && commune) { toast('Annonce lue et analysée : vérifiez les champs'); analyser(); }
    else toast(p.prix ? 'Annonce lue : complétez les champs manquants' : 'Lecture partielle : complétez les champs');
  }

  async function analyser() {
    relire();
    const prix = toNumber(valeurs.prix), surface = toNumber(valeurs.surface);
    if (!commune) { toast('Choisissez la commune du bien'); return; }
    if (!(prix > 0) || !(surface > 0)) { toast('Indiquez le prix et la surface'); return; }
    const a = { mode, type: valeurs.type, prix, surface, pieces: toNumber(valeurs.pieces), dpe: valeurs.dpe || null, terrain: toNumber(valeurs.terrain), insee: commune.insee, cp: commune.cp || null, communeNom: commune.nom, dep: commune.dep, url: /^https?:\/\//.test(valeurs.url) ? valeurs.url : '', titre: valeurs.titre, portail: valeurs.portail, chambres: toNumber(valeurs.chambres), sdb: toNumber(valeurs.sdb), annee: toNumber(valeurs.annee), etage: toNumber(valeurs.etage), etat: valeurs.etat || null, extras: valeurs.extras };
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
    box.innerHTML = carte(`${esc(a.type)} à ${esc(a.communeNom)}`, `${corps}
      ${veilleSelectHTML('an-veille', veilleCible, { label: 'Ajouter dans la veille' })}
      <div class="actions">
        <button class="btn primary" id="btn-suivre">${icon('eye')}Suivre cette annonce</button>
        ${a.mode === 'vente' ? `<a class="btn" href="#credit?prix=${a.prix}&insee=${esc(a.insee)}">${icon('calc')}Simuler le crédit</a>` : ''}
      </div>`);
    brancherVeilleSelect(box.querySelector('#an-veille'), (id) => { veilleCible = id; }, () => a.communeNom || '');
    box.querySelector('#btn-suivre').addEventListener('click', () => {
      const { insee, mode: md, type, prix, surface, pieces, dpe, terrain, url, titre, portail, communeNom, dep, cp } = a;
      annonces.add({ ...champsDe(a), insee, mode: md, type, prix, surface, pieces, dpe, terrain, url, titre: titre || titreAuto({ type, pieces, surface, communeNom }), portail, communeNom, dep, cp, veilleId: veilleCible });
      toast(`Ajoutée à la veille « ${(veilles.get(veilleCible) || {}).nom} »`);
    });
  }

  if (partage && partage.p.cp) {
    try {
      const r = await chercher(partage.p.cp, 1);
      if (r[0]) { commune = { ...r[0], cp: partage.p.cp }; setCommune(commune); recents.add(commune); }
    } catch { /* l'utilisateur choisira la commune */ }
  }
  dessiner();
  surRetour(root, (t) => {
    const ta = root.querySelector('#colle');
    if (ta) { ta.value = t; lireAnnonce(); }
  });
}
