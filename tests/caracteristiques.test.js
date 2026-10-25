import test from 'node:test';
import assert from 'node:assert/strict';
import { extraireCaracteristiques, resume, champsDe } from '../js/caracteristiques.js';
import { parseAnnonce } from '../js/parse.js';

const MAISON = `Maison 6 pièces 142 m² à vendre à Cattenom (57570)
Prix : 329 000 €
Belle maison familiale construite en 1978, entièrement rénovée en 2019.
4 chambres, 2 salles de bain, séjour avec cheminée, cuisine équipée.
Terrain de 650 m² avec jardin arboré et piscine chauffée. Garage double.
Chauffage individuel au gaz. Classe énergie : D. GES : E
Taxe foncière : 1 450 €
Proche piscine municipale, sans vis-à-vis.`;

const APPART = `Appartement 3 pièces 64 m² à vendre à Nancy 54000
189 000 €
2ème étage sur 5 avec ascenseur, sans balcon. Immeuble de 1930, bon état.
2 chambres, 1 salle d'eau. Cave. Charges de copropriété : 1 800 € par an.`;

test('maison : toutes les caracteristiques', () => {
  const a = parseAnnonce(MAISON);
  assert.equal(a.type, 'Maison');
  assert.equal(a.prix, 329000);
  assert.equal(a.surface, 142);
  assert.equal(a.pieces, 6);
  assert.equal(a.chambres, 4);
  assert.equal(a.sdb, 2);
  assert.equal(a.annee, 1978);
  assert.equal(a.etat, 'renove');
  assert.equal(a.terrain, 650);
  assert.equal(a.chauffage, 'gaz');
  assert.equal(a.dpe, 'D');
  assert.equal(a.ges, 'E');
  assert.equal(a.taxeFonciere, 1450);
  assert.deepEqual([...a.extras].sort(), ['cheminee', 'garage', 'jardin', 'piscine']);
});

test('appartement : etage, ascenseur, negations, charges annuelles', () => {
  const a = parseAnnonce(APPART);
  assert.equal(a.etage, 2);
  assert.equal(a.etagesTotal, 5);
  assert.equal(a.annee, 1930);
  assert.equal(a.etat, 'bon');
  assert.equal(a.chambres, 2);
  assert.equal(a.sdb, 1);
  assert.equal(a.chargesAn, 1800);
  assert.deepEqual([...a.extras].sort(), ['ascenseur', 'cave']); // "sans balcon" n'est pas un balcon
});

test('negations et voisinage : sans jardin, pas de piscine, proche jardin public', () => {
  const c = extraireCaracteristiques('Appartement sans jardin. Pas de piscine. Proche jardin public et piscine municipale. Sans ascenseur.');
  assert.deepEqual(c.extras, []);
  const d = extraireCaracteristiques('Appartement avec jardin privatif et piscine dans la résidence. Ascenseur.');
  assert.deepEqual([...d.extras].sort(), ['ascenseur', 'jardin', 'piscine']);
});

test('etat : a renover l\'emporte sur renove, refait a neuf est renove', () => {
  assert.equal(extraireCaracteristiques('Maison à rénover entièrement, cuisine rénovée').etat, 'travaux');
  assert.equal(extraireCaracteristiques('Appartement refait à neuf').etat, 'renove');
  assert.equal(extraireCaracteristiques('Programme neuf, livraison 2027').etat, 'neuf');
  assert.equal(extraireCaracteristiques('Rien de particulier').etat, null);
});

test('annee de construction : formulations courantes et bornes', () => {
  assert.equal(extraireCaracteristiques('Année de construction : 1965').annee, 1965);
  assert.equal(extraireCaracteristiques('bâti en 1850').annee, 1850);
  assert.equal(extraireCaracteristiques('Construction 2012').annee, 2012);
  assert.equal(extraireCaracteristiques('Livré en 2031 construit en 3000').annee, null);
});

test('location : meuble, pas de charges de copropriete', () => {
  const c = extraireCaracteristiques('Studio meublé 22 m². Charges 40 € par mois.', 'location');
  assert.deepEqual(c.extras, ['meuble']);
  assert.equal(c.chargesAn, null);
  assert.deepEqual(extraireCaracteristiques('Studio non meublé', 'location').extras, []);
});

test('charges mensuelles converties en annee, chauffage collectif', () => {
  const c = extraireCaracteristiques('Charges de copropriété 150 € par mois. Chauffage collectif.');
  assert.equal(c.chargesAn, 1800);
  assert.equal(c.chauffage, 'collectif');
});

test('resume et champs conserves', () => {
  const a = parseAnnonce(MAISON);
  assert.deepEqual(resume(a), ['4 ch.', '1978', 'Rénové', 'jardin', 'piscine', 'garage', 'cheminée']);
  const c = champsDe({ chambres: 3 });
  assert.equal(c.chambres, 3);
  assert.equal(c.annee, null);
  assert.deepEqual(c.extras, []);
});
