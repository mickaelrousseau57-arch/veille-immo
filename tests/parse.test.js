import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAnnonce, portailDe } from '../js/parse.js';

test('vente : appartement avec prix, surface, pieces, DPE et code postal', () => {
  const a = parseAnnonce(`Appartement 3 pièces 64 m² à vendre
189 000 €
2 953 €/m²
Nancy 54000
Classe énergie : D
2ème étage avec ascenseur, balcon et cave
https://www.leboncoin.fr/ad/ventes_immobilieres/1234567890`);
  assert.equal(a.mode, 'vente');
  assert.equal(a.type, 'Appartement');
  assert.equal(a.prix, 189000);
  assert.equal(a.surface, 64);
  assert.equal(a.pieces, 3);
  assert.equal(a.dpe, 'D');
  assert.equal(a.cp, '54000');
  assert.equal(a.etage, 2);
  assert.equal(a.portail, 'Leboncoin');
  assert.deepEqual(a.extras.sort(), ['ascenseur', 'balcon', 'cave']);
});

test('vente : espaces insecables, maison et terrain', () => {
  const a = parseAnnonce('Maison à vendre 5 pièces 110 m²\nTerrain de 450 m²\nPrix : 285 000 €\nMetz (57000)\nDPE E');
  assert.equal(a.type, 'Maison');
  assert.equal(a.prix, 285000);
  assert.equal(a.surface, 110);
  assert.equal(a.terrain, 450);
  assert.equal(a.pieces, 5);
  assert.equal(a.cp, '57000');
  assert.equal(a.dpe, 'E');
});

test('location : loyer charges comprises', () => {
  const a = parseAnnonce('Studio à louer 24 m²\nLoyer 520 € CC par mois\nStrasbourg 67000');
  assert.equal(a.mode, 'location');
  assert.equal(a.prix, 520);
  assert.equal(a.surface, 24);
  assert.equal(a.pieces, 1);
  assert.equal(a.type, 'Appartement');
});

test('un prix au m2 n\'est pas pris pour le prix', () => {
  const a = parseAnnonce('Appartement 50 m² 3 200 €/m² 160 000 €');
  assert.equal(a.prix, 160000);
});

test('texte vide ou sans information', () => {
  const a = parseAnnonce('');
  assert.equal(a.prix, null);
  assert.equal(a.surface, null);
  const b = parseAnnonce('Belle vue, calme et lumineux');
  assert.equal(b.prix, null);
  assert.equal(b.cp, null);
});

test('portailDe', () => {
  assert.equal(portailDe('https://www.seloger.com/annonces/achat/appartement/x.htm'), 'SeLoger');
  assert.equal(portailDe('https://exemple.org/a'), 'exemple.org');
  assert.equal(portailDe('pas une url'), null);
});

test('location : loyer ecrit "850 EUR/mois"', () => {
  const a = parseAnnonce('Appartement 2 pièces 41 m²\n850 €/mois\nMetz 57000');
  assert.equal(a.mode, 'location');
  assert.equal(a.prix, 850);
  const b = parseAnnonce('T2 41 m² 850 € par mois Metz 57000');
  assert.equal(b.prix, 850);
});

test('surface : un mot-cle sur la ligne precedente ne l\'exclut pas', () => {
  const a = parseAnnonce('Maison avec jardin\n110 m² · 5 pièces\nLaxou 54520\n285 000 €');
  assert.equal(a.surface, 110);
  const b = parseAnnonce('Appartement 60 m² avec balcon de 8 m²\n150 000 €');
  assert.equal(b.surface, 60);
});

test('lien seul (partage depuis un site) : mode, code postal et portail lus dans l\'adresse', () => {
  const a = parseAnnonce('https://www.seloger.com/annonce/achat/grand-est/moselle-57/cattenom-57570/26MIPYCFIPGU?utm=x');
  assert.equal(a.mode, 'vente');
  assert.equal(a.cp, '57570');
  assert.equal(a.portail, 'SeLoger');
  assert.equal(a.prix, null);
  assert.equal(a.surface, null);
});

test('lien : type et nombre de pieces lus dans le chemin', () => {
  const a = parseAnnonce('https://www.bienici.com/annonce/vente/metz/appartement/3pieces/abc123');
  assert.equal(a.type, 'Appartement');
  assert.equal(a.pieces, 3);
  const b = parseAnnonce('https://exemple.fr/annonce/location-maison-t5-nancy-54000-r1');
  assert.equal(b.mode, 'location');
  assert.equal(b.type, 'Maison');
  assert.equal(b.pieces, 5);
});

test('"à louer" et "à vendre" reconnus meme precedes d\'un espace', () => {
  assert.equal(parseAnnonce('Studio à louer 24 m² 520 €').mode, 'location');
  assert.equal(parseAnnonce('Maison à vendre 100 m² 250 000 €').mode, 'vente');
});
