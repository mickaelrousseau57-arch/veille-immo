import test from 'node:test';
import assert from 'node:assert/strict';
import { preparer, rechercher } from '../js/search.js';
import { liensRecherche } from '../js/portals.js';
import { toNumber, norm } from '../js/util.js';

const rows = [
  ['54395', 'Nancy', '54', '54000 54100', 48.6881, 6.1734, 103671, 0],
  ['57463', 'Metz', '57', '57000 57050 57070', 49.1048, 6.1962, 122572, 0],
  ['75056', 'Paris', '75', '75001 75002 75116', 48.8589, 2.347, 2103778, 1],
  ['75111', 'Paris 11e Arrondissement', '75', '75011', 48.859, 2.38, 150000, 2],
  ['42218', 'Saint-Étienne', '42', '42000 42100', 45.43, 4.39, 172000, 0],
  ['76540', 'Rouen', '76', '76000 76100', 49.44, 1.09, 114000, 0],
  ['54001', 'Nancy-les-Bains', '54', '54500', 48.6, 6.2, 800, 0],
];
const idx = preparer(rows);

test('recherche par nom, sans accent ni tiret', () => {
  assert.equal(rechercher(idx, 'saint etienne')[0].insee, '42218');
  assert.equal(rechercher(idx, 'ST-ETIENNE').length, 0);
  assert.equal(rechercher(idx, 'Saint-Étienne')[0].nom, 'Saint-Étienne');
});

test('recherche : la plus peuplee d\'abord, nom exact prioritaire', () => {
  const r = rechercher(idx, 'nancy');
  assert.equal(r[0].insee, '54395');
  assert.equal(r.length, 2);
});

test('recherche par code postal complet et partiel', () => {
  assert.equal(rechercher(idx, '57050')[0].insee, '57463');
  assert.equal(rechercher(idx, '75011')[0].insee, '75111'); // arrondissement avant la ville
  assert.ok(rechercher(idx, '540').some((c) => c.insee === '54395'));
});

test('recherche : departement en fin de requete', () => {
  assert.deepEqual(rechercher(idx, 'nancy 54').map((c) => c.insee), ['54395', '54001']);
  assert.equal(rechercher(idx, 'nancy 57').length, 0);
});

test('recherche : requete trop courte', () => {
  assert.deepEqual(rechercher(idx, 'n'), []);
});

test('liens vers les sites d\'annonces', () => {
  const l = liensRecherche({ nom: 'Saint-Étienne', cps: ['42000'], lat: 45.43, lon: 4.39 }, 'achat');
  const bienici = l.find((x) => x.id === 'bienici');
  assert.equal(bienici.url, 'https://www.bienici.com/recherche/achat/saint-etienne-42000');
  assert.ok(l.find((x) => x.id === 'leboncoin').url.includes('category=9'));
  assert.equal(l.find((x) => x.id === 'seloger').direct, false);
  assert.ok(liensRecherche({ nom: 'X', cps: ['01000'], lat: 1, lon: 2 }, 'location').find((x) => x.id === 'leboncoin').url.includes('category=10'));
});

test('toNumber : formats francais', () => {
  assert.equal(toNumber('250 000'), 250000);
  assert.equal(toNumber('1.250,50 €'), 1250.5);
  assert.equal(toNumber('3,5'), 3.5);
  assert.equal(toNumber('250.000'), 250000);
  assert.equal(toNumber(''), null);
  assert.equal(toNumber('abc'), null);
  assert.equal(norm('Été-à l\'Île'), 'ete a l ile');
});
