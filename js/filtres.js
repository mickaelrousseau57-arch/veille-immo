/* Tri et filtres des annonces suivies. Fonctions pures : liste = annonces ; evals = Map id -> resultat de evaluer(). */

import { norm, toNumber } from './util.js';
import { variationPrix } from './state.js';

export const TRIS = [
  ['ecart', 'Meilleures affaires'], ['ecartDesc', 'Moins bonnes affaires'], ['commune', 'Commune (A à Z)'], ['recent', 'Plus récentes'],
  ['prixAsc', 'Prix croissant'], ['prixDesc', 'Prix décroissant'], ['ppm2Asc', 'Prix au m² croissant'], ['ppm2Desc', 'Prix au m² décroissant'],
  ['surfaceDesc', 'Surface décroissante'], ['anneeDesc', 'Construction la plus récente'], ['baisse', 'Plus fortes baisses'],
];

export const FILTRES_VIDES = { mode: '', type: '', communes: [], verdict: '', prixMax: '', surfaceMin: '', surfaceMax: '', piecesMin: '', chambresMin: '', dpeMax: '', anneeMin: '', equip: [], texte: '' };

/* bonne : sous le marche ; marche ; chere : au-dessus ; inconnue : non evaluee. */
export function categorie(ev) {
  if (!ev || !ev.ok) return 'inconnue';
  const id = ev.verdict.id;
  if (id === 'tresBon' || id === 'bon' || id === 'tresBas' || id === 'bas') return 'bonne';
  if (id === 'marche') return 'marche';
  return 'chere';
}

const DPE = 'ABCDEFG';

export function nombreFiltres(f) {
  return ['mode', 'type', 'verdict', 'prixMax', 'surfaceMin', 'surfaceMax', 'piecesMin', 'chambresMin', 'dpeMax', 'anneeMin', 'texte'].filter((k) => String(f[k] ?? '').trim() !== '').length + (f.communes.length ? 1 : 0) + (f.equip.length ? 1 : 0);
}

/* Un critere numerique actif exclut les annonces dont la valeur est inconnue. */
export function filtrer(liste, f, evals) {
  const prixMax = toNumber(f.prixMax), sMin = toNumber(f.surfaceMin), sMax = toNumber(f.surfaceMax), pMin = toNumber(f.piecesMin), cMin = toNumber(f.chambresMin), aMin = toNumber(f.anneeMin);
  const texte = norm(f.texte);
  return liste.filter((a) => {
    if (f.mode && a.mode !== f.mode) return false;
    if (f.type && a.type !== f.type) return false;
    if (f.communes.length && !f.communes.includes(a.communeNom || '')) return false;
    if (f.verdict && categorie(evals.get(a.id)) !== f.verdict) return false;
    if (prixMax != null && !(a.prix <= prixMax)) return false;
    if (sMin != null && !(a.surface >= sMin)) return false;
    if (sMax != null && !(a.surface <= sMax)) return false;
    if (pMin != null && !(a.pieces >= pMin)) return false;
    if (cMin != null && !(a.chambres >= cMin)) return false;
    if (aMin != null && !(a.annee >= aMin)) return false;
    if (f.dpeMax && !(a.dpe && DPE.indexOf(a.dpe) >= 0 && DPE.indexOf(a.dpe) <= DPE.indexOf(f.dpeMax))) return false;
    if (f.equip.length && !f.equip.every((k) => (a.extras || []).includes(k))) return false;
    if (texte && !norm([a.titre, a.communeNom, a.cp, a.note, a.portail].join(' ')).includes(texte)) return false;
    return true;
  });
}

const ecartDe = (evals, a) => { const e = evals.get(a.id); return e && e.ok ? e.ecart : null; };
const ppm2 = (a) => (a.surface > 0 ? a.prix / a.surface : null);

/* Les valeurs inconnues vont toujours en fin de liste, quel que soit le sens du tri. */
function comparer(va, vb, sens) {
  if (va == null && vb == null) return 0;
  if (va == null) return 1;
  if (vb == null) return -1;
  return (va < vb ? -1 : va > vb ? 1 : 0) * sens;
}

export function trier(liste, cle, evals) {
  const l = [...liste];
  const parEcart = (a, b) => comparer(ecartDe(evals, a), ecartDe(evals, b), 1);
  const cles = {
    ecart: (a, b) => parEcart(a, b),
    ecartDesc: (a, b) => comparer(ecartDe(evals, a), ecartDe(evals, b), -1),
    commune: (a, b) => (a.communeNom || '').localeCompare(b.communeNom || '', 'fr') || parEcart(a, b),
    recent: (a, b) => String(b.creeLe || '').localeCompare(String(a.creeLe || '')),
    prixAsc: (a, b) => comparer(a.prix, b.prix, 1),
    prixDesc: (a, b) => comparer(a.prix, b.prix, -1),
    ppm2Asc: (a, b) => comparer(ppm2(a), ppm2(b), 1),
    ppm2Desc: (a, b) => comparer(ppm2(a), ppm2(b), -1),
    surfaceDesc: (a, b) => comparer(a.surface, b.surface, -1),
    anneeDesc: (a, b) => comparer(a.annee, b.annee, -1),
    baisse: (a, b) => comparer(variationPrix(a), variationPrix(b), 1),
  };
  return l.sort(cles[cle] || cles.ecart);
}

/* Communes presentes dans la liste, avec le nombre d'annonces. */
export function communesDe(liste) {
  const m = new Map();
  for (const a of liste) { const n = a.communeNom || ''; if (n) m.set(n, (m.get(n) || 0) + 1); }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([nom, n]) => ({ nom, n }));
}
