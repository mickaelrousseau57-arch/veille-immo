/* Analyse d'une annonce par rapport au marche local (ventes reelles DVF, loyers d'annonce). Fonctions pures, sans DOM.
   Les donnees viennent de data/prix/<dep>.json : fiche = { a: appartements, h: maisons, l: loyers }. */

export const VERDICTS = {
  tresBon: { id: 'tresBon', label: 'Prix très bas', tone: 'good', texte: 'Nettement sous le marché. Vérifiez la raison avant de vous enthousiasmer (travaux, copropriété, bien occupé, annonce ancienne).' },
  bon: { id: 'bon', label: 'Bonne affaire potentielle', tone: 'good', texte: 'Sous le prix habituel des ventes comparables.' },
  marche: { id: 'marche', label: 'Prix du marché', tone: 'neutral', texte: 'Dans la fourchette habituelle des ventes comparables.' },
  haut: { id: 'haut', label: 'Un peu cher', tone: 'warn', texte: 'Au-dessus du prix habituel : une négociation est justifiée.' },
  cher: { id: 'cher', label: 'Cher', tone: 'bad', texte: 'Nettement au-dessus du marché. Il faut un atout fort (vue, étage, rénovation, emplacement) pour le justifier.' },
};

/* Choisit la fenetre de ventes la plus pertinente et corrige selon le nombre de pieces (appartements). */
export function choisirStats(bloc, pieces = null) {
  if (!bloc) return null;
  let q, n, fenetre;
  if (bloc.q && bloc.n >= 30) { q = bloc.q; n = bloc.n; fenetre = '12 derniers mois'; }
  else if (bloc.q3 && bloc.n3 >= 3) { q = bloc.q3; n = bloc.n3; fenetre = '36 derniers mois'; }
  else if (bloc.q && bloc.n >= 3) { q = bloc.q; n = bloc.n; fenetre = '12 derniers mois'; }
  else return null;
  let ajustePieces = null;
  if (pieces && bloc.r && bloc.q3) {
    const k = String(Math.min(Math.round(pieces), 5));
    const r = bloc.r[k];
    if (r && r[1] >= 15) {
      const ratio = Math.min(1.35, Math.max(0.8, r[0] / bloc.q3[2]));
      q = q.map((v) => Math.round(v * ratio));
      ajustePieces = { pieces: Number(k), ratio, n: r[1] };
    }
  }
  if (bloc.libelle) fenetre = bloc.libelle;
  const fiabilite = bloc.fiabilite || (n >= 100 ? 'bonne' : n >= 30 ? 'correcte' : n >= 10 ? 'moyenne' : 'faible');
  return { q, n, fenetre, fiabilite, ajustePieces, mediane: q[2] };
}

/* Position (0 a 100) d'une valeur dans la distribution decrite par [p10, p25, p50, p75, p90]. */
export function percentile(q, v) {
  const pts = [[0.6 * q[0], 0], [q[0], 10], [q[1], 25], [q[2], 50], [q[3], 75], [q[4], 90], [1.4 * q[4], 100]];
  if (v <= pts[0][0]) return 0;
  if (v >= pts[pts.length - 1][0]) return 100;
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    if (v <= x1) {
      const [x0, y0] = pts[i - 1];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (v - x0)) / (x1 - x0);
    }
  }
  return 100;
}

export function verdictPour(ecartPct) {
  if (ecartPct <= -15) return VERDICTS.tresBon;
  if (ecartPct <= -5) return VERDICTS.bon;
  if (ecartPct < 5) return VERDICTS.marche;
  if (ecartPct < 15) return VERDICTS.haut;
  return VERDICTS.cher;
}

/* Evolution des prix medians annuels : sur 1 an et 3 ans (annee la plus recente contre les precedentes). */
export function tendance(bloc) {
  const y = bloc && bloc.y;
  if (!y) return null;
  const ans = Object.keys(y).sort();
  if (ans.length < 2) return null;
  const dern = ans[ans.length - 1];
  const val = (a) => y[a][0];
  const out = { derniere: Number(dern), valeur: val(dern), an1: null, an3: null, serie: ans.map((a) => ({ annee: Number(a), mediane: y[a][0], n: y[a][1] })) };
  const prev = String(Number(dern) - 1);
  if (y[prev]) out.an1 = (val(dern) / val(prev) - 1) * 100;
  const p3 = String(Number(dern) - 3);
  if (y[p3]) out.an3 = (val(dern) / val(p3) - 1) * 100;
  return out;
}

