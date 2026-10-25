/* Evaluation d'une annonce : charge le marche de la commune puis applique l'analyse. Partage entre "Analyser" et "Ma veille". */

import { communeParInsee, marche, ventes } from './data.js';
import { analyserAchat, analyserLocation, comparables } from './analysis.js';

/* a : { mode, type, prix, surface, pieces, dpe, terrain, insee, cp }.
   Retourne { commune, marche, ...analyse, comparables } ; analyse.ok = false avec un message d'erreur si impossible. */
export async function evaluer(a, { avecComparables = false } = {}) {
  const commune = await communeParInsee(a.insee);
  if (!commune) return { ok: false, erreur: 'Commune introuvable.' };
  const cp = a.cp && commune.cps.includes(a.cp) ? a.cp : null;
  const m = await marche(commune, cp);
  const calcul = (fiche) => (a.mode === 'location'
    ? analyserLocation({ type: a.type, loyer: a.prix, surface: a.surface, pieces: a.pieces }, fiche)
    : analyserAchat({ type: a.type, prix: a.prix, surface: a.surface, pieces: a.pieces, dpe: a.dpe, terrain: a.terrain }, fiche));
  let res = calcul(m.fiche);
  let perimetre = cp || 'commune';
  if (!res.ok && cp) {
    const mc = await marche(commune, null);
    const r2 = calcul(mc.fiche);
    if (r2.ok) { res = r2; perimetre = 'commune'; }
  }
  if (!res.ok && a.mode !== 'location' && m.sansDvf && m.source !== 'manuel') {
    res.erreur = 'Les ventes ne sont pas publiées pour ce département. Saisissez un prix de référence au m² dans l\'écran Marché (cette commune) pour évaluer l\'annonce.';
  }
  const out = { ...res, commune, marche: m, perimetre, mode: a.mode };
  if (avecComparables && a.mode !== 'location' && !m.sansDvf) {
    const v = await ventes(commune.dep);
    out.comparables = comparables(v[commune.insee] || [], { type: a.type, surface: a.surface, pieces: a.pieces, lat: commune.lat, lon: commune.lon });
  }
  return out;
}
