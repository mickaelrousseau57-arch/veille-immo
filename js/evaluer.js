/* Evaluation d'une annonce : charge le marche de la commune puis applique l'analyse. Partage entre "Analyser" et "Ma veille". */

import { communeParInsee, marche, ventes, index, refsNotaires } from './data.js';
import { distKm } from './util.js';
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
  if (a.mode !== 'location' && m.sansDvf) {
    const cle = a.type === 'Maison' ? 'h' : 'a';
    const n = m.notaires;
    res.alertes = res.alertes || [];
    if (!res.ok) {
      res.erreur = 'Les ventes ne sont pas publiées pour ce département. Pour évaluer cette annonce, importez au moins 8 annonces de la commune (écran Plusieurs annonces) ou saisissez un prix de référence au m² dans l\'écran Marché.';
    }
    if (n && a.type === 'Maison' && n.commune && n.commune.h) {
      const e = (a.prix / n.commune.h - 1) * 100;
      res.alertes.push({ tone: 'info', texte: `Repère des notaires (ventes 2024) : prix médian d'une maison ancienne à ${commune.nom} = ${Math.round(n.commune.h).toLocaleString('fr-FR')} €. Cette annonce est ${e >= 0 ? '+' : ''}${Math.round(e)} % par rapport à ce repère, sans correction de la surface ni du terrain.` });
    } else if (n && n.dep && !m.sources[cle] && (await plusProche(commune, cle))) {
      const r = await plusProche(commune, cle);
      const e = a.type === 'Maison' ? (a.prix / r.val - 1) * 100 : (a.prix / a.surface / r.val - 1) * 100;
      const repere = a.type === 'Maison' ? `${Math.round(r.val).toLocaleString('fr-FR')} € (prix médian d'une maison ancienne)` : `${Math.round(r.val).toLocaleString('fr-FR')} €/m²`;
      res.alertes.push({ tone: 'info', texte: `Commune de référence la plus proche : ${r.nom} (${Math.round(r.d)} km), médiane des notaires ${repere}. Cette annonce est ${e >= 0 ? '+' : ''}${Math.round(e)} % par rapport à ce repère${a.type === 'Maison' ? ', sans correction de la surface ni du terrain' : ''}. Indicatif : chaque commune a son propre marché.` });
    } else if (n && n.dep && !m.sources[cle]) {
      const v = a.type === 'Maison' ? `${Math.round(n.dep.h).toLocaleString('fr-FR')} € pour une maison ancienne` : `${Math.round(n.dep.a).toLocaleString('fr-FR')} €/m² pour un appartement ancien`;
      res.alertes.push({ tone: 'info', texte: `Repère départemental des notaires (ventes 2024) : ${v}. Les écarts entre communes sont très importants : ce n'est pas un prix pour ${commune.nom}.` });
    }
  }
  const out = { ...res, commune, marche: m, perimetre, mode: a.mode };
  if (avecComparables && a.mode !== 'location' && !m.sansDvf) {
    const v = await ventes(commune.dep);
    out.comparables = comparables(v[commune.insee] || [], { type: a.type, surface: a.surface, pieces: a.pieces, lat: commune.lat, lon: commune.lon });
  }
  return out;
}

/* Commune du meme departement, avec une mediane publiee par les notaires, la plus proche (30 km au plus). */
const cachePlusProche = new Map();
async function plusProche(commune, cle) {
  const k = commune.insee + cle;
  if (cachePlusProche.has(k)) return cachePlusProche.get(k);
  let best = null;
  try {
    const refs = await refsNotaires();
    const idx = await index();
    for (const [insee, v] of Object.entries(refs.communes)) {
      if (!v[cle] || insee === commune.insee || insee.slice(0, 2) !== commune.dep.slice(0, 2)) continue;
      const r = idx.find((x) => x.r[0] === insee);
      if (!r) continue;
      const d = distKm({ lat: commune.lat, lon: commune.lon }, { lat: r.r[4], lon: r.r[5] });
      if (!best || d < best.d) best = { nom: v.nom, d, val: v[cle] };
    }
  } catch { best = null; }
  if (best && best.d > 30) best = null;
  cachePlusProche.set(k, best);
  return best;
}