/* Loyer de reference (euros/m2/mois, charges comprises) : [valeur, bas, haut]. */
export function loyerRef(l, type, pieces) {
  if (!l) return null;
  if (type === 'Maison') return l.h || null;
  if (pieces && pieces <= 2 && l.p) return l.p;
  if (pieces && pieces >= 3 && l.g) return l.g;
  return l.a || null;
}

const DPE_MAUVAIS = { F: 'Passoire thermique (F) : interdiction de louer prévue en 2028, travaux de rénovation à chiffrer et à négocier.', G: 'Passoire thermique (G) : location interdite depuis 2025, travaux de rénovation à chiffrer et à négocier.' };

/* Analyse d'une annonce de vente.
   annonce : { type: 'Appartement'|'Maison', prix, surface, pieces?, dpe?, terrain? } ; fiche : fiche de la commune ou du code postal. */
export function analyserAchat(annonce, fiche) {
  const { type, prix, surface } = annonce;
  const res = { ok: false, ppm2: null, alertes: [] };
  if (!(prix > 0) || !(surface > 0)) { res.erreur = 'Prix et surface sont nécessaires.'; return res; }
  res.ppm2 = prix / surface;
  const bloc = fiche && fiche[type === 'Maison' ? 'h' : 'a'];
  const stats = choisirStats(bloc, type === 'Appartement' ? annonce.pieces : null);
  const ref = fiche && loyerRef(fiche.l, type, annonce.pieces);
  if (ref) {
    res.loyerRef = ref;
    res.loyerEstime = ref[0] * surface;
    res.rendementBrut = ((ref[0] * surface * 12) / prix) * 100;
  }
  res.tendance = tendance(bloc);
  if (annonce.dpe && DPE_MAUVAIS[annonce.dpe]) res.alertes.push({ tone: 'warn', texte: DPE_MAUVAIS[annonce.dpe] });
  if (!stats) { res.erreur = 'Pas assez de ventes récentes dans ce secteur pour comparer.'; return res; }
  res.ok = true;
  res.stats = stats;
  res.ecart = (res.ppm2 / stats.mediane - 1) * 100;
  res.percentile = percentile(stats.q, res.ppm2);
  res.score = Math.round(100 - res.percentile);
  res.verdict = verdictPour(res.ecart);
  res.attendu = { bas: Math.round(stats.q[1] * surface), median: Math.round(stats.mediane * surface), haut: Math.round(stats.q[3] * surface) };
  // Offre a viser : mediane locale si le bien est cher, sinon marge de negociation usuelle de 3 %.
  res.cible = res.ecart > 5 ? Math.round(stats.mediane * 1.02 * surface) : Math.round(prix * 0.97);
  res.economie = Math.max(0, prix - res.cible);
  if (res.ppm2 < stats.q[0] * 0.7) res.alertes.push({ tone: 'warn', texte: 'Prix au m² très inférieur au marché : vérifiez la surface annoncée, l\'état, la situation juridique (viager, nue-propriété, bien occupé) et l\'état de la copropriété.' });
  if (stats.fiabilite === 'faible') res.alertes.push({ tone: 'info', texte: `Peu de ventes comparables (${stats.n}) : le résultat est indicatif.` });
  if (stats.ajustePieces) res.alertes.push({ tone: 'info', texte: `Comparaison corrigée pour les ${stats.ajustePieces.pieces >= 5 ? '5 pièces et plus' : stats.ajustePieces.pieces + ' pièce(s)'} (les petites surfaces se vendent plus cher au m²).` });
  if (type === 'Maison' && annonce.terrain) res.alertes.push({ tone: 'info', texte: 'Le terrain n\'est pas pris en compte dans la comparaison : un grand terrain justifie un prix au m² bâti plus élevé.' });
  return res;
}

