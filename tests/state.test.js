import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
};
const { annonces, variationPrix, exporter, importer, recherches, comparateur, versCSV } = await import('../js/state.js');

const base = { mode: 'vente', type: 'Appartement', prix: 200000, surface: 50, insee: '54395', communeNom: 'Nancy', dep: '54', cp: '54000' };

test('ajout, changement de prix et variation', () => {
  mem.clear();
  const a = annonces.add(base);
  assert.equal(annonces.list().length, 1);
  assert.equal(variationPrix(annonces.list()[0]), null);
  annonces.changerPrix(a.id, 190000);
  const b = annonces.list()[0];
  assert.equal(b.prix, 190000);
  assert.equal(b.historique.length, 2);
  assert.ok(Math.abs(variationPrix(b) + 5) < 1e-9);
  annonces.changerPrix(a.id, 190000); // meme prix : pas de nouvelle ligne d'historique
  assert.equal(annonces.list()[0].historique.length, 2);
  annonces.changerPrix(a.id, -5);
  assert.equal(annonces.list()[0].prix, 190000);
});

test('suppression', () => {
  mem.clear();
  const a = annonces.add(base);
  annonces.remove(a.id);
  assert.equal(annonces.list().length, 0);
});

test('export puis import : pas de doublon, champs nettoyes', () => {
  mem.clear();
  const a = annonces.add(base);
  const json = exporter();
  assert.equal(importer(json), 0); // deja presente
  const o = JSON.parse(json);
  o.annonces.push({ id: 'x1', prix: '150 000', surface: 40, mode: 'bizarre', type: 'Chateau', url: 'javascript:alert(1)', dpe: 'Z', statut: 'inconnu', titre: '<b>x</b>'.repeat(100) });
  o.annonces.push({ id: 'x2', prix: 0 }); // prix invalide : ignoree
  assert.equal(importer(JSON.stringify(o)), 1);
  const x = annonces.list().find((l) => l.id === 'x1');
  assert.equal(x.prix, 150000);
  assert.equal(x.mode, 'vente');
  assert.equal(x.type, 'Appartement');
  assert.equal(x.url, '');
  assert.equal(x.dpe, null);
  assert.equal(x.statut, 'avoir');
  assert.ok(x.titre.length <= 200);
  assert.ok(annonces.list().some((l) => l.id === a.id));
});

test('import : fichier invalide', () => {
  assert.throws(() => importer('pas du json'), /illisible/);
  assert.throws(() => importer(JSON.stringify({ app: 'autre' })), /pas une sauvegarde/);
});

test('recherches et comparateur : doublons et limite', () => {
  mem.clear();
  recherches.add({ insee: '54395', nom: 'Nancy', mode: 'achat', type: 'Maison' });
  recherches.add({ insee: '54395', nom: 'Nancy', mode: 'achat', type: 'Maison' });
  assert.equal(recherches.list().length, 1);
  for (let i = 0; i < 6; i++) comparateur.add({ insee: String(i), nom: 'V' + i });
  assert.equal(comparateur.list().length, 4);
  assert.equal(comparateur.add({ insee: '0', nom: 'V0' }), false);
});

test('CSV : guillemets echappes et BOM', () => {
  const csv = versCSV([['Titre "x"', 'Nancy', '54000', 'Appartement', 1, 2, 3, 4, 5, 6, 'D', 'À voir', '', '', 'a;b']]);
  assert.ok(csv.startsWith('﻿"Titre"'));
  assert.ok(csv.includes('"Titre ""x"""'));
});
