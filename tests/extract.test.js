import test from 'node:test';
import assert from 'node:assert/strict';
import { cumuler, codeMarquePage } from '../js/extract.js';

const a = (n) => ({ url: 'https://s.fr/a/' + n, text: n + ' 100 000 € 50 m²' });

test('cumuler : ajoute les nouvelles annonces et ne double pas les deja vues', () => {
  const p1 = cumuler(null, [a(1), a(2)], 1000);
  assert.equal(p1.items.length, 2);
  assert.equal(p1.nouvelles, 2);
  const p2 = cumuler({ t: 1000, items: p1.items }, [a(2), a(3)], 2000);
  assert.deepEqual(p2.items.map((x) => x.url.slice(-1)), ['1', '2', '3']);
  assert.equal(p2.nouvelles, 1);
  assert.equal(p2.dejaVues, 1);
});

test('cumuler : un cumul de plus de 30 minutes est ignore', () => {
  const r = cumuler({ t: 0, items: [a(1)] }, [a(2)], 31 * 60 * 1000);
  assert.deepEqual(r.items.map((x) => x.url.slice(-1)), ['2']);
  assert.equal(r.avant, 0);
});

test('cumuler : plafonne a 600 en gardant les plus recentes', () => {
  const beaucoup = Array.from({ length: 700 }, (_, i) => a(i));
  const r = cumuler(null, beaucoup, 1);
  assert.equal(r.items.length, 600);
  assert.equal(r.items[599].url, 'https://s.fr/a/699');
});

test('le marque-page est un code autonome qui contient le cumul', () => {
  const code = decodeURIComponent(codeMarquePage().slice('javascript:'.length));
  assert.match(code, /immoveille\.cumul/);
  assert.doesNotThrow(() => new Function('return ' + code.replace(/^\(async\(\)=>\{/, '(async()=>{')));
});
