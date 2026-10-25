/* Acces aux donnees publiees dans data/ (calculees par pipeline/build_data.py). Tout est servi par le meme site : aucun service externe. */

import { preparer, rechercher, versCommune } from './search.js';
import { store } from './util.js';
import { blocSynthetique, blocDepuisObservations } from './analysis.js';
import { observations } from './state.js';

const cache = new Map();

async function getJSON(path) {
  if (!cache.has(path)) {
    cache.set(path, fetch(path).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status} (${path})`);
      return r.json();
    }).catch((e) => { cache.delete(path); throw e; }));
  }
  return cache.get(path);
}

export const meta = () => getJSON('data/meta.json');

let indexP = null;
export function index() {
  if (!indexP) indexP = getJSON('data/communes.json').then(preparer).catch((e) => { indexP = null; throw e; });
  return indexP;
}

export async function chercher(q, max = 8) {
  return rechercher(await index(), q, max);
}

export async function communeParInsee(insee) {
  const idx = await index();
  const r = idx.find((x) => x.r[0] === insee);
  return r ? versCommune(r.r) : null;
}

export const refsNotaires = () => getJSON('data/refs-notaires.json');

/* Une commune, un code postal : retourne la fiche de marche et, pour chaque type de bien, d'ou viennent les prix.
   sources.a / sources.h : 'dvf' (ventes reelles), 'manuel' (prix saisi), 'notaires' (mediane publiee par les notaires),
   'annonces' (prix demandes observes dans vos imports) ou null. */
export async function marche(commune, cp = null) {
  const d = await getJSON(`data/prix/${commune.dep}.json`);
  const m = await meta();
  const sansDvf = m.sansDvf.includes(commune.dep);
  const parCommune = d.c[commune.insee] || null;
  const parCp = {};
  for (const c of commune.cps) if (d.p[c]) parCp[c] = d.p[c];
  const base = cp && d.p[cp] ? { ...d.p[cp], l: parCommune && parCommune.l } : parCommune;
  const fiche = { ...(base || {}) };
  const sources = { a: fiche.a ? 'dvf' : null, h: fiche.h ? 'dvf' : null };

  // Departements sans ventes publiees : reference saisie, puis medianes des notaires, puis annonces observees.
  let notaires = null;
  if (sansDvf) {
    try {
      const n = await refsNotaires();
      notaires = { commune: n.communes[commune.insee] || null, dep: n.departements[commune.dep] || null, secteurs: n.secteurs[commune.dep] || [], source: n.source, url: n.url, periode: n.periode, note: n.note };
    } catch { /* repere des notaires indisponible */ }
  }
  const ref = store.get('refs', {})[commune.insee] || {};
  for (const [k, key] of [['a', 'a'], ['h', 'h']]) {
    if (sources[k]) continue;
    if (ref[key]) { fiche[k] = blocSynthetique(ref[key]); sources[k] = 'manuel'; continue; }
    if (!sansDvf) continue;
    if (k === 'a' && notaires && notaires.commune && notaires.commune.a) {
      fiche.a = blocSynthetique(notaires.commune.a, { libelle: `médiane des notaires (ventes ${notaires.periode.slice(-4)})`, fiabilite: 'indicative' });
      sources.a = 'notaires';
      continue;
    }
    const obs = blocDepuisObservations(observations.get(commune.insee, k));
    if (obs) { fiche[k] = obs; sources[k] = 'annonces'; }
  }
  const nbObservations = sansDvf ? { a: observations.get(commune.insee, 'a').length, h: observations.get(commune.insee, 'h').length } : null;
  return { commune, fiche, parCp, source: sources.a || sources.h, sources, sansDvf, notaires, nbObservations, meta: m };
}

export async function ventes(dep) {
  try { return await getJSON(`data/ventes/${dep}.json`); } catch { return {}; }
}

export const taux = () => getJSON('data/taux.json');
