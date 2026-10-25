/* Etat partage : commune consultee, reglages, ma veille. Tout est stocke sur l'appareil (localStorage). */

import { store, uid, todayISO, toNumber } from './util.js';

/* ---------- Commune courante ---------- */
let current = store.get('commune');
export const getCommune = () => current;
export function setCommune(c) {
  current = c ? { insee: c.insee, nom: c.nom, dep: c.dep, cps: c.cps, lat: c.lat, lon: c.lon, pop: c.pop, type: c.type, cp: c.cp || null } : null;
  store.set('commune', current);
}

/* ---------- Reglages ---------- */
export const reglages = {
  get: (k, def) => store.get('reg.' + k, def),
  set: (k, v) => store.set('reg.' + k, v),
};

/* Prix de reference saisis a la main pour une commune sans donnees DVF. */
export function setRef(insee, a, h) {
  const refs = store.get('refs', {});
  if (a || h) refs[insee] = { a: a || null, h: h || null }; else delete refs[insee];
  store.set('refs', refs);
}

/* ---------- Veille : annonces suivies ---------- */
export const STATUTS = [
  { id: 'avoir', nom: 'À voir' },
  { id: 'contact', nom: 'Contacté' },
  { id: 'visite', nom: 'Visité' },
  { id: 'offre', nom: 'Offre faite' },
  { id: 'ecarte', nom: 'Écarté' },
];

export const annonces = {
  list: () => store.get('annonces', []),
  save: (l) => store.set('annonces', l),
  add(a) {
    const l = annonces.list();
    const item = { id: uid(), creeLe: todayISO(), verifieLe: todayISO(), statut: 'avoir', note: '', historique: [{ date: todayISO(), prix: a.prix }], ...a };
    l.unshift(item);
    annonces.save(l);
    return item;
  },
  update(id, patch) {
    const l = annonces.list().map((x) => (x.id === id ? { ...x, ...patch } : x));
    annonces.save(l);
  },
  remove(id) { annonces.save(annonces.list().filter((x) => x.id !== id)); },
  /* Ajoute des sources (autres sites ou liens) a une annonce deja suivie, sans doublon. */
  ajouterSources(id, sources) {
    const a = annonces.list().find((x) => x.id === id);
    if (!a) return 0;
    const cur = a.sources && a.sources.length ? a.sources : [{ portail: a.portail || '', url: a.url || '' }];
    const neuves = sources.filter((s) => (s.url || s.portail) && !cur.some((c) => (c.url && s.url ? c.url === s.url : c.portail === s.portail)));
    if (neuves.length) annonces.update(id, { sources: [...cur, ...neuves] });
    return neuves.length;
  },
  /* Nouveau prix constate : garde l'historique pour suivre les baisses. */
  changerPrix(id, prix) {
    const a = annonces.list().find((x) => x.id === id);
    if (!a || !(prix > 0) || prix === a.prix) return;
    annonces.update(id, { prix, verifieLe: todayISO(), historique: [...(a.historique || []), { date: todayISO(), prix }] });
  },
};

/* Variation du prix depuis la premiere saisie, en % (negative = baisse). */
export function variationPrix(a) {
  const h = a.historique || [];
  if (h.length < 2 || !h[0].prix) return null;
  return (a.prix / h[0].prix - 1) * 100;
}

/* ---------- Recherches enregistrees ---------- */
export const recherches = {
  list: () => store.get('recherches', []),
  add(r) {
    const l = recherches.list();
    if (l.some((x) => x.insee === r.insee && x.mode === r.mode && x.type === r.type)) return;
    l.unshift({ id: uid(), ...r });
    store.set('recherches', l);
  },
  remove(id) { store.set('recherches', recherches.list().filter((x) => x.id !== id)); },
};

/* ---------- Annonces observees (departements sans ventes publiees) ----------
   Chaque import d'annonces d'une commune sans donnees de vente alimente une reference locale, stockee sur l'appareil. */
const OBS_JOURS = 150;
const OBS_MAX = 300;
export const observations = {
  get(insee, cle) {
    const lim = Date.now() - OBS_JOURS * 86400000;
    return ((store.get('obs', {})[insee] || {})[cle] || []).filter((r) => r.t >= lim);
  },
  add(insee, cle, items) {
    const all = store.get('obs', {});
    const par = all[insee] || {};
    const cur = observations.get(insee, cle);
    const vus = new Set(cur.map((r) => r.k));
    const now = Date.now();
    for (const it of items) if (it.k && it.p > 0 && !vus.has(it.k)) { cur.push({ p: Math.round(it.p), k: it.k, t: now }); vus.add(it.k); }
    par[cle] = cur.slice(-OBS_MAX);
    all[insee] = par;
    store.set('obs', all);
  },
};

