/* Acces aux donnees publiees dans data/ (calculees par pipeline/build_data.py). Tout est servi par le meme site : aucun service externe. */

import { preparer, rechercher, versCommune } from './search.js';
import { store } from './util.js';

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

/* Une commune, un code postal : retourne la fiche de marche { fiche, source } et les fiches par code postal. */
export async function marche(commune, cp = null) {
  const d = await getJSON(`data/prix/${commune.dep}.json`);
  const m = await meta();
  const sansDvf = m.sansDvf.includes(commune.dep);
  const parCommune = d.c[commune.insee] || null;
  const parCp = {};
  for (const c of commune.cps) if (d.p[c]) parCp[c] = d.p[c];
  let fiche = cp && d.p[cp] ? { ...d.p[cp], l: parCommune && parCommune.l } : parCommune;
  let source = fiche && (fiche.a || fiche.h) ? 'dvf' : null;
  // Prix de reference saisis par l'utilisateur (departements hors DVF ou commune sans vente).
  const ref = store.get('refs', {})[commune.insee];
  if (!source && ref && (ref.a || ref.h)) {
    const bloc = (v) => (v ? { n: 10, q: [0.7, 0.85, 1, 1.15, 1.3].map((k) => Math.round(v * k)), n3: 10, q3: [0.7, 0.85, 1, 1.15, 1.3].map((k) => Math.round(v * k)) } : undefined);
    fiche = { ...(fiche || {}), a: bloc(ref.a), h: bloc(ref.h) };
    source = 'manuel';
  }
  return { commune, fiche, parCp, source, sansDvf, meta: m };
}

export async function ventes(dep) {
  try { return await getJSON(`data/ventes/${dep}.json`); } catch { return {}; }
}

export const taux = () => getJSON('data/taux.json');
