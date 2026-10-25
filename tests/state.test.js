import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  get length() { return mem.size; },
  key: (i) => [...mem.keys()][i] ?? null,
};
const { annonces, variationPrix, exporter, importer, recherches, comparateur, versCSV, veilles, remiseAZero, restaurerInstantane } = await import('../js/state.js');

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

test('annonces observees : dedoublonnage, plafond et lecture', async () => {
  mem.clear();
  const { observations } = await import('../js/state.js');
  observations.add('57463', 'a', [{ p: 2000, k: 'u1' }, { p: 2100, k: 'u2' }, { p: 2000, k: 'u1' }, { p: 0, k: 'u3' }]);
  assert.equal(observations.get('57463', 'a').length, 2);
  observations.add('57463', 'a', [{ p: 2200, k: 'u4' }]);
  assert.equal(observations.get('57463', 'a').length, 3);
  assert.equal(observations.get('57463', 'h').length, 0);
  assert.equal(observations.get('54395', 'a').length, 0);
  // une observation trop ancienne est ignoree
  const all = JSON.parse(mem.get('immo.obs'));
  all['57463'].a[0].t = Date.now() - 200 * 86400000;
  mem.set('immo.obs', JSON.stringify(all));
  assert.equal(observations.get('57463', 'a').length, 2);
});

test('import : caracteristiques nettoyees', () => {
  mem.clear();
  const json = JSON.stringify({ app: 'immo-veille', annonces: [{ id: 'k1', prix: 200000, surface: 90, chambres: '3', annee: 1975, etat: 'inconnu', chauffage: 'gaz', ges: 'Z', extras: ['jardin', 'piscine', 'helicoptere'] }] });
  assert.equal(importer(json), 1);
  const a = annonces.list().find((x) => x.id === 'k1');
  assert.equal(a.chambres, 3);
  assert.equal(a.annee, 1975);
  assert.equal(a.etat, null);
  assert.equal(a.chauffage, 'gaz');
  assert.equal(a.ges, null);
  assert.deepEqual(a.extras, ['jardin', 'piscine']);
});

test('veilles : une veille par defaut, creation, renommage, annonce rangee dans la veille ouverte', () => {
  mem.clear();
  assert.equal(veilles.list().length, 1);
  assert.equal(veilles.list()[0].nom, 'Ma veille');
  const metz = veilles.add('  Metz  ');
  assert.equal(metz.nom, 'Metz');
  assert.equal(veilles.add('   ').nom, 'Nouvelle veille');
  veilles.ouvrir(metz.id);
  const a = annonces.add(base);
  assert.equal(a.veilleId, metz.id);
  veilles.renommer(metz.id, 'Metz centre');
  assert.equal(veilles.get(metz.id).nom, 'Metz centre');
  veilles.ouvrir('toutes');
  assert.equal(veilles.pourAjout(), veilles.list()[0].id); // en regardant "toutes", on ajoute dans la premiere veille
  assert.equal(annonces.add({ ...base, veilleId: metz.id }).veilleId, metz.id);
});

test('veilles : les anciennes annonces sans veille appartiennent a la premiere', () => {
  mem.clear();
  annonces.save([{ id: 'v1', prix: 1, surface: 1 }, { id: 'v2', prix: 1, surface: 1, veilleId: 'inconnue' }]);
  const premiere = veilles.list()[0].id;
  assert.equal(veilles.idDe(annonces.list()[0]), premiere);
  assert.equal(veilles.idDe(annonces.list()[1]), premiere);
  assert.deepEqual(veilles.compter(premiere), { annonces: 2, recherches: 0 });
});

test('veilles : deplacer des annonces', () => {
  mem.clear();
  const nancy = veilles.add('Nancy');
  const a = annonces.add(base), b = annonces.add(base);
  veilles.deplacer([a.id], nancy.id);
  assert.equal(veilles.compter(nancy.id).annonces, 1);
  assert.equal(veilles.idDe(annonces.list().find((x) => x.id === b.id)), veilles.list()[0].id);
});

