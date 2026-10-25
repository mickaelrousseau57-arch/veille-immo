import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { filtrer, trier, categorie, communesDe, nombreFiltres, FILTRES_VIDES } = await import('../js/filtres.js');

const A = (id, o) => ({ id, mode: 'vente', type: 'Appartement', prix: 100000, surface: 50, communeNom: 'Nancy', creeLe: '2026-10-01', extras: [], historique: [{ prix: o.prix || 100000 }], ...o });
const liste = [
  A('a', { prix: 120000, surface: 60, communeNom: 'Metz', pieces: 3, chambres: 2, annee: 1975, dpe: 'C', extras: ['jardin', 'cave'], creeLe: '2026-10-03' }),
  A('b', { prix: 200000, surface: 100, type: 'Maison', communeNom: 'Laxou', pieces: 5, chambres: 4, annee: 2010, dpe: 'F', extras: ['jardin', 'piscine'], creeLe: '2026-10-02', titre: 'Belle maison familiale' }),
  A('c', { prix: 90000, surface: 45, communeNom: 'Nancy', pieces: 2, chambres: 1, dpe: 'B', creeLe: '2026-10-05' }),
  A('d', { mode: 'location', prix: 700, surface: 40, communeNom: 'Metz', pieces: 2, creeLe: '2026-10-04', note: 'à visiter samedi' }),
  A('e', { prix: 150000, surface: 70, communeNom: 'Nancy', creeLe: '2026-10-06' }),
];
const ev = (ecart, id) => ({ ok: true, ecart, verdict: { id } });
const evals = new Map([['a', ev(-12, 'bon')], ['b', ev(20, 'cher')], ['c', ev(2, 'marche')], ['d', ev(-30, 'tresBas')]]); // e : non evalue
const ids = (l) => l.map((x) => x.id).join('');
const F = (o) => ({ ...FILTRES_VIDES, ...o });

test('categorie de verdict', () => {
  assert.equal(categorie(evals.get('a')), 'bonne');
  assert.equal(categorie(evals.get('d')), 'bonne');
  assert.equal(categorie(evals.get('c')), 'marche');
  assert.equal(categorie(evals.get('b')), 'chere');
  assert.equal(categorie(undefined), 'inconnue');
  assert.equal(categorie({ ok: false }), 'inconnue');
});

test('tri par bonne affaire : non evaluees toujours en fin', () => {
  assert.equal(ids(trier(liste, 'ecart', evals)), 'dacbe');
  assert.equal(ids(trier(liste, 'ecartDesc', evals)), 'bcade');
});

test('tri par commune puis par ecart, prix, surface, recents', () => {
  assert.equal(ids(trier(liste, 'commune', evals)), 'bdace'); // Laxou, Metz (d puis a), Nancy (c puis e non evaluee)
  assert.equal(ids(trier(liste, 'prixAsc', evals)), 'dcaeb');
  assert.equal(ids(trier(liste, 'prixDesc', evals)), 'beacd');
  assert.equal(ids(trier(liste, 'surfaceDesc', evals)), 'beacd');
  assert.equal(ids(trier(liste, 'recent', evals)), 'ecdab');
});

test('tri par annee : inconnues en fin', () => {
  assert.equal(ids(trier(liste, 'anneeDesc', evals)).slice(0, 2), 'ba');
});

test('filtres : type, mode, communes, verdict', () => {
  assert.equal(ids(filtrer(liste, F({ type: 'Maison' }), evals)), 'b');
  assert.equal(ids(filtrer(liste, F({ mode: 'location' }), evals)), 'd');
  assert.equal(ids(filtrer(liste, F({ communes: ['Metz', 'Laxou'] }), evals)), 'abd');
  assert.equal(ids(filtrer(liste, F({ verdict: 'bonne' }), evals)), 'ad');
  assert.equal(ids(filtrer(liste, F({ verdict: 'inconnue' }), evals)), 'e');
});

test('filtres numeriques : les valeurs inconnues sont exclues', () => {
  assert.equal(ids(filtrer(liste, F({ prixMax: '125 000', mode: 'vente' }), evals)), 'ac');
  assert.equal(ids(filtrer(liste, F({ surfaceMin: '60' }), evals)), 'abe');
  assert.equal(ids(filtrer(liste, F({ piecesMin: '3' }), evals)), 'ab');
  assert.equal(ids(filtrer(liste, F({ chambresMin: '2' }), evals)), 'ab');
  assert.equal(ids(filtrer(liste, F({ anneeMin: '2000' }), evals)), 'b');
  assert.equal(ids(filtrer(liste, F({ dpeMax: 'C' }), evals)), 'ac'); // DPE C ou mieux ; f et inconnus exclus
});

test('filtre equipements : tous requis', () => {
  assert.equal(ids(filtrer(liste, F({ equip: ['jardin'] }), evals)), 'ab');
  assert.equal(ids(filtrer(liste, F({ equip: ['jardin', 'piscine'] }), evals)), 'b');
  assert.equal(ids(filtrer(liste, F({ equip: ['garage'] }), evals)), '');
});

test('recherche de texte sans accent ni casse', () => {
  assert.equal(ids(filtrer(liste, F({ texte: 'FAMILIALE' }), evals)), 'b');
  assert.equal(ids(filtrer(liste, F({ texte: 'a visiter' }), evals)), 'd');
});

test('communes presentes et nombre de filtres actifs', () => {
  assert.deepEqual(communesDe(liste), [{ nom: 'Laxou', n: 1 }, { nom: 'Metz', n: 2 }, { nom: 'Nancy', n: 2 }]);
  assert.equal(nombreFiltres(FILTRES_VIDES), 0);
  assert.equal(nombreFiltres(F({ type: 'Maison', equip: ['jardin'], communes: ['Metz'], prixMax: '1' })), 4);
});
