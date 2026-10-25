/* Ecran "Estimer un bien" : prix du marche local corrige de ce qui fait varier un prix, avec le detail de chaque correction. */

import { esc, eur, eurM2, num, toNumber, frDate, distKm } from '../util.js';
import { carte, champ, choix, segments, brancherSegments, selecteurHTML, brancherSelecteur, lire, toast, recents, basculeAnalyse, badge } from '../ui.js';
import { communeParInsee, marche, ventes } from '../data.js';
import { getCommune, setCommune, annonces } from '../state.js';
import { choisirStats, blocSynthetique } from '../analysis.js';
import { estimer, arrondir, SOURCES } from '../estimation.js';
import { EQUIPEMENTS, ETATS } from '../caracteristiques.js';
import { choisirPoint } from '../map.js';
import { icon } from '../icons.js';

const NIVEAUX = { donnees: ['info', 'Données'], etude: ['good', 'Étude'], indicatif: ['neutral', 'Indicatif'], hypothese: ['warn', 'Hypothèse'], saisie: ['info', 'Modifié'] };
const CONFIANCE = { bonne: 'good', correcte: 'neutral', indicative: 'warn', faible: 'bad' };

export async function render(root, params = {}) {
  let commune = getCommune();
  let v = { type: 'Appartement', surface: '', pieces: '', chambres: '', sdb: '', annee: '', etage: '', etagesTotal: '', terrain: '', etat: '', dpe: '', parking: '', garage: '', libre: '', demande: '', extras: [], quartier: '' };
  let point = null; // [lat, lon]
  let surcharges = {};
  let m = null;

  if (params.annonce) {
    const a = annonces.list().find((x) => x.id === params.annonce);
    if (a) {
      const c = await communeParInsee(a.insee);
      if (c) commune = { ...c, cp: a.cp || null };
      v = { ...v, type: a.type || 'Appartement', surface: a.surface ?? '', pieces: a.pieces ?? '', chambres: a.chambres ?? '', sdb: a.sdb ?? '', annee: a.annee ?? '', etage: a.etage ?? '', etagesTotal: a.etagesTotal ?? '', terrain: a.terrain ?? '', etat: a.etat || '', dpe: a.dpe || '', extras: [...(a.extras || [])], demande: a.mode === 'vente' ? a.prix : '' };
    }
  }

  async function chargerMarche() {
    m = null;
    if (!commune) return;
    try { m = await marche(commune, commune.cp || null); } catch { m = null; }
  }

  function lireChamps() {
    v = { ...v, type: v.type, surface: lire(root, 'e-surface'), pieces: lire(root, 'e-pieces'), chambres: lire(root, 'e-chambres'), sdb: lire(root, 'e-sdb'), annee: lire(root, 'e-annee'), etage: lire(root, 'e-etage'), etagesTotal: lire(root, 'e-etages'), terrain: lire(root, 'e-terrain'), etat: lire(root, 'e-etat'), dpe: lire(root, 'e-dpe'), parking: lire(root, 'e-parking'), garage: lire(root, 'e-garage'), libre: lire(root, 'e-libre'), demande: lire(root, 'e-demande'), quartier: lire(root, 'e-quartier'), extras: Array.from(root.querySelectorAll('#e-equip .chip.on')).map((c) => c.dataset.v) };
  }

  function formulaire() {
    const quartiers = m && m.notaires && m.notaires.commune && m.notaires.commune.quartiers;
    return carte('Estimer un bien', `
      <p class="lead">Le prix du marché local (ventes réelles quand elles existent) corrigé de ce qui influe sur un prix. Chaque correction est détaillée, avec sa source, et vous pouvez la modifier.</p>
      ${selecteurHTML('pick-est', commune ? commune.nom : '')}
      ${segments('seg-type-est', [['Appartement', 'Appartement'], ['Maison', 'Maison']], v.type)}
      <div class="grid2">
        ${champ({ id: 'e-surface', label: 'Surface habitable', type: 'number', valeur: v.surface, suffixe: 'm²' })}
        ${champ({ id: 'e-pieces', label: 'Pièces', type: 'number', valeur: v.pieces })}
        ${champ({ id: 'e-chambres', label: 'Chambres', type: 'number', valeur: v.chambres })}
        ${champ({ id: 'e-sdb', label: 'Salles de bain', type: 'number', valeur: v.sdb })}
        ${champ({ id: 'e-annee', label: 'Année de construction', type: 'number', valeur: v.annee })}
        ${champ({ id: 'e-terrain', label: 'Terrain (maison)', type: 'number', valeur: v.terrain, suffixe: 'm²' })}
        ${champ({ id: 'e-etage', label: 'Étage (0 = rez-de-chaussée)', type: 'number', valeur: v.etage })}
        ${champ({ id: 'e-etages', label: 'Nombre d\'étages de l\'immeuble', type: 'number', valeur: v.etagesTotal })}
        ${choix({ id: 'e-dpe', label: 'DPE', options: [['', 'Inconnu'], ...'ABCDEFG'.split('').map((x) => [x, x])], valeur: v.dpe })}
        ${choix({ id: 'e-etat', label: 'État', options: [['', 'Inconnu'], ...ETATS], valeur: v.etat })}
      </div>
      <p class="hint" style="margin-top:12px">Équipements</p>
      <div class="chips" id="e-equip">${EQUIPEMENTS.filter(([k]) => k !== 'meuble').map(([k, n]) => `<button type="button" class="chip${v.extras.includes(k) ? ' on' : ''}" data-v="${k}" aria-pressed="${v.extras.includes(k)}">${esc(n)}</button>`).join('')}</div>
      <div class="grid2">
        ${champ({ id: 'e-parking', label: 'Valeur d\'un parking (facultatif)', type: 'number', valeur: v.parking, suffixe: '€', aide: 'Pas de moyenne fiable : relevez des annonces de parkings du quartier.' })}
        ${champ({ id: 'e-garage', label: 'Valeur d\'un garage (facultatif)', type: 'number', valeur: v.garage, suffixe: '€' })}
        ${quartiers ? choix({ id: 'e-quartier', label: 'Quartier (notaires)', options: [['', 'Toute la commune'], ...quartiers.map((q, i) => [String(i), `${q.nom} (${num(q.a)} €/m²)`])], valeur: v.quartier }) : '<input type="hidden" id="e-quartier" value="">'}
        ${champ({ id: 'e-libre', label: 'Ajustement personnel', type: 'number', valeur: v.libre, suffixe: '%', aide: 'Vue, calme, rue, nuisances : +5 ou -5 par exemple.' })}
        ${champ({ id: 'e-demande', label: 'Prix demandé (pour comparer)', type: 'number', valeur: v.demande, suffixe: '€' })}
      </div>
      <details${point ? ' open' : ''}><summary>Emplacement précis (ventes voisines)</summary>
        <p class="muted" style="margin-top:8px">Placez le bien sur la carte : les ventes réelles dans les 1,5 à 3 km autour servent à ajuster le prix de la commune.</p>
        ${champ({ id: 'e-adresse', label: 'Rechercher une adresse', valeur: '', attrs: 'placeholder="12 rue de la Gare"', aide: 'La recherche interroge l\'API Adresse de data.gouv.fr avec ce que vous tapez.' })}
        <div class="actions"><button type="button" class="btn" id="e-chercher">${icon('search')}Chercher</button><button type="button" class="btn" id="e-carte">${icon('map')}Placer sur la carte</button><button type="button" class="btn ghost" id="e-retirer"${point ? '' : ' hidden'}>Retirer le repère</button></div>
        <ul class="comps" id="e-propositions"></ul>
        <p class="note" id="e-point">${point ? `Repère posé : ${point[0].toFixed(4)}, ${point[1].toFixed(4)}` : 'Aucun repère posé : l\'emplacement n\'est pas pris en compte.'}</p>
        <div class="map" id="e-map" hidden></div>
      </details>
      <div class="actions"><button type="button" class="btn primary" id="e-go">Estimer</button></div>`);
  }

  async function voisinsDe() {
    if (!point || !m || m.sansDvf) return { prix: [], rayon: 0, liste: [] };
    const rows = ((await ventes(commune.dep))[commune.insee] || []).filter((r) => r[4] === (v.type === 'Maison' ? 1 : 0) && r[5] != null && r[2] > 0);
    const avecDist = rows.map((r) => ({ r, d: distKm({ lat: point[0], lon: point[1] }, { lat: r[5], lon: r[6] }) }));
    for (const rayon of [1.5, 3]) {
      const l = avecDist.filter((x) => x.d <= rayon);
      if (l.length >= 8 || rayon === 3) return { prix: l.map((x) => x.r[1] / x.r[2]), rayon, liste: l.sort((a, b) => a.d - b.d).slice(0, 6) };
    }
    return { prix: [], rayon: 0, liste: [] };
  }

  async function calculer() {
    lireChamps();
    const zone = root.querySelector('#e-res');
    const surface = toNumber(v.surface);
    if (!commune) { toast('Choisissez la commune'); return; }
    if (!(surface > 0)) { toast('Indiquez la surface'); return; }
    if (!m) { await chargerMarche(); }
    if (!m) { zone.innerHTML = carte('', '<div class="notice warn"><p>Données du marché indisponibles. Vérifiez la connexion.</p></div>'); return; }
    const cle = v.type === 'Maison' ? 'h' : 'a';
    const quartiers = m.notaires && m.notaires.commune && m.notaires.commune.quartiers;
    let bloc = m.fiche[cle], source = m.sources[cle];
    if (v.type === 'Appartement' && quartiers && v.quartier !== '' && quartiers[Number(v.quartier)]) {
      const q = quartiers[Number(v.quartier)];
      bloc = blocSynthetique(q.a, { libelle: `médiane des notaires, quartier ${q.nom}`, fiabilite: 'indicative' });
      source = 'notaires';
    }
    const pieces = toNumber(v.pieces);
    const stats = choisirStats(bloc, v.type === 'Appartement' ? pieces : null);
    if (!stats) {
      zone.innerHTML = carte('', `<div class="notice warn"><p>Pas assez de données de prix pour ${esc(commune.nom)}${m.sansDvf ? ' (département sans ventes publiées)' : ''}. Importez au moins 8 annonces de la commune, ou saisissez un prix de référence au m² dans l'écran Marché.</p><div class="actions"><a class="btn" href="#marche?insee=${esc(commune.insee)}">Ouvrir le marché</a></div></div>`);
      return;
    }
    const vo = await voisinsDe();
    const bien = { type: v.type, surface, pieces, annee: toNumber(v.annee), etage: toNumber(v.etage), etagesTotal: toNumber(v.etagesTotal), dpe: v.dpe || null, etat: v.etat || null, extras: v.extras, parkingEur: toNumber(v.parking), garageEur: toNumber(v.garage), libre: toNumber(v.libre) };
    const base = { ...stats, source };
    const res = estimer({ bien, base, voisins: vo.prix, surcharges });
    afficher(res, { bien, base, vo, demande: toNumber(v.demande) });
  }

  function afficher(res, ctx) {
    const zone = root.querySelector('#e-res');
    if (!res.ok) { zone.innerHTML = carte('', `<div class="notice warn"><p>${esc(res.erreur)}</p></div>`); return; }
    const { bien, base, vo, demande } = ctx;
    const ligne = (l) => {
      const [tone, nom] = NIVEAUX[l.fiabilite] || NIVEAUX.hypothese;
      const src = SOURCES[l.source];
      return `<tr><td>${esc(l.label)}${src ? `<details class="src"><summary>Source</summary><p>${esc(src.texte)}${src.url ? ` <a href="${esc(src.url)}" target="_blank" rel="noopener noreferrer">Lien</a>` : ''}</p></details>` : ''}</td>
        <td class="num"><input class="mini-pct" type="text" inputmode="decimal" data-s="${esc(l.id)}" value="${num(l.pct, 1).replace(/ /g, '')}" aria-label="Pourcentage pour ${esc(l.label)}"> %</td>
        <td class="num ${l.effetM2 >= 0 ? 'pos' : 'neg'}">${l.effetM2 >= 0 ? '+' : ''}${num(l.effetM2)}</td><td>${badge(tone, nom)}</td></tr>`;
    };
    const ecart = demande > 0 ? (demande / res.central - 1) * 100 : null;
    zone.innerHTML = carte('Estimation', `
      <div class="resultat-prix"><p class="grand">${eur(arrondir(res.central))}</p><p class="muted">fourchette probable : ${eur(arrondir(res.bas))} à ${eur(arrondir(res.haut))}, soit ${eurM2(res.ppm2)}</p>
        <p>${badge(CONFIANCE[res.confiance], `Confiance ${res.confiance}`)} <span class="muted">${esc(res.raisons.join(', '))}</span></p></div>
      ${ecart != null ? `<div class="notice ${Math.abs(ecart) < 5 ? '' : ecart > 0 ? 'warn' : ''}"><p>Le prix demandé (${eur(demande)}) est <b>${ecart > 0 ? '+' : ''}${num(ecart, 1)} %</b> par rapport à cette estimation${ecart >= 5 ? ' : au-dessus, une négociation est justifiée.' : ecart <= -5 ? ' : en dessous de l\'estimation.' : ' : dans la fourchette.'}</p></div>` : ''}
      <h3 class="sec">Comment c'est calculé</h3>
      <div class="scroll"><table class="tbl calc"><thead><tr><th>Étape</th><th>Effet</th><th>€/m²</th><th>Fiabilité</th></tr></thead><tbody>
        <tr><td><b>Marché local</b><br><small class="muted">${esc(base.fenetre)}${base.ajustePieces ? `, corrigé pour ${base.ajustePieces.pieces >= 5 ? '5 pièces et plus' : base.ajustePieces.pieces + ' pièce(s)'}` : ''}</small></td><td class="num">--</td><td class="num"><b>${num(res.ppm2Base)}</b></td><td>${badge('info', { dvf: 'Ventes réelles', notaires: 'Notaires', annonces: 'Annonces', manuel: 'Saisi' }[base.source] || 'Données')}</td></tr>
        ${res.lignes.map(ligne).join('')}
        <tr class="total"><td><b>Prix au m² estimé</b></td><td></td><td class="num"><b>${num(res.ppm2)}</b></td><td></td></tr></tbody></table></div>
      ${res.extras.length ? `<p class="line">Ajoutés : ${res.extras.map((e) => `${esc(e.label)} ${eur(e.eur)}`).join(', ')}.</p>` : ''}
      <div class="actions"><button type="button" class="btn ghost" id="e-reset"${Object.keys(surcharges).length ? '' : ' hidden'}>Revenir aux valeurs proposées</button></div>
      <p class="note">Les pourcentages sont modifiables : changez-en un et le résultat se recalcule. ${vo.prix.length >= 8 ? `Emplacement : ${vo.prix.length} ventes dans ${vo.rayon} km.` : bien && vo.prix.length ? `Seulement ${vo.prix.length} ventes voisines connues : l'emplacement n'est pas pris en compte.` : ''}</p>
      ${notes(bien, base)}
      ${vo.liste.length ? `<h3 class="sec">Ventes voisines les plus proches</h3><ul class="comps">${vo.liste.map((x) => `<li><div><b>${eur(x.r[1])}</b>, ${num(x.r[2])} m²${x.r[3] ? `, ${x.r[3]} p.` : ''}<small>${esc(x.r[7] || 'Adresse non précisée')}, ${esc(frDate(x.r[0]))}, à ${num(x.d, 1)} km</small></div><b class="ppm">${eurM2(x.r[1] / x.r[2])}</b></li>`).join('')}</ul>` : ''}`);
    zone.querySelectorAll('.mini-pct').forEach((i) => i.addEventListener('change', () => {
      const n = toNumber(i.value);
      if (n == null) return;
      surcharges[i.dataset.s] = n;
      calculer();
    }));
    zone.querySelector('#e-reset')?.addEventListener('click', () => { surcharges = {}; calculer(); });
    zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function notes(bien, base) {
    const n = [];
    if (bien.etat === 'neuf') n.push('Le neuf (VEFA) se vend nettement plus cher que l\'ancien (en Moselle, 3 880 €/m² contre 2 030 €/m² en 2024 selon les notaires) : cette estimation s\'appuie sur des ventes dans l\'ancien et reste indicative.');
    if (bien.etat === 'travaux') n.push('Pour un bien à rénover, chiffrez les travaux avec un artisan : retirer leur montant du prix est plus fiable qu\'un pourcentage.');
    if (bien.dpe && bien.annee) n.push('Le DPE et l\'année de construction se recoupent en partie : si vous trouvez l\'estimation trop sévère ou trop généreuse, modifiez l\'une des deux corrections.');
    n.push('Le nombre de chambres et de salles de bain n\'est pas utilisé directement : aucune donnée publique ne le relie au prix, il se reflète déjà dans la surface et le nombre de pièces.');
    n.push('Estimation indicative, pas une expertise : l\'état réel, la vue, le bruit, la copropriété ou le dernier acte de vente du quartier peuvent l\'écarter nettement.');
    return `<ul class="alerts">${n.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`;
  }

  async function dessiner() {
    await chargerMarche();
    root.innerHTML = basculeAnalyse('estimer') + '<div class="cols"><div>' + formulaire() + '</div><div class="side libre"><div id="e-res"></div></div></div>';
    brancherSegments(root, 'seg-type-est', (t) => { lireChamps(); v.type = t; surcharges = {}; dessiner(); });
    brancherSelecteur(root, 'pick-est', async (c) => { lireChamps(); commune = c; setCommune(c); recents.add(c); point = null; surcharges = {}; v.quartier = ''; dessiner(); });
    root.querySelector('#e-equip').addEventListener('click', (e) => {
      const c = e.target.closest('.chip');
      if (c) { c.classList.toggle('on'); c.setAttribute('aria-pressed', String(c.classList.contains('on'))); }
    });
    root.querySelector('#e-go').addEventListener('click', calculer);
    const poser = (lat, lon) => {
      point = [lat, lon];
      root.querySelector('#e-point').textContent = `Repère posé : ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      root.querySelector('#e-retirer').hidden = false;
    };
    root.querySelector('#e-carte').addEventListener('click', async () => {
      if (!commune) { toast('Choisissez d\'abord la commune'); return; }
      const el = root.querySelector('#e-map');
      el.hidden = false;
      try { await choisirPoint(el, { centre: [commune.lat, commune.lon], point, onPick: poser }); } catch { toast('Carte indisponible hors connexion'); el.hidden = true; }
    });
    root.querySelector('#e-retirer').addEventListener('click', () => { point = null; root.querySelector('#e-point').textContent = 'Aucun repère posé : l\'emplacement n\'est pas pris en compte.'; root.querySelector('#e-retirer').hidden = true; root.querySelector('#e-map').hidden = true; });
    root.querySelector('#e-chercher').addEventListener('click', async () => {
      const q = lire(root, 'e-adresse').trim();
      const liste = root.querySelector('#e-propositions');
      if (q.length < 3) { toast('Tapez une adresse'); return; }
      try {
        const url = 'https://api-adresse.data.gouv.fr/search/?' + new URLSearchParams({ q, limit: '5', ...(commune && commune.cps && commune.cps[0] ? { postcode: commune.cps[0] } : {}) });
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        const props = (j.features || []).map((f) => ({ label: f.properties.label, lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }));
        liste.innerHTML = props.length ? props.map((p, i) => `<li><button type="button" class="btn ghost" data-i="${i}">${esc(p.label)}</button></li>`).join('') : '<li class="muted">Aucune adresse trouvée.</li>';
        liste.onclick = async (e) => {
          const b = e.target.closest('button[data-i]');
          if (!b) return;
          const p = props[Number(b.dataset.i)];
          poser(p.lat, p.lon);
          liste.innerHTML = '';
          const el = root.querySelector('#e-map');
          el.hidden = false;
          try { await choisirPoint(el, { centre: [p.lat, p.lon], point: [p.lat, p.lon], onPick: poser }); } catch { /* repère posé sans carte */ }
        };
      } catch {
        liste.innerHTML = '<li class="muted">La recherche d\'adresse est indisponible. Placez le repère à la main sur la carte.</li>';
      }
    });
  }

  await dessiner();
  if (params.annonce && toNumber(v.surface) > 0) calculer();
}
