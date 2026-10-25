import test from 'node:test';
import assert from 'node:assert/strict';
import { consigneAlerte, EXEMPLE_BLOC } from '../js/alertes.js';
import { lireCollage, lireAnnonces } from '../js/multi.js';

test('le bloc d\'exemple de la consigne est lisible par l\'application', () => {
  const r = lireCollage(EXEMPLE_BLOC);
  assert.equal(r.via, 'marque-page');
  const l = lireAnnonces(r.items, { mode: 'vente' });
  assert.equal(l.length, 2);
  assert.deepEqual(l.map((a) => a.prix), [139000, 285000]);
  assert.deepEqual(l.map((a) => a.cp), ['54000', '54520']);
});

test('consigne : recherches, criteres, adresse des donnees et garde-fous', () => {
  const t = consigneAlerte({
    base: 'https://exemple.github.io/veille-immo/',
    recherches: [{ nom: 'Nancy', cps: ['54000', '54100'], insee: '54395', dep: '54', mode: 'achat', type: 'Appartement' }, { nom: 'Metz', cps: ['57000'], insee: '57463', dep: '57', mode: 'location', type: '' }],
    portails: ['Leboncoin', 'SeLoger'], heure: 7, budgetMax: 250000, surfaceMin: 40,
  });
  assert.ok(t.includes('Tous les jours à 7 h'));
  assert.ok(t.includes('- Nancy (code postal 54000, 54100, INSEE 54395, département 54) : achat, appartement'));
  assert.ok(t.includes('- Metz (code postal 57000, INSEE 57463, département 57) : location, appartement ou maison'));
  assert.ok(t.includes('Leboncoin, SeLoger'));
  assert.ok(t.includes('budget ou loyer maximum 250000 €'));
  assert.ok(t.includes('https://exemple.github.io/veille-immo/data/prix/54.json'));
  assert.ok(t.includes('ne supprime, n\'archive et ne modifie aucun e-mail'));
  assert.ok(t.includes('ne l\'envoie jamais'));
  assert.ok(t.includes(EXEMPLE_BLOC));
});

test('consigne sans recherche enregistree', () => {
  const t = consigneAlerte({ base: 'https://x.test/', recherches: [] });
  assert.ok(t.includes('aucune recherche enregistrée'));
});
