import test from 'node:test';
import assert from 'node:assert/strict';
import { estimer, corrections, effetEmplacement, arrondir } from '../js/estimation.js';

const proche = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);
const base = (o = {}) => ({ mediane: 2000, medianeBrute: 2000, q: [1400, 1700, 2000, 2300, 2600], n: 200, source: 'dvf', surfaceType: null, ajustePieces: null, ...o });

test('sans correction : surface x mediane du marche', () => {
  const r = estimer({ bien: { type: 'Appartement', surface: 60 }, base: base() });
  assert.equal(r.ok, true);
  proche(r.central, 120000);
  proche(r.bas, 60 * 1700);
  proche(r.haut, 60 * 2300);
  assert.equal(r.lignes.length, 0);
  assert.equal(r.confiance, 'bonne');
});

test('corrections multiplicatives : DPE G maison, jardin, annee recente', () => {
  const r = estimer({ bien: { type: 'Maison', surface: 100, dpe: 'G', extras: ['jardin'], annee: 2015 }, base: base() });
  const ids = r.lignes.map((l) => l.id).sort();
  assert.deepEqual(ids, ['annee', 'dpe', 'jardin']);
  proche(r.facteur, 0.79 * 1.04 * 1.06, 1e-9);
  proche(r.central, 100 * 2000 * 0.79 * 1.04 * 1.06, 0.5);
  // chaque ligne porte sa source et son effet au m2
  assert.equal(r.lignes.find((l) => l.id === 'dpe').fiabilite, 'etude');
  assert.equal(r.lignes.find((l) => l.id === 'annee').fiabilite, 'hypothese');
});

test('etage : rez-de-chaussee, dernier etage avec ascenseur, etage eleve sans ascenseur', () => {
  const id = (b) => corrections({ type: 'Appartement', surface: 50, ...b }, base()).find((c) => c.id === 'etage');
  assert.equal(id({ etage: 0 }).pct, -8);
  assert.equal(id({ etage: 5, etagesTotal: 5, extras: ['ascenseur'] }).pct, 5);
  assert.equal(id({ etage: 5, etagesTotal: 6, extras: [] }).pct, -3);
  assert.equal(id({ etage: 2, etagesTotal: 5 }), undefined);
  // pas d'effet d'etage pour une maison
  assert.equal(corrections({ type: 'Maison', surface: 100, etage: 0 }, base()).find((c) => c.id === 'etage'), undefined);
});

test('balcon ou terrasse (appartement seulement), piscine (maison seulement), jardin selon le type', () => {
  const ids = (b) => corrections({ surface: 50, ...b }, base()).map((c) => `${c.id}:${c.pct}`).sort().join(',');
  assert.equal(ids({ type: 'Appartement', extras: ['balcon', 'terrasse'] }), 'balcon:9');
  assert.equal(ids({ type: 'Maison', extras: ['balcon', 'terrasse', 'piscine', 'jardin'] }), 'jardin:4,piscine:3');
  assert.equal(ids({ type: 'Appartement', extras: ['jardin', 'piscine'] }), 'jardin:5');
});

test('annee de construction : tranches', () => {
  const pct = (a) => (corrections({ type: 'Maison', surface: 100, annee: a }, base()).find((c) => c.id === 'annee') || {}).pct;
  assert.equal(pct(2020), 6);
  assert.equal(pct(2000), 2);
  assert.equal(pct(1980), undefined); // 0 % : aucune ligne
  assert.equal(pct(1960), -4);
  assert.equal(pct(1900), undefined);
});

test('surface : correction legere seulement sans correction par pieces', () => {
  const pt = corrections({ type: 'Appartement', surface: 30 }, base({ surfaceType: 60 })).find((c) => c.id === 'surface');
  assert.ok(pt.pct > 0 && pt.pct <= 12);
  const gd = corrections({ type: 'Appartement', surface: 120 }, base({ surfaceType: 60 })).find((c) => c.id === 'surface');
  assert.ok(gd.pct < 0);
  assert.equal(corrections({ type: 'Appartement', surface: 30 }, base({ surfaceType: 60, ajustePieces: { pieces: 1 } })).find((c) => c.id === 'surface'), undefined);
});

test('emplacement precis : minimum de ventes, ponderation et bornes', () => {
  assert.equal(effetEmplacement([2400, 2400, 2400], 2000), null);
  const e = effetEmplacement(Array(10).fill(2400), 2000);
  assert.equal(e.n, 10);
  proche(e.pct, (10 / 22) * 0.2 * 100, 0.1); // 9,1 %
  const fort = effetEmplacement(Array(100).fill(5000), 2000); // borne a +25 %
  proche(fort.pct, (100 / 112) * 0.25 * 100, 0.1);
  const bas = effetEmplacement(Array(30).fill(500), 2000); // borne a -20 %
  proche(bas.pct, -(30 / 42) * 0.2 * 100, 0.1);
});

test('surcharge utilisateur, ajustement libre, parking, fourchette elargie par les hypotheses', () => {
  const bien = { type: 'Maison', surface: 100, annee: 2015, etat: 'renove', libre: 3, garageEur: 10000 };
  const r = estimer({ bien, base: base(), surcharges: { annee: 0 } });
  assert.equal(r.lignes.find((l) => l.id === 'annee').modifie, true);
  assert.equal(r.lignes.find((l) => l.id === 'annee').fiabilite, 'saisie');
  proche(r.facteur, 1.05 * 1.03, 1e-9);
  proche(r.supplement, 10000);
  proche(r.central, 100 * 2000 * 1.05 * 1.03 + 10000, 0.5);
  assert.equal(r.hypotheses, 1); // l'etat reste une hypothese ; l'annee est saisie
  const sans = estimer({ bien: { type: 'Maison', surface: 100 }, base: base() });
  assert.ok((r.haut - r.central) / r.central > (sans.haut - sans.central) / sans.central);
});

test('confiance : marche peu documente, annonces, hypotheses', () => {
  const peu = estimer({ bien: { type: 'Maison', surface: 100 }, base: base({ n: 12 }) });
  assert.equal(peu.confiance, 'indicative');
  const ann = estimer({ bien: { type: 'Maison', surface: 100, annee: 2015, etat: 'renove', extras: ['piscine'] }, base: base({ source: 'annonces', n: 20 }) });
  assert.equal(ann.confiance, 'faible');
  const voisins = estimer({ bien: { type: 'Appartement', surface: 60 }, base: base(), voisins: Array(10).fill(2000) });
  assert.equal(voisins.confiance, 'bonne');
});

test('entrees invalides et arrondi', () => {
  assert.equal(estimer({ bien: { type: 'Maison', surface: 0 }, base: base() }).ok, false);
  assert.equal(estimer({ bien: { type: 'Maison', surface: 80 }, base: null }).ok, false);
  assert.equal(arrondir(187450), 187000);
  assert.equal(arrondir(187550), 188000);
});
