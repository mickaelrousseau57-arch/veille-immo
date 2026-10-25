import test from 'node:test';
import assert from 'node:assert/strict';
import { choisirStats, percentile, verdictPour, tendance, analyserAchat, analyserLocation, comparables, loyerRef } from '../js/analysis.js';

const bloc = { n: 200, q: [1500, 1900, 2300, 2700, 3100], n3: 600, q3: [1500, 1900, 2300, 2700, 3100], s: 60, y: { 2022: [2100, 100], 2023: [2200, 100], 2024: [2250, 100], 2025: [2300, 200] }, r: { 1: [2700, 50], 3: [2200, 80] } };
const fiche = { a: bloc, l: { a: [12, 9, 16], p: [14, 11, 18], g: [11, 9, 14] } };

test('choisirStats : fenetre 12 mois si assez de ventes', () => {
  const s = choisirStats(bloc);
  assert.equal(s.fenetre, '12 derniers mois');
  assert.equal(s.fiabilite, 'bonne');
  assert.equal(s.mediane, 2300);
});

test('choisirStats : bascule sur 36 mois, puis rien', () => {
  assert.equal(choisirStats({ n: 12, q: [1, 2, 3, 4, 5], n3: 40, q3: [10, 20, 30, 40, 50] }).fenetre, '36 derniers mois');
  assert.equal(choisirStats({ n: 1, q: [1, 2, 3, 4, 5], n3: 2, q3: [1, 2, 3, 4, 5] }), null);
  assert.equal(choisirStats(null), null);
});

test('choisirStats : correction selon le nombre de pieces', () => {
  const s = choisirStats(bloc, 1);
  assert.ok(s.ajustePieces);
  assert.equal(s.mediane, Math.round(2300 * (2700 / 2300)));
  assert.equal(choisirStats(bloc, 2).ajustePieces, null); // pas assez de ventes pour 2 pieces
});

test('percentile : bornes et mediane', () => {
  const q = [1500, 1900, 2300, 2700, 3100];
  assert.equal(percentile(q, 2300), 50);
  assert.equal(percentile(q, 100), 0);
  assert.equal(percentile(q, 99999), 100);
  assert.ok(percentile(q, 2000) > 25 && percentile(q, 2000) < 50);
});

test('verdictPour : seuils', () => {
  assert.equal(verdictPour(-20).id, 'tresBon');
  assert.equal(verdictPour(-10).id, 'bon');
  assert.equal(verdictPour(0).id, 'marche');
  assert.equal(verdictPour(10).id, 'haut');
  assert.equal(verdictPour(20).id, 'cher');
});

test('tendance : 1 an et 3 ans', () => {
  const t = tendance(bloc);
  assert.equal(t.derniere, 2025);
  assert.ok(Math.abs(t.an1 - (2300 / 2250 - 1) * 100) < 1e-9);
  assert.ok(Math.abs(t.an3 - (2300 / 2100 - 1) * 100) < 1e-9);
  assert.equal(tendance({}), null);
});

test('analyserAchat : bien cher', () => {
  const r = analyserAchat({ type: 'Appartement', prix: 200000, surface: 60, pieces: 3 }, fiche);
  assert.equal(r.ok, true);
  assert.ok(Math.abs(r.ppm2 - 3333.33) < 0.01);
  assert.equal(r.verdict.id, 'cher');
  assert.ok(r.cible < 200000);
  assert.ok(r.rendementBrut > 0);
  assert.equal(r.loyerRef[0], 11); // 3 pieces : loyer de reference 3 pieces et plus
});

test('analyserAchat : bonne affaire et alerte DPE', () => {
  const r = analyserAchat({ type: 'Appartement', prix: 100000, surface: 60, pieces: 3, dpe: 'G' }, fiche);
  assert.equal(r.verdict.id, 'tresBon');
  assert.ok(r.alertes.some((a) => /G/.test(a.texte)));
  assert.ok(r.score > 80);
});

test('analyserAchat : donnees insuffisantes ou saisie incomplete', () => {
  assert.equal(analyserAchat({ type: 'Maison', prix: 200000, surface: 100 }, fiche).ok, false);
  assert.match(analyserAchat({ type: 'Maison', prix: 0, surface: 100 }, fiche).erreur, /nécessaires/);
});

test('analyserLocation : verdicts', () => {
  assert.equal(analyserLocation({ type: 'Appartement', loyer: 700, surface: 50, pieces: 2 }, fiche).verdict.id, 'marche'); // 14 EUR/m2
  assert.equal(analyserLocation({ type: 'Appartement', loyer: 1000, surface: 50, pieces: 2 }, fiche).verdict.id, 'tresHaut'); // 20 EUR/m2
  assert.equal(analyserLocation({ type: 'Appartement', loyer: 400, surface: 50, pieces: 2 }, fiche).verdict.id, 'tresBas'); // 8 EUR/m2
  assert.equal(analyserLocation({ type: 'Maison', loyer: 900, surface: 80 }, fiche).ok, false);
});

test('loyerRef : choix selon la taille', () => {
  assert.equal(loyerRef(fiche.l, 'Appartement', 1)[0], 14);
  assert.equal(loyerRef(fiche.l, 'Appartement', 4)[0], 11);
  assert.equal(loyerRef(fiche.l, 'Appartement', null)[0], 12);
  assert.equal(loyerRef(fiche.l, 'Maison', 4), null);
});

test('comparables : filtre par type, surface, pieces et trie par proximite', () => {
  const v = [
    ['2025-06-01', 150000, 60, 3, 0, 48.7, 6.2, '1 Rue A', '54000', 0],
    ['2025-06-02', 90000, 30, 1, 0, 48.7, 6.2, '2 Rue B', '54000', 0],
    ['2025-06-03', 300000, 62, 3, 1, 48.7, 6.2, '3 Rue C', '54000', 0],
    ['2025-06-04', 160000, 66, 3, 0, 48.7, 6.2, '4 Rue D', '54000', 0],
  ];
  const c = comparables(v, { type: 'Appartement', surface: 60, pieces: 3, lat: 48.7, lon: 6.2 });
  assert.equal(c.length, 2);
  assert.equal(c[0].adresse, '1 Rue A');
  assert.equal(c[0].ppm2, 2500);
});