/* Analyse d'une annonce de location (loyer charges comprises). */
export function analyserLocation({ type, loyer, surface, pieces }, fiche) {
  const res = { ok: false };
  if (!(loyer > 0) || !(surface > 0)) { res.erreur = 'Loyer et surface sont nécessaires.'; return res; }
  res.ppm2 = loyer / surface;
  const ref = fiche && loyerRef(fiche.l, type, pieces);
  if (!ref) { res.erreur = 'Pas de loyer de référence pour cette commune.'; return res; }
  res.ok = true;
  res.ref = ref;
  res.ecart = (res.ppm2 / ref[0] - 1) * 100;
  if (res.ppm2 < ref[1]) res.verdict = { id: 'tresBas', label: 'Loyer très bas', tone: 'good', texte: 'Sous la fourchette de confiance du marché : vérifiez l\'état et les charges.' };
  else if (res.ecart <= -10) res.verdict = { id: 'bas', label: 'Loyer sous le marché', tone: 'good', texte: 'Plus avantageux que le loyer d\'annonce habituel du secteur.' };
  else if (res.ecart < 10) res.verdict = { id: 'marche', label: 'Loyer du marché', tone: 'neutral', texte: 'Dans la norme du secteur.' };
  else if (res.ppm2 <= ref[2]) res.verdict = { id: 'haut', label: 'Loyer élevé', tone: 'warn', texte: 'Au-dessus du loyer habituel : négociable, ou justifié par des prestations.' };
  else res.verdict = { id: 'tresHaut', label: 'Loyer très élevé', tone: 'bad', texte: 'Au-dessus de la fourchette du marché. Vérifiez meublé ou non, encadrement des loyers de la ville, charges.' };
  res.loyerAttendu = Math.round(ref[0] * surface);
  return res;
}

/* Ventes recentes les plus proches du bien (type, surface, pieces, distance, anciennete).
   ventes : lignes [date, prix, surface, pieces, type(0/1), lat, lon, adresse, cp, terrain]. */
export function comparables(ventes, { type, surface, pieces, lat, lon }, max = 8) {
  const t = type === 'Maison' ? 1 : 0;
  const rad = Math.PI / 180;
  const scored = [];
  for (const v of ventes || []) {
    if (v[4] !== t || !v[2]) continue;
    const dS = Math.abs(v[2] - surface) / surface;
    if (dS > 0.4) continue;
    const dP = pieces && v[3] ? Math.abs(v[3] - pieces) : 0;
    if (dP > 1) continue;
    let dist = 0;
    if (lat != null && lon != null && v[5] != null) {
      const dLat = (v[5] - lat) * rad, dLon = (v[6] - lon) * rad;
      dist = 2 * 6371 * Math.asin(Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(lat * rad) * Math.cos(v[5] * rad) * Math.sin(dLon / 2) ** 2));
    }
    scored.push({ v, ppm2: v[1] / v[2], score: dS * 2 + dP * 0.3 + Math.min(dist, 20) * 0.1, dist });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, max).map((s) => ({ date: s.v[0], prix: s.v[1], surface: s.v[2], pieces: s.v[3], ppm2: Math.round(s.ppm2), adresse: s.v[7], cp: s.v[8], dist: s.dist, lat: s.v[5], lon: s.v[6] }));
}

export function medianeDe(vals) {
  if (!vals.length) return null;
  const s = [...vals].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* Bloc de prix construit a partir d'une seule valeur mediane (reference saisie ou publiee sans quartiles) :
   la fourchette est estimee a +/- 15 % (quartiles) et +/- 30 % (extremes). */
export function blocSynthetique(mediane, extra = {}) {
  const q = [0.7, 0.85, 1, 1.15, 1.3].map((k) => Math.round(mediane * k));
  return { n: 10, q, n3: 10, q3: q, ...extra };
}

/* Quantiles [p10, p25, p50, p75, p90] par interpolation lineaire. */
export function quantilesDe(vals) {
  const s = [...vals].sort((a, b) => a - b);
  const at = (p) => {
    const k = (s.length - 1) * p, f = Math.floor(k), c = Math.min(f + 1, s.length - 1);
    return s[f] + (s[c] - s[f]) * (k - f);
  };
  return [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => Math.round(at(p)));
}

export const MIN_OBSERVATIONS = 8;

/* Bloc de prix d'annonces observees (prix demandes, pas des ventes) : null si trop peu d'annonces. */
export function blocDepuisObservations(rows) {
  const n = rows.length;
  if (n < MIN_OBSERVATIONS) return null;
  const q = quantilesDe(rows.map((r) => r.p));
  return { n, q, n3: n, q3: q, libelle: `${n} annonces observées`, fiabilite: n >= 30 ? 'correcte' : 'moyenne' };
}
