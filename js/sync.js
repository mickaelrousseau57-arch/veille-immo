/* Synchronisation entre appareils : les donnees sont chiffrees dans le navigateur (AES-GCM, cle derivee d'une phrase secrete)
   puis deposees dans un fichier d'un depot GitHub PRIVE de l'utilisateur, via une cle d'acces limitee a ce seul depot.
   Ni la phrase secrete ni les donnees en clair ne quittent l'appareil. */

const FICHIER = 'sauvegarde-veille-immo.json';
const EXCLUS = new Set(['immo.theme', 'immo.sync']);
const ITERATIONS = 250000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export const versB64 = (octets) => { let s = ''; octets.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
export const depuisB64 = (t) => Uint8Array.from(atob(t.replace(/\s/g, '')), (c) => c.charCodeAt(0));

async function cle(phrase, sel) {
  const base = await crypto.subtle.importKey('raw', enc.encode(phrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: sel, iterations: ITERATIONS, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/* Retourne le texte du fichier a deposer. `maj` n'est pas secret : il sert a comparer les versions. */
export async function chiffrer(donnees, phrase, maj = new Date().toISOString()) {
  const sel = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await cle(phrase, sel);
  const clair = enc.encode(JSON.stringify(donnees));
  const chiffre = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, clair));
  return JSON.stringify({ v: 1, maj, iter: ITERATIONS, sel: versB64(sel), iv: versB64(iv), data: versB64(chiffre) });
}

export async function dechiffrer(texte, phrase) {
  let o;
  try { o = JSON.parse(texte); } catch { throw new Error('Fichier de synchronisation illisible.'); }
  if (!o || o.v !== 1 || !o.sel || !o.iv || !o.data) throw new Error('Fichier de synchronisation non reconnu.');
  try {
    const k = await cle(phrase, depuisB64(o.sel));
    const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: depuisB64(o.iv) }, k, depuisB64(o.data));
    return { donnees: JSON.parse(dec.decode(clair)), maj: o.maj || '' };
  } catch { throw new Error('Phrase secrète incorrecte, ou fichier abîmé.'); }
}

/* ---------- Donnees locales ---------- */
export function instantaneLocal(stockage = localStorage) {
  const o = {};
  for (let i = 0; i < stockage.length; i++) {
    const k = stockage.key(i);
    if (k && k.startsWith('immo.') && !EXCLUS.has(k)) o[k] = stockage.getItem(k);
  }
  return o;
}

/* Remplace les donnees locales par `donnees` ; retourne l'ancien instantane pour permettre d'annuler. */
export function remplacerLocal(donnees, stockage = localStorage) {
  const avant = instantaneLocal(stockage);
  Object.keys(avant).forEach((k) => stockage.removeItem(k));
  for (const [k, v] of Object.entries(donnees || {})) {
    if (k.startsWith('immo.') && !EXCLUS.has(k) && typeof v === 'string') stockage.setItem(k, v);
  }
  return avant;
}

/* ---------- Depot GitHub ---------- */
export function depotValide(depot) { return /^[\w.-]+\/[\w.-]+$/.test(String(depot || '').trim()); }

function entetes(token, accept = 'application/vnd.github+json') {
  return { Accept: accept, Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' };
}

function erreurHttp(r) {
  if (r.status === 401) return new Error('Clé d\'accès refusée : vérifiez-la.');
  if (r.status === 403) return new Error('Accès refusé : la clé doit pouvoir lire et écrire le contenu de ce dépôt.');
  if (r.status === 404) return new Error('Dépôt introuvable : vérifiez son nom et que la clé y a accès.');
  return new Error(`GitHub a répondu ${r.status}.`);
}

/* Retourne { sha, texte } ou null si le fichier n'existe pas encore. */
export async function lireDistant({ depot, token }, f = fetch) {
  const url = `https://api.github.com/repos/${depot.trim()}/contents/${FICHIER}`;
  const r = await f(url, { headers: entetes(token), cache: 'no-store' });
  if (r.status === 404) {
    // 404 : soit le fichier manque, soit le depot est inaccessible ; on distingue les deux.
    const d = await f(`https://api.github.com/repos/${depot.trim()}`, { headers: entetes(token), cache: 'no-store' });
    if (d.ok) return null;
    throw erreurHttp(d);
  }
  if (!r.ok) throw erreurHttp(r);
  const meta = await r.json();
  let texte = meta.content ? dec.decode(depuisB64(meta.content)) : '';
  if (!texte) {
    const brut = await f(url, { headers: entetes(token, 'application/vnd.github.raw+json'), cache: 'no-store' });
    if (!brut.ok) throw erreurHttp(brut);
    texte = await brut.text();
  }
  return { sha: meta.sha, texte };
}

export async function ecrireDistant({ depot, token }, texte, sha, f = fetch) {
  const corps = { message: 'Sauvegarde Veille immo', content: versB64(enc.encode(texte)) };
  if (sha) corps.sha = sha;
  const r = await f(`https://api.github.com/repos/${depot.trim()}/contents/${FICHIER}`, { method: 'PUT', headers: { ...entetes(token), 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  if (r.status === 409 || r.status === 422) throw new Error('Le fichier a changé entre-temps (un autre appareil vient d\'envoyer). Récupérez d\'abord, puis renvoyez.');
  if (!r.ok) throw erreurHttp(r);
  return true;
}

export async function envoyer(reglages, phrase, f = fetch) {
  const distant = await lireDistant(reglages, f);
  const texte = await chiffrer(instantaneLocal(), phrase);
  await ecrireDistant(reglages, texte, distant && distant.sha, f);
  return JSON.parse(texte).maj;
}

/* Retourne { donnees, maj } ou null si rien n'a encore ete envoye. */
export async function recuperer(reglages, phrase, f = fetch) {
  const distant = await lireDistant(reglages, f);
  if (!distant) return null;
  return dechiffrer(distant.texte, phrase);
}