test('veilles : supprimer une veille retire ses annonces et recherches, annulable', () => {
  mem.clear();
  const nancy = veilles.add('Nancy');
  const metz = veilles.add('Metz');
  annonces.add({ ...base, veilleId: nancy.id });
  annonces.add({ ...base, veilleId: nancy.id });
  annonces.add({ ...base, veilleId: metz.id });
  recherches.add({ insee: '54395', nom: 'Nancy', mode: 'achat', type: 'Maison', veilleId: nancy.id });
  veilles.ouvrir(nancy.id);
  const s = veilles.supprimer(nancy.id);
  assert.equal(annonces.list().length, 1);
  assert.equal(recherches.list().length, 0);
  assert.equal(veilles.get(nancy.id), null);
  assert.notEqual(veilles.courante(), nancy.id);
  // la sauvegarde ne contient plus la veille supprimee
  const o = JSON.parse(exporter());
  assert.ok(!o.veilles.some((v) => v.id === nancy.id));
  assert.equal(o.annonces.length, 1);
  veilles.restaurer(s);
  assert.equal(annonces.list().length, 3);
  assert.equal(recherches.list().length, 1);
  assert.equal(veilles.list().findIndex((v) => v.id === nancy.id), 1);
});

test('veilles : supprimer la derniere veille en recree une vide', () => {
  mem.clear();
  const seule = veilles.list()[0];
  annonces.add(base);
  veilles.supprimer(seule.id);
  assert.equal(veilles.list().length, 1);
  assert.equal(annonces.list().length, 0);
});

test('recherches : meme recherche permise dans deux veilles, pas deux fois dans la meme', () => {
  mem.clear();
  const a = veilles.add('A'), b = veilles.add('B');
  const r = { insee: '54395', nom: 'Nancy', mode: 'achat', type: 'Maison' };
  assert.equal(recherches.add({ ...r, veilleId: a.id }), true);
  assert.equal(recherches.add({ ...r, veilleId: a.id }), false);
  assert.equal(recherches.add({ ...r, veilleId: b.id }), true);
});

test('export d\'une seule veille, import : veilles creees et annonces rangees', () => {
  mem.clear();
  const nancy = veilles.add('Nancy');
  annonces.add({ ...base, veilleId: nancy.id });
  annonces.add({ ...base });
  const seule = JSON.parse(exporter(nancy.id));
  assert.equal(seule.veilles.length, 1);
  assert.equal(seule.annonces.length, 1);
  assert.equal(seule.annonces[0].veilleId, nancy.id);
  // restauration sur un appareil vide
  mem.clear();
  assert.equal(importer(JSON.stringify(seule)), 1);
  assert.ok(veilles.list().some((v) => v.nom === 'Nancy'));
  assert.equal(veilles.idDe(annonces.list()[0]), nancy.id);
  // une annonce d'une veille absente du fichier est rangee dans la premiere veille
  mem.clear();
  const o = { app: 'immo-veille', annonces: [{ id: 'z1', prix: 100000, surface: 50, veilleId: 'fantome' }] };
  importer(JSON.stringify(o));
  assert.equal(veilles.idDe(annonces.list()[0]), veilles.list()[0].id);
});

test('remise a zero : veilles ou tout, annulable ; le theme est conserve', () => {
  mem.clear();
  localStorage.setItem('immo.theme', '"dark"');
  localStorage.setItem('immo.reg.credit', '{"prix":1}');
  annonces.add(base);
  const v = veilles.add('X');
  const snap = remiseAZero('veilles');
  assert.equal(annonces.list().length, 0);
  assert.equal(veilles.list().length, 1); // recree par defaut
  assert.equal(localStorage.getItem('immo.reg.credit'), '{"prix":1}'); // les reglages sont conserves
  restaurerInstantane(snap);
  assert.equal(annonces.list().length, 1);
  assert.ok(veilles.get(v.id));
  const snap2 = remiseAZero('tout');
  assert.equal(localStorage.getItem('immo.theme'), '"dark"');
  assert.equal(localStorage.getItem('immo.reg.credit'), null);
  assert.equal(annonces.list().length, 0);
  restaurerInstantane(snap2);
  assert.equal(annonces.list().length, 1);
  assert.equal(localStorage.getItem('immo.reg.credit'), '{"prix":1}');
});
