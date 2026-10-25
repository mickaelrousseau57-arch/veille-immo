/* Recherche d'une commune par nom, code postal ou code INSEE dans l'index data/communes.json.
   Ligne de l'index : [insee, nom, departement, "cp cp", lat, lon, population, type] ; type 0 commune, 1 ville a arrondissements, 2 arrondissement. */

import { norm } from './util.js';

export function versCommune(r) {
  return { insee: r[0], nom: r[1], dep: r[2], cps: r[3] ? r[3].split(' ') : [], lat: r[4], lon: r[5], pop: r[6], type: r[7] };
}

/* Prepare l'index une fois (noms normalises) pour des recherches rapides. */
export function preparer(rows) {
  return rows.map((r) => ({ r, n: norm(r[1]) }));
}

export function rechercher(idx, requete, max = 8) {
  const q = String(requete || '').trim();
  if (q.length < 2) return [];
  const digits = q.replace(/\s/g, '');
  if (/^\d{2,5}$/.test(digits)) {
    const res = [];
    for (const { r } of idx) {
      const cps = r[3];
      const hit = digits.length === 5 ? (r[0] === digits || (cps && (' ' + cps + ' ').includes(' ' + digits + ' '))) : (cps && cps.split(' ').some((c) => c.startsWith(digits))) || (digits.length >= 4 && r[0].startsWith(digits));
      if (hit) res.push(r);
    }
    // Pour un code postal complet : les arrondissements d'abord (plus precis), puis la population.
    res.sort((a, b) => (digits.length === 5 ? b[7] - a[7] : 0) || b[6] - a[6]);
    return res.slice(0, max).map(versCommune);
  }
  // "nancy 54" : un nombre final restreint au departement.
  let texte = q;
  let dep = null;
  const m = /^(.*\D)\s+(\d{2,3}|2[ab])$/i.exec(q);
  if (m) { texte = m[1]; dep = m[2].toUpperCase(); }
  const n = norm(texte);
  if (!n) return [];
  const mots = n.split(' ');
  const res = [];
  for (const { r, n: nom } of idx) {
    if (dep && r[2] !== dep) continue;
    let rang = -1;
    if (nom === n) rang = 0;
    else if (nom.startsWith(n)) rang = 1;
    else if (mots.every((w) => nom.split(' ').some((x) => x.startsWith(w)))) rang = 2;
    else if (nom.includes(n)) rang = 3;
    if (rang < 0) continue;
    res.push({ r, rang });
  }
  res.sort((a, b) => a.rang - b.rang || b.r[6] - a.r[6] || a.r[7] - b.r[7]);
  return res.slice(0, max).map((x) => versCommune(x.r));
}
