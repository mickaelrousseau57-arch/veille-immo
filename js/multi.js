/* Import de plusieurs annonces a la fois et fusion des doublons entre sites. Fonctions pures, sans DOM. */

import { parseAnnonce, portailDe } from './parse.js';
import { champsDe, CHAMPS } from './caracteristiques.js';

export const PREFIXE = 'IMMOVEILLE:';
const MAX_ITEMS = 600;

const PRIX_LIGNE = /(\d{1,3}(?:[ .]\d{3})+|\d{3,9})(?:[.,]\d{1,2})?\s*(?:€|euros?\b)(?!\s*(?:\/|par|le)\s*m\s?[²2])/i;

/* Texte colle : chaque prix reperee marque une annonce. Selon le site, les details (surface, ville) sont avant le prix
   ou apres : on le deduit de la position de la surface par rapport au prix, puis on decoupe en consequence. */
export function decouperTexte(texte, mode = 'vente') {
  const lignes = String(texte || '').replace(/[\u00a0\u202f]/g, ' ').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const idx = [];
  lignes.forEach((l, i) => {
    const m = PRIX_LIGNE.exec(l);
    if (!m) return;
    const v = Number(m[1].replace(/[^\d]/g, ''));
    if (mode === 'location' ? v >= 100 && v <= 10000 : v >= 10000 && v <= 15000000) idx.push(i);
  });
  if (idx.length < 2) return idx.length ? [{ url: '', text: lignes.join('\n') }] : [];
  const SURF = /\d\s?m\s?[²2]/i;
  let avant = 0, apres = 0;
  idx.forEach((i, k) => {
    const lo = k === 0 ? 0 : idx[k - 1] + 1, hi = k === idx.length - 1 ? lignes.length - 1 : idx[k + 1] - 1;
    let proche = null;
    for (let j = lo; j <= hi; j++) if (SURF.test(lignes[j]) && (proche == null || Math.abs(j - i) < Math.abs(proche - i))) proche = j;
    if (proche != null) (proche < i ? avant++ : apres++);
  });
  const ordre = idx.slice(0, MAX_ITEMS);
  const blocs = ordre.map((i, k) => {
    let debut, fin;
    if (avant >= apres) {
      // titre et details puis prix, suivis de lignes de prix annexes (prix au m2, ancien prix)
      let t = i + 1;
      while (t < lignes.length && t < i + 3 && (k === ordre.length - 1 || t < idx[k + 1]) && lignes[t].includes('€')) t++;
      fin = t;
      debut = k === 0 ? Math.max(0, i - 8) : -1; // complete ci-dessous avec la fin du bloc precedent
    } else {
      debut = k === 0 ? Math.max(0, i - 1) : i;
      fin = k === ordre.length - 1 ? Math.min(lignes.length, i + 9) : idx[k + 1];
    }
    return { debut, fin };
  });
  if (avant >= apres) for (let k = 1; k < blocs.length; k++) blocs[k].debut = blocs[k - 1].fin;
  return blocs.map(({ debut, fin }) => {
    const bloc = lignes.slice(debut, fin).join('\n');
    const u = /https?:\/\/[^\s)>"']+/.exec(bloc);
    return { url: u ? u[0] : '', text: bloc };
  });
}

