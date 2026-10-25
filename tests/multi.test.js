import test from 'node:test';
import assert from 'node:assert/strict';
import { decouperTexte, lireCollage, lireAnnonces, memeBien, regrouper, PREFIXE } from '../js/multi.js';

const PAGE = `Appartement T3 lumineux
64 m² · 3 pièces
Nancy 54000
189 000 €
2 953 €/m²
Maison avec jardin
110 m² · 5 pièces
Laxou 54520
285 000 €
Studio proche gare
24 m²
Nancy 54000
95 000 €`;

test('decouperTexte : une annonce par prix, prix au m2 ignores', () => {
  const b = decouperTexte(PAGE, 'vente');
  assert.equal(b.length, 3);
  assert.ok(b[0].text.includes('Appartement T3'));
  assert.ok(b[1].text.includes('Laxou'));
  assert.ok(b[2].text.includes('Studio'));
});

test('lireAnnonces : champs extraits de chaque bloc', () => {
  const l = lireAnnonces(decouperTexte(PAGE, 'vente'), { mode: 'vente' });
  assert.equal(l.length, 3);
  assert.deepEqual(l.map((a) => a.prix), [189000, 285000, 95000]);
  assert.deepEqual(l.map((a) => a.surface), [64, 110, 24]);
  assert.deepEqual(l.map((a) => a.cp), ['54000', '54520', '54000']);
  assert.equal(l[1].type, 'Maison');
  assert.ok(l.every((a) => a.complete));
});

test('mode location : seuls les montants de loyer comptent', () => {
  const t = `Studio 22 m²\nNancy 54000\n540 €/mois\nT2 40 m²\nNancy 54000\n690 € CC`;
  const l = lireAnnonces(decouperTexte(t, 'location'), { mode: 'location' });
  assert.deepEqual(l.map((a) => a.prix), [540, 690]);
});

test('lireCollage : export du marque-page', () => {
  const json = PREFIXE + JSON.stringify({ v: 1, page: 'https://www.seloger.com/x', items: [{ url: 'https://www.seloger.com/a1', text: 'Appartement 50 m² 150 000 € 54000' }, { url: 'javascript:alert(1)', text: 'Maison 90 m² 200 000 €' }, { nope: 1 }] });
  const r = lireCollage(json);
  assert.equal(r.via, 'marque-page');
  assert.equal(r.items.length, 2);
  assert.equal(r.items[1].url, '');
  assert.equal(r.page, 'https://www.seloger.com/x');
  assert.throws(() => lireCollage(PREFIXE + '{pas du json'), /incomplet/);
});

test('lireCollage : texte brut avec lien de page en premiere ligne', () => {
  const r = lireCollage('https://www.leboncoin.fr/recherche?category=9\n' + PAGE);
  assert.equal(r.via, 'texte');
  assert.equal(r.page, 'https://www.leboncoin.fr/recherche?category=9');
  assert.equal(r.items.length, 3);
});

test('regrouper : la meme annonce sur deux sites devient une seule avec deux sources', () => {
  const a = { mode: 'vente', type: 'Appartement', prix: 189000, surface: 64, pieces: 3, cp: '54000', portail: 'Leboncoin', url: 'https://lbc/1' };
  const b = { mode: 'vente', type: 'Appartement', prix: 186500, surface: 64.5, pieces: null, dpe: 'D', cp: '54000', portail: 'SeLoger', url: 'https://sl/9' };
  const c = { mode: 'vente', type: 'Appartement', prix: 189000, surface: 90, pieces: 4, cp: '54000', portail: 'PAP', url: 'https://pap/3' };
  const g = regrouper([a, b, c]);
  assert.equal(g.length, 2);
  assert.equal(g[0].sources.length, 2);
  assert.equal(g[0].prix, 186500);
  assert.equal(g[0].pieces, 3);
  assert.equal(g[0].dpe, 'D');
});

test('memeBien : criteres', () => {
  const base = { mode: 'vente', type: 'Appartement', prix: 100000, surface: 50, pieces: 2, cp: '54000' };
  assert.equal(memeBien(base, { ...base, prix: 104000 }), false); // plus de 3 % d'ecart
  assert.equal(memeBien(base, { ...base, cp: '54100' }), false);
  assert.equal(memeBien(base, { ...base, pieces: 3 }), false);
  assert.equal(memeBien(base, { ...base, mode: 'location' }), false);
  assert.equal(memeBien(base, { ...base, prix: 102000, surface: 51 }), true);
  assert.equal(memeBien({ ...base, url: 'https://x/1' }, { ...base, prix: 1, surface: 1, url: 'https://x/1' }), true);
});
