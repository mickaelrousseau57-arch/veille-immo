/* Lecture d'une annonce copiee depuis un site (texte ou lien) : prix, surface, pieces, DPE, code postal...
   L'extraction est volontairement prudente : un champ non trouve reste null et l'utilisateur le complete. */

const PORTAILS = [
  ['leboncoin.fr', 'Leboncoin'], ['seloger.com', 'SeLoger'], ['logic-immo.com', 'Logic-Immo'], ['bienici.com', "Bien'ici"],
  ['pap.fr', 'PAP'], ['ouestfrance-immo.com', 'Ouest-France Immo'], ['lefigaro.fr', 'Figaro Immobilier'], ['century21.fr', 'Century 21'],
  ['orpi.com', 'Orpi'], ['notaires.fr', 'Notaires de France'], ['avendrealouer.fr', 'AVendreALouer'], ['paruvendu.fr', 'ParuVendu'],
  ['laforet.com', 'Laforêt'], ['iadfrance.fr', 'iad'], ['safti.fr', 'SAFTI'], ['capifrance.fr', 'Capifrance'],
];

export function portailDe(url) {
  if (!url) return null;
  try {
    const h = new URL(url).hostname.replace(/^www\./, '');
    const p = PORTAILS.find(([d]) => h === d || h.endsWith('.' + d));
    return p ? p[1] : h;
  } catch { return null; }
}

const intFrom = (s) => Number(String(s).replace(/[^\d]/g, ''));
const decFrom = (s) => Number(String(s).replace(/\s/g, '').replace(',', '.'));

function trouverPrix(t, location) {
  // Montants suivis de euro, hors prix au m2 ("3 125 €/m²").
  const re = /(\d{1,3}(?:[ .]\d{3})+|\d{3,9})(?:[.,]\d{1,2})?\s*(?:€|euros?\b|eur\b)(?!\s*(?:\/|par|le)\s*m\s?[²2])/gi;
  const found = [];
  let m;
  while ((m = re.exec(t))) {
    const apres = t.slice(m.index + m[0].length, m.index + m[0].length + 12).toLowerCase();
    if (/^\s*(?:\/|par)?\s*m\s?[²2]/.test(apres)) continue;
    found.push({ v: intFrom(m[1]), i: m.index });
  }
  if (location) return (found.find((f) => f.v >= 100 && f.v <= 10000) || {}).v ?? null;
  const ventes = found.filter((f) => f.v >= 10000 && f.v <= 15000000);
  return ventes.length ? ventes[0].v : null;
}

function trouverSurface(t) {
  const re = /(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:m\s?[²2]|m[èe]tres?\s+carr[ée]s?)/gi;
  let m;
  while ((m = re.exec(t))) {
    const avant = t.slice(Math.max(0, m.index - 28), m.index).toLowerCase().split('\n').pop(); // meme ligne seulement
    if (/terrain|jardin|parcelle|balcon|terrasse|cave|garage|parking|cour|loggia/.test(avant)) continue;
    if (/\/\s*$/.test(avant) || /€\s*$/.test(avant)) continue; // "3 125 €/m²"
    const v = decFrom(m[1]);
    if (v >= 8 && v <= 600) return v;
  }
  const lab = /surface(?:\s+(?:habitable|carrez|loi carrez|du bien))?\s*[:\-]?\s*(\d{1,3}(?:[.,]\d{1,2})?)/i.exec(t);
  if (lab) {
    const v = decFrom(lab[1]);
    if (v >= 8 && v <= 600) return v;
  }
  return null;
}

/* opts.mode ('vente' | 'location') impose le mode quand l'utilisateur le connait (import d'une page de resultats). */
export function parseAnnonce(brut, opts = {}) {
  const t = String(brut || '').replace(/[  ]/g, ' ');
  const out = { mode: null, type: null, prix: null, surface: null, pieces: null, chambres: null, dpe: null, cp: null, terrain: null, etage: null, url: null, portail: null, extras: [] };
  if (!t.trim()) return out;

  const url = /https?:\/\/[^\s)>"']+/.exec(t);
  if (url) { out.url = url[0]; out.portail = portailDe(url[0]); }

  const louer = /\b(?:à|a)\s+louer\b|\blocation\b|\bloyer\b|charges\s+comprises|\bCC\b|€\s*\/\s*mois|par\s+mois|\/\s*mois|\bbail\b/i.test(t);
  const vendre = /\b(?:à|a)\s+vendre\b|\bvente\b|\bachat\b|\bhonoraires\b|frais\s+d['’]agence/i.test(t);
  out.mode = louer && !vendre ? 'location' : vendre && !louer ? 'vente' : louer ? 'location' : 'vente';
  if (louer && vendre) {
    // Les deux mots-cles apparaissent : un montant "par mois" tranche en faveur de la location.
    out.mode = /€\s*\/\s*mois|par\s+mois|charges\s+comprises/i.test(t) ? 'location' : 'vente';
  }
  if (opts.mode === 'vente' || opts.mode === 'location') out.mode = opts.mode;
  out.prix = trouverPrix(t, out.mode === 'location');
  out.surface = trouverSurface(t);

  const iMaison = t.search(/\b(?:maison|villa|pavillon|long[èe]re|corps de ferme)\b/i);
  const iAppart = t.search(/\b(?:appartement|appart|studio|duplex|triplex|loft)\b/i);
  if (iMaison >= 0 && (iAppart < 0 || iMaison < iAppart)) out.type = 'Maison';
  else if (iAppart >= 0) out.type = 'Appartement';

  let m = /(\d{1,2})\s*pi[èe]ces?/i.exec(t) || /\b[TF]\s?(\d)\b/.exec(t);
  if (m) out.pieces = Number(m[1]);
  else if (/\bstudio\b/i.test(t)) out.pieces = 1;
  m = /(\d{1,2})\s*chambres?/i.exec(t);
  if (m) out.chambres = Number(m[1]);

  m = /(?:DPE|diagnostic de performance [ée]nerg[ée]tique|classe [ée]nergie|classe [ée]nerg[ée]tique|[ée]tiquette [ée]nergie)[^A-Za-z\n]{0,25}\b([A-G])\b/i.exec(t);
  if (m) out.dpe = m[1].toUpperCase();

  const re = /(?<![\d€])(\d{5})(?![\d]|\s*(?:€|euros?))/g;
  while ((m = re.exec(t))) {
    const n = Number(m[1]);
    if (n >= 1000 && n <= 98999) { out.cp = m[1]; break; }
  }

  m = /terrain[^\d]{0,20}(\d[\d ]{1,6})\s*m\s?[²2]/i.exec(t);
  if (m) out.terrain = intFrom(m[1]);
  if (/rez[- ]de[- ]chauss[ée]e|\bRDC\b/i.test(t)) out.etage = 0;
  else if ((m = /(\d{1,2})\s*(?:er|e|ème|eme)?\s*[ée]tage/i.exec(t))) out.etage = Number(m[1]);

  const extras = [['ascenseur', /ascenseur/i], ['balcon', /balcon/i], ['terrasse', /terrasse/i], ['jardin', /jardin/i], ['parking', /parking|garage|box\b/i], ['cave', /\bcave\b/i]];
  out.extras = extras.filter(([, r]) => r.test(t)).map(([n]) => n);
  return out;
}