/* Ce que l'utilisateur colle : export du marque-page (JSON prefixe) ou texte brut d'une page de resultats. */
export function lireCollage(texte, mode = 'vente') {
  const t = String(texte || '').trim();
  if (t.startsWith(PREFIXE)) {
    let o;
    try { o = JSON.parse(t.slice(PREFIXE.length)); } catch { throw new Error('Le contenu collé est incomplet. Recommencez la copie depuis la page de résultats.'); }
    if (!o || !Array.isArray(o.items)) throw new Error('Contenu collé non reconnu.');
    const items = o.items.slice(0, MAX_ITEMS).filter((x) => x && typeof x.text === 'string').map((x) => ({ url: /^https?:\/\//.test(x.url) ? String(x.url).slice(0, 600) : '', text: x.text.slice(0, 8000) }));
    return { items, page: typeof o.page === 'string' && /^https?:\/\//.test(o.page) ? o.page.slice(0, 600) : '', via: 'marque-page' };
  }
  const premiere = /^https?:\/\/\S+$/.exec(t.split(/\r?\n/)[0] || '');
  return { items: decouperTexte(t, mode), page: premiere ? premiere[0] : '', via: 'texte' };
}

/* Titre d'annonce. Les cartes des sites melangent le titre et des liens d'interface ("Simuler mon credit", "Contacter",
   "Ajouter aux favoris"...) : on note chaque ligne et on ne garde que celle qui decrit un bien ; sinon on le construit. */
const BRUIT = /simul|cr[ée]dit|contact|appeler|t[ée]l[ée]phone|voir\s+(?:le|la|l'|les|plus|tous)|ajouter|favori|partag|estim|mensualit|visite\s+virtuelle|vid[ée]o|photo|exclusivit|coup\s+de\s+c|nouveau|baisse\s+de\s+prix|d[ée]couvr|en\s+savoir|honoraires|frais|annonce\s+(?:sponsoris|similaire)|publicit|\bdpe\b|\bges\b|score|alerte|enregistrer|signaler|cookies?/i;
const MOT_BIEN = /\b(?:appartement|appart|maison|villa|studio|duplex|triplex|loft|pavillon|long[èe]re|terrain|immeuble|propri[ée]t[ée]|ferme|chalet|bastide|h[ôo]tel\s+particulier|local)\b/i;
const MOT_PIECES = /\b[TF]\s?\d\b|\d+\s*pi[èe]ces?/i;

export function titreDe(texte) {
  let meilleur = null;
  String(texte || '').split('\n').map((l) => l.replace(/\s+[|·–—-]\s*(?:SeLoger|Logic-Immo|Bien'ici|PAP|Leboncoin|Orpi|Century 21|Figaro Immobilier)\b.*$/i, '').trim()).forEach((l, i) => {
    if (l.length < 8 || l.length > 140 || /^https?:/.test(l) || PRIX_LIGNE.test(l) || /^[\d\s.,m²2€/]+$/.test(l)) return;
    let score = 0;
    if (MOT_BIEN.test(l)) score += 3;
    if (MOT_PIECES.test(l)) score += 2;
    if (BRUIT.test(l)) score -= 4;
    if (score >= 3 && (!meilleur || score > meilleur.score + (i > 0 ? 0 : 0))) meilleur = { score, l };
  });
  return meilleur ? meilleur.l : '';
}

/* Titre construit a partir des champs lus : "Maison 7 pieces 179 m2 - Thionville". */
export function titreAuto(a) {
  return [a.type || 'Bien', a.pieces ? `${a.pieces} pièce${a.pieces > 1 ? 's' : ''}` : '', a.surface ? `${Math.round(a.surface)} m²` : ''].filter(Boolean).join(' ') + (a.communeNom ? ` - ${a.communeNom}` : '');
}

/* Un titre deja enregistre qui est en realite un texte d'interface (ancien import) ? */
export const titreSuspect = (t) => !!t && BRUIT.test(t) && !MOT_BIEN.test(t) && !MOT_PIECES.test(t);

/* Transforme les blocs en annonces. complete = prix et surface trouves. */
export function lireAnnonces(items, { mode = 'vente', page = '' } = {}) {
  const out = [];
  for (const it of items) {
    const p = parseAnnonce(`${it.text}\n${it.url || ''}`, { mode });
    if (!p.prix) continue;
    const url = p.url || page || '';
    const titre = titreDe(it.text);
    const portail = portailDe(url) || portailDe(page);
    out.push({ mode, type: p.type || 'Appartement', typeIncertain: !p.type, prix: p.prix, surface: p.surface, pieces: p.pieces, dpe: p.dpe, terrain: p.terrain, ...champsDe(p), cp: p.cp, url: it.url || (p.url || ''), titre: titre.slice(0, 120), portail: portail || '', complete: !!(p.prix && p.surface) });
  }
  return out;
}

/* Deux annonces decrivent-elles le meme bien ? (meme annonce sur deux sites, ou republiee) */
export function memeBien(a, b) {
  if (a.url && b.url && a.url === b.url) return true;
  if (a.mode !== b.mode || a.type !== b.type) return false;
  if (!a.surface || !b.surface || !a.prix || !b.prix) return false;
  if (a.cp && b.cp && a.cp !== b.cp) return false;
  if (a.insee && b.insee && a.insee !== b.insee) return false;
  if (Math.abs(a.surface - b.surface) > Math.max(1, Math.min(a.surface, b.surface) * 0.03)) return false;
  if (a.pieces && b.pieces && a.pieces !== b.pieces) return false;
  if (Math.abs(a.prix - b.prix) / Math.max(a.prix, b.prix) > 0.03) return false;
  return true;
}

const source = (a) => ({ portail: a.portail || '', url: a.url || '' });
const memeSource = (x, y) => (x.url && y.url ? x.url === y.url : x.portail === y.portail);

/* Regroupe les doublons : retourne des annonces avec la liste de leurs sources (portail et lien). Garde le prix le plus bas. */
export function regrouper(liste) {
  const groupes = [];
  for (const a of liste) {
    const g = groupes.find((x) => memeBien(x, a));
    if (!g) { groupes.push({ ...a, sources: [source(a)] }); continue; }
    const s = source(a);
    if (!g.sources.some((x) => memeSource(x, s))) g.sources.push(s);
    if (a.prix < g.prix) g.prix = a.prix;
    g.pieces = g.pieces || a.pieces;
    g.dpe = g.dpe || a.dpe;
    g.cp = g.cp || a.cp;
    g.terrain = g.terrain || a.terrain;
    // Les caracteristiques manquantes sur un site sont completees par l'autre ; les equipements s'additionnent.
    for (const k of CHAMPS) if (k !== 'extras' && g[k] == null) g[k] = a[k] ?? null;
    g.extras = [...new Set([...(g.extras || []), ...(a.extras || [])])];
  }
  return groupes;
}
