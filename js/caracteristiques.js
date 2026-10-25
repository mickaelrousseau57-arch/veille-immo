/* Caracteristiques d'un bien lues dans le texte d'une annonce : chambres, annee de construction, jardin, piscine...
   Une valeur absente du texte reste null : l'utilisateur peut la completer a la main (fiche de l'annonce suivie). Fonctions pures. */

export const EQUIPEMENTS = [
  ['jardin', 'Jardin'], ['piscine', 'Piscine'], ['terrasse', 'Terrasse'], ['balcon', 'Balcon'], ['ascenseur', 'Ascenseur'],
  ['parking', 'Parking'], ['garage', 'Garage'], ['cave', 'Cave'], ['cheminee', 'Cheminée'], ['climatisation', 'Climatisation'], ['meuble', 'Meublé'],
];
export const ETATS = [['neuf', 'Neuf'], ['renove', 'Rénové'], ['bon', 'Bon état'], ['travaux', 'À rénover']];
export const CHAUFFAGES = [['gaz', 'Gaz'], ['electrique', 'Électrique'], ['pac', 'Pompe à chaleur'], ['fioul', 'Fioul'], ['bois', 'Bois'], ['urbain', 'Urbain'], ['collectif', 'Collectif'], ['individuel', 'Individuel']];

