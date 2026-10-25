import test from 'node:test';
import assert from 'node:assert/strict';
import { mensualite, tauxPourDuree, simuler, capacite, amortissement, rendement } from '../js/credit.js';

const proche = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b}`);

test('mensualite : 200 000 EUR a 3 % sur 20 ans', () => {
  proche(mensualite(200000, 3, 20), 1109.20, 0.01);
});

test('mensualite : taux nul', () => {
  proche(mensualite(120000, 0, 10), 1000);
});

test('mensualite : capital ou duree nuls', () => {
  assert.equal(mensualite(0, 3, 20), 0);
  assert.equal(mensualite(100000, 3, 0), 0);
});

test('tauxPourDuree : interpolation et extrapolation', () => {
  const t = [{ duree: 15, taux: 3.0 }, { duree: 20, taux: 3.2 }, { duree: 25, taux: 3.4 }];
  assert.equal(tauxPourDuree(t, 20), 3.2);
  assert.equal(tauxPourDuree(t, 17.5), 3.1);
  assert.equal(tauxPourDuree(t, 30), 3.6);
  assert.equal(tauxPourDuree(t, 10), 2.8);
});

test('simuler : frais, capital et cout du credit', () => {
  const s = simuler({ prix: 200000, fraisNotairePct: 8, apport: 20000, tauxPct: 3, dureeAns: 20, assurancePct: 0.3 });
  proche(s.fraisNotaire, 16000);
  proche(s.capital, 196000);
  proche(s.mensualite, 196000 * mensualite(1, 3, 20), 0.01);
  proche(s.assurance, 196000 * 0.003 / 12);
  proche(s.interets, s.mensualite * 240 - 196000, 0.01);
  assert.equal(s.apportCouvreFrais, true);
});

test('simuler : un apport superieur au cout donne un capital nul', () => {
  const s = simuler({ prix: 100000, apport: 500000, tauxPct: 3, dureeAns: 20 });
  assert.equal(s.capital, 0);
  assert.equal(s.mensualite, 0);
});

test('capacite : respecte le taux d\'endettement, assurance comprise', () => {
  const c = capacite({ revenus: 4000, charges: 0, apport: 30000, tauxPct: 3.3, dureeAns: 25, assurancePct: 0.3, fraisNotairePct: 7.5 });
  proche(c.mensualiteMax, 1400);
  const s = simuler({ prix: c.prixMax, fraisNotairePct: 7.5, apport: 30000, tauxPct: 3.3, dureeAns: 25, assurancePct: 0.3 });
  proche(s.mensualiteTotale, 1400, 0.5);
});

test('capacite : des charges superieures a la marge donnent zero', () => {
  const c = capacite({ revenus: 2000, charges: 900, tauxPct: 3, dureeAns: 20 });
  assert.equal(c.capital, 0);
  assert.equal(c.mensualiteMax, 0);
});

test('amortissement : le capital rembourse total egale le capital emprunte', () => {
  const rows = amortissement(150000, 3.2, 20);
  assert.equal(rows.length, 20);
  proche(rows.reduce((s, r) => s + r.rembourse, 0), 150000, 0.01);
  proche(rows[rows.length - 1].restant, 0, 0.01);
  assert.ok(rows[0].interets > rows[19].interets);
});

test('rendement : brut et net', () => {
  const r = rendement({ prix: 100000, fraisNotairePct: 8, loyerMensuel: 500, charges: 600, taxeFonciere: 700, vacancePct: 5, gestionPct: 0, pno: 100 });
  proche(r.brut, 6);
  // revenu annuel 6000 - 5 % de vacance = 5700 ; moins 600 + 700 + 100 = 4300 ; sur 108 000 de cout total
  proche(r.revenuNet, 4300);
  proche(r.net, (4300 / 108000) * 100, 0.001);
});
