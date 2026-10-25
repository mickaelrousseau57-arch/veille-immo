import test from 'node:test';
import assert from 'node:assert/strict';
import { chiffrer, dechiffrer, instantaneLocal, remplacerLocal, depotValide, envoyer, recuperer, versB64, depuisB64 } from '../js/sync.js';

const faux = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { get length() { return m.size; }, key: (i) => Array.from(m.keys())[i], getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};

test('chiffrer puis dechiffrer redonne les donnees, y compris accents et euros', async () => {
  const d = { 'immo.annonces': '[{"titre":"Maison à Cattenom","prix":"250 000 €"}]' };
  const t = await chiffrer(d, 'phrase secrete', '2026-10-25T10:00:00.000Z');
  assert.ok(!t.includes('Cattenom'));
  const r = await dechiffrer(t, 'phrase secrete');
  assert.deepEqual(r.donnees, d);
  assert.equal(r.maj, '2026-10-25T10:00:00.000Z');
});

test('mauvaise phrase secrete : erreur claire', async () => {
  const t = await chiffrer({ a: 1 }, 'bonne');
  await assert.rejects(() => dechiffrer(t, 'mauvaise'), /Phrase secrète incorrecte/);
  await assert.rejects(() => dechiffrer('pas du json', 'x'), /illisible/);
});

test('deux chiffrements du meme contenu different (sel et iv aleatoires)', async () => {
  const a = await chiffrer({ a: 1 }, 'p');
  const b = await chiffrer({ a: 1 }, 'p');
  assert.notEqual(JSON.parse(a).data, JSON.parse(b).data);
});

test('instantane : uniquement immo.*, sans theme ni identifiants de synchronisation', () => {
  const s = faux({ 'immo.annonces': '[]', 'immo.theme': 'sombre', 'immo.sync': '{"token":"x"}', autre: '1' });
  assert.deepEqual(instantaneLocal(s), { 'immo.annonces': '[]' });
});

test('remplacerLocal : remplace, garde theme et identifiants, rend l\'ancien etat', () => {
  const s = faux({ 'immo.annonces': '[1]', 'immo.vieux': 'x', 'immo.theme': 'sombre', 'immo.sync': 'cle' });
  const avant = remplacerLocal({ 'immo.annonces': '[2]', 'immo.nouveau': 'y', 'immo.theme': 'clair', 'immo.sync': 'pirate', hors: 'z' }, s);
  assert.deepEqual(avant, { 'immo.annonces': '[1]', 'immo.vieux': 'x' });
  assert.equal(s.getItem('immo.annonces'), '[2]');
  assert.equal(s.getItem('immo.vieux'), null);
  assert.equal(s.getItem('immo.nouveau'), 'y');
  assert.equal(s.getItem('immo.theme'), 'sombre');
  assert.equal(s.getItem('immo.sync'), 'cle');
  assert.equal(s.getItem('hors'), null);
});

test('depotValide', () => {
  assert.ok(depotValide('mickael/mon-depot'));
  assert.ok(!depotValide('mickael'));
  assert.ok(!depotValide('a/b/c'));
  assert.ok(!depotValide('https://github.com/a/b'));
});

test('envoyer puis recuperer via un faux GitHub', async () => {
  const globalLocal = globalThis.localStorage;
  globalThis.localStorage = faux({ 'immo.annonces': '[{"titre":"é"}]' });
  let fichier = null; let sha = 0;
  const f = async (url, o = {}) => {
    const rep = (status, corps) => ({ status, ok: status >= 200 && status < 300, json: async () => corps, text: async () => corps });
    if (o.method === 'PUT') {
      const b = JSON.parse(o.body);
      if (fichier && b.sha !== String(sha)) return rep(409, '');
      fichier = new TextDecoder().decode(depuisB64(b.content)); sha += 1;
      return rep(201, {});
    }
    if (url.endsWith('/contents/sauvegarde-veille-immo.json')) return fichier ? rep(200, { sha: String(sha), content: versB64(new TextEncoder().encode(fichier)) }) : rep(404, {});
    return rep(200, {});
  };
  const reg = { depot: 'a/b', token: 't' };
  assert.equal(await recuperer(reg, 'p', f), null);
  await envoyer(reg, 'p', f);
  await envoyer(reg, 'p', f);
  const r = await recuperer(reg, 'p', f);
  assert.deepEqual(r.donnees, { 'immo.annonces': '[{"titre":"é"}]' });
  globalThis.localStorage = globalLocal;
});