/* ---------- Comparateur de villes ---------- */
export const comparateur = {
  list: () => store.get('comparateur', []),
  add(c) {
    const l = comparateur.list();
    if (l.some((x) => x.insee === c.insee) || l.length >= 4) return false;
    l.push({ insee: c.insee, nom: c.nom, dep: c.dep, cps: c.cps, lat: c.lat, lon: c.lon, pop: c.pop, type: c.type });
    store.set('comparateur', l);
    return true;
  },
  remove(insee) { store.set('comparateur', comparateur.list().filter((x) => x.insee !== insee)); },
};

/* ---------- Sauvegarde / restauration ---------- */
const CLES = ['annonces', 'recherches', 'comparateur', 'refs', 'commune', 'reg.credit', 'reg.invest', 'reg.visite'];

export function exporter() {
  const o = { app: 'immo-veille', version: 1, date: todayISO() };
  for (const k of CLES) o[k] = store.get(k);
  return JSON.stringify(o, null, 1);
}

const txt = (v, max = 400) => (typeof v === 'string' ? v.slice(0, max) : '');
const nb = (v) => { const n = toNumber(v); return n == null ? null : n; };

/* Restaure une sauvegarde en ne conservant que les champs attendus (un fichier modifie ne doit rien casser). */
export function importer(texte) {
  let o;
  try { o = JSON.parse(texte); } catch { throw new Error('Fichier illisible.'); }
  if (!o || o.app !== 'immo-veille') throw new Error('Ce fichier n\'est pas une sauvegarde de cette application.');
  const nettoyer = (a) => ({
    id: txt(a.id, 30) || uid(), creeLe: txt(a.creeLe, 10), verifieLe: txt(a.verifieLe, 10), mode: a.mode === 'location' ? 'location' : 'vente',
    titre: txt(a.titre, 200), url: /^https?:\/\//.test(a.url || '') ? txt(a.url, 600) : '', portail: txt(a.portail, 60),
    insee: txt(a.insee, 6), communeNom: txt(a.communeNom, 100), dep: txt(a.dep, 3), cp: txt(a.cp, 5),
    type: a.type === 'Maison' ? 'Maison' : 'Appartement', prix: nb(a.prix), surface: nb(a.surface), pieces: nb(a.pieces), dpe: /^[A-G]$/.test(a.dpe) ? a.dpe : null,
    terrain: nb(a.terrain), statut: STATUTS.some((s) => s.id === a.statut) ? a.statut : 'avoir', note: txt(a.note, 2000),
    historique: Array.isArray(a.historique) ? a.historique.slice(0, 100).map((h) => ({ date: txt(h.date, 10), prix: nb(h.prix) })) : [],
    sources: Array.isArray(a.sources) ? a.sources.slice(0, 12).map((x) => ({ portail: txt(x && x.portail, 60), url: /^https?:\/\//.test((x && x.url) || '') ? txt(x.url, 600) : '' })) : [],
  });
  let n = 0;
  if (Array.isArray(o.annonces)) {
    const exist = new Set(annonces.list().map((a) => a.id));
    const neuves = o.annonces.map(nettoyer).filter((a) => a.prix > 0 && !exist.has(a.id));
    annonces.save([...neuves, ...annonces.list()]);
    n = neuves.length;
  }
  if (Array.isArray(o.recherches)) {
    const exist = new Set(recherches.list().map((r) => r.id));
    const nouvelles = o.recherches.filter((r) => r && typeof r.insee === 'string' && !exist.has(r.id)).map((r) => ({ id: txt(r.id, 30) || uid(), insee: txt(r.insee, 6), nom: txt(r.nom, 100), dep: txt(r.dep, 3), cps: Array.isArray(r.cps) ? r.cps.slice(0, 20).map((c) => txt(c, 5)) : [], lat: nb(r.lat), lon: nb(r.lon), mode: r.mode === 'location' ? 'location' : 'achat', type: txt(r.type, 20), budgetMax: nb(r.budgetMax), surfaceMin: nb(r.surfaceMin) }));
    store.set('recherches', [...nouvelles, ...recherches.list()]);
  }
  return n;
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
export function versCSV(lignes) {
  const cols = ['Titre', 'Commune', 'Code postal', 'Type', 'Prix', 'Surface m2', 'Pieces', 'Prix m2', 'Ecart marche %', 'Score', 'DPE', 'Statut', 'Variation prix %', 'Lien', 'Note'];
  return '﻿' + [cols, ...lignes].map((r) => r.map(csvCell).join(';')).join('\r\n');
}