const REGLES = {
  jardin: /\bjardin(?:et)?\b/i, piscine: /\bpiscine\b/i, terrasse: /\bterrasse\b/i, balcon: /\bbalcon\b/i, ascenseur: /\bascenseur\b/i,
  parking: /\b(?:parking|stationnement|box)\b/i, garage: /\bgarage\b/i, cave: /\bcave\b/i, cheminee: /\b(?:chemin[ée]e|po[êe]le)\b/i,
  climatisation: /\b(?:climatisation|clim\b|climatis[ée]e?(?![a-zà-ÿ]))/i, meuble: /\bmeubl[ée]e?(?![a-zà-ÿ])/i,
};
const NEGATION = /(?:\bsans|\bpas\s+d[e']|\baucun|\bnon|\bni)\s*(?:de\s+|d')?$/i;
const PROXIMITE = /(?:proche|proximit[ée]|pr[èe]s\s+(?:de|du|des)|[àa]\s+c[ôo]t[ée]|[àa]\s+pied|autour|face\s+(?:au|à|a)|vue\s+sur|donnant\s+sur|jardin\s+public)\s*(?:de\s+|du\s+|des\s+|d'|la\s+|le\s+|l')?$/i;

/* L'equipement est-il propose par le bien ? On ecarte "sans jardin", "proche piscine municipale"... (meme ligne seulement). */
function mention(t, re) {
  const g = new RegExp(re.source, 'gi');
  let m;
  while ((m = g.exec(t))) {
    const ligne = t.slice(Math.max(0, m.index - 35), m.index).split('\n').pop();
    if (NEGATION.test(ligne) || PROXIMITE.test(ligne)) continue;
    const suite = t.slice(m.index, m.index + 28).split('\n')[0];
    if (/^jardin\s+public/i.test(suite) || /^piscine\s+(?:municipale|communale|intercommunale)/i.test(suite)) continue;
    return true;
  }
  return false;
}

const nb = (m, i = 1) => (m ? Number(m[i]) : null);
const entre = (v, a, b) => (v != null && v >= a && v <= b ? v : null);

/* t : texte de l'annonce ; mode : 'vente' | 'location' (les charges de copropriete n'ont de sens qu'en vente). */
export function extraireCaracteristiques(t, mode = 'vente') {
  const out = { chambres: null, sdb: null, annee: null, etage: null, etagesTotal: null, etat: null, chauffage: null, ges: null, chargesAn: null, taxeFonciere: null, extras: [] };
  const texte = String(t || '');

  out.chambres = entre(nb(/(\d{1,2})\s*chambres?\b/i.exec(texte)) ?? nb(/\bchambres?\s*[:\-]\s*(\d{1,2})\b/i.exec(texte)), 1, 15);
  out.sdb = entre(nb(/(\d)\s*salles?\s*(?:de\s*)?(?:bains?|d['’]eau)/i.exec(texte)) ?? nb(/salles?\s*(?:de\s*)?(?:bains?|d['’]eau)\s*[:\-]\s*(\d)\b/i.exec(texte)), 1, 9);

  const an = /(?:construit(?:e)?|b[âa]ti(?:e)?|ach[eè]v[ée]e?|datant)\s*(?:en|de|:)?\s*(1[89]\d{2}|20[0-3]\d)\b/i.exec(texte)
    || /ann[ée]e\s*(?:de\s*)?(?:construction|constr\.?)\s*[:\-]?\s*(1[89]\d{2}|20[0-3]\d)\b/i.exec(texte)
    || /\bconstruction\s*(?:de\s*|en\s*)?[:\-]?\s*(1[89]\d{2}|20[0-3]\d)\b/i.exec(texte)
    || /\bimmeuble\s+(?:de|des)\s+(1[89]\d{2})\b/i.exec(texte);
  out.annee = an ? Number(an[1]) : null;

  const sur = /(\d{1,2})\s*(?:er|e|[èe]me)?\s*[ée]tage\s*(?:sur|\/)\s*(\d{1,2})\b/i.exec(texte);
  if (/rez[- ]de[- ]chauss[ée]e|\bRDC\b/i.test(texte)) out.etage = 0;
  else if (sur) { out.etage = Number(sur[1]); out.etagesTotal = Number(sur[2]); } else {
    const e = /(\d{1,2})\s*(?:er|e|ème|eme)?\s*[ée]tage/i.exec(texte);
    if (e) out.etage = Number(e[1]);
  }

  if (/[àa]\s+r[ée]nover|travaux\s+[àa]\s+pr[ée]voir|[àa]\s+rafra[iî]chir|gros\s+travaux|[àa]\s+r[ée]habiliter/i.test(texte)) out.etat = 'travaux';
  else if (/r[ée]nov[ée]e?|refait(?:e)?\s+[àa]\s+neuf|r[ée]novation\s+r[ée]cente/i.test(texte)) out.etat = 'renove';
  else if (/\b(?:neuf|vefa|neuve)\b/i.test(texte) && !/[àa]\s+neuf/i.test(texte)) out.etat = 'neuf';
  else if (/(?:tr[èe]s\s+)?bon\s+[ée]tat|excellent\s+[ée]tat|[ée]tat\s+(?:impeccable|irr[ée]prochable)/i.test(texte)) out.etat = 'bon';

  const chauf = /chauffage[^\n.;]{0,50}/i.exec(texte);
  if (chauf) {
    // L'energie prime sur le mode ("individuel au gaz" -> gaz).
    const e = /\b(gaz|[ée]lectrique|fioul|mazout|bois|granul[ée]s|pompe\s+[àa]\s+chaleur|PAC)\b/i.exec(chauf[0]) || /\b(urbain|collectif|individuel)\b/i.exec(chauf[0]);
    if (e) {
      const v = e[1].toLowerCase();
      out.chauffage = /pompe|pac/.test(v) ? 'pac' : /lectrique/.test(v) ? 'electrique' : /fioul|mazout/.test(v) ? 'fioul' : /bois|granul/.test(v) ? 'bois' : v;
    }
  }
  const ges = /\bGES\b[^A-Za-z\n]{0,25}\b([A-G])\b/.exec(texte);
  out.ges = ges ? ges[1] : null;

  if (mode !== 'location') {
    const c = /charges[^\n€]{0,40}?(\d[\d ]{1,6})\s*€\s*(?:\/|par)?\s*(ann[ée]e|an|mois|trimestre)\b/i.exec(texte);
    if (c) {
      const v = Number(c[1].replace(/\s/g, ''));
      const p = c[2].toLowerCase();
      out.chargesAn = p === 'mois' ? v * 12 : p === 'trimestre' ? v * 4 : v;
    }
    const tf = /taxe\s+fonci[èe]re[^\d\n]{0,25}(\d[\d ]{1,6})\s*€/i.exec(texte);
    if (tf) out.taxeFonciere = Number(tf[1].replace(/\s/g, ''));
  }

  out.extras = EQUIPEMENTS.map(([k]) => k).filter((k) => mention(texte, REGLES[k]) && !(k === 'ascenseur' && /sans\s+ascenseur/i.test(texte)));
  return out;
}

/* Champs de caracteristiques a conserver avec une annonce suivie. */
export const CHAMPS = ['chambres', 'sdb', 'annee', 'etage', 'etagesTotal', 'etat', 'chauffage', 'ges', 'chargesAn', 'taxeFonciere', 'extras'];
export const champsDe = (a) => Object.fromEntries(CHAMPS.map((k) => [k, a[k] ?? (k === 'extras' ? [] : null)]));

/* Resume court des caracteristiques connues, pour une ligne de liste : "3 ch. · jardin · 1975". */
export function resume(a) {
  const noms = Object.fromEntries(EQUIPEMENTS);
  const l = [];
  if (a.chambres) l.push(`${a.chambres} ch.`);
  if (a.annee) l.push(`${a.annee}`);
  if (a.etat) l.push((ETATS.find(([k]) => k === a.etat) || [])[1]);
  (a.extras || []).forEach((k) => { if (noms[k]) l.push(noms[k].toLowerCase()); });
  return l.filter(Boolean);
}
