/* Estimation d'un bien : prix du marche local, corrige de ce qui fait varier un prix (DPE, etage, exterieurs, annee,
   etat, surface, emplacement precis). Fonctions pures, sans DOM.

   Chaque correction est affichee avec son pourcentage, sa source et un niveau de fiabilite :
   - donnees    : calculee sur des ventes reelles (DVF) ;
   - etude      : ordre de grandeur publie par une etude (notaires, MeilleursAgents) ;
   - indicatif  : repere publie, issu surtout de Paris ou d'etudes commerciales ;
   - hypothese  : valeur prudente choisie ici, faute de source fiable ;
   - saisie     : valeur modifiee par l'utilisateur.
   L'estimation n'est pas une expertise : la fourchette s'elargit avec le nombre d'hypotheses utilisees. */

import { clamp } from './util.js';

export const SOURCES = {
  dpe: { fiabilite: 'etude', texte: 'Notaires de France 2021-2024 (via LCL) : maisons F de -10 à -18 %, G de -17 à -25 % par rapport à D ; SeLoger 2025 : appartements F ou G environ -9 %, classes A et B de +9 à +16 %.', url: 'https://edito.seloger.com/conseils-d-experts/investir/immobilier-vendez-un-bien-f-g-voici-devez-savoir-article-20235.html' },
  etage: { fiabilite: 'indicatif', texte: 'Notaires du Grand Paris et MeilleursAgents : rez-de-chaussée environ 10 % sous les 1er et 2e étages, dernier étage avec ascenseur de 15 à 19 % au-dessus du rez-de-chaussée ; Liberkeys : décote à partir du 4e étage sans ascenseur. Études surtout parisiennes.', url: 'https://edito.seloger.com/actualites/france/immobilier-quel-est-l-impact-de-l-etage-sur-le-prix-d-un-appartement-article-18514.html' },
  balcon: { fiabilite: 'etude', texte: 'MeilleursAgents 2023 : un balcon ou une terrasse ajoute environ 9,7 à 9,9 % à la valeur d\'un appartement dans les grandes villes (15,4 % à Marseille).', url: 'https://www.mysweetimmo.com/2023/05/22/balcon-exterieur-piscine-ces-caracteristiques-qui-font-grimper-les-prix-de-limmobilier/' },
  jardin: { fiabilite: 'etude', texte: 'MeilleursAgents 2023 : un jardin ajoute en moyenne 4,2 % au prix d\'une maison.', url: 'https://www.mysweetimmo.com/2023/05/22/balcon-exterieur-piscine-ces-caracteristiques-qui-font-grimper-les-prix-de-limmobilier/' },
  jardinAppart: { fiabilite: 'indicatif', texte: 'Orpi (communication d\'agence) : un petit jardin ou une terrasse en rez-de-chaussée se négocie 5 à 15 % au-dessus d\'un appartement comparable. Valeur basse retenue.', url: 'https://www.orpi.com/costieresimmobilier/quels-sont-les-atouts-qui-valorisent-votre-logement' },
  piscine: { fiabilite: 'hypothese', texte: 'Pas d\'étude fiable : une agence avance jusqu\'à 20 % dans les régions ensoleillées, sans source. Valeur prudente par défaut, à ajuster selon votre secteur.', url: 'https://www.orpi.com/costieresimmobilier/quels-sont-les-atouts-qui-valorisent-votre-logement' },
  annee: { fiabilite: 'hypothese', texte: 'Pas de source publique fiable. Les biens récents (normes thermiques récentes) se vendent plus cher, ceux de 1949 à 1974 un peu moins. Se recoupe en partie avec le DPE : ne pas cumuler deux fois un même effet.', url: '' },
  etat: { fiabilite: 'hypothese', texte: 'Valeurs prudentes par défaut. Pour un bien à rénover, chiffrez les travaux et retirez-les du prix : c\'est plus fiable qu\'un pourcentage. Le neuf (VEFA) se vend nettement plus cher que l\'ancien.', url: '' },
  surface: { fiabilite: 'hypothese', texte: 'Les petites surfaces se vendent plus cher au m² que les grandes. Correction légère par rapport à la surface typique du secteur, appliquée seulement quand le nombre de pièces ne la corrige pas déjà.', url: '' },
  pieces: { fiabilite: 'donnees', texte: 'Prix médian des ventes réelles du secteur pour le même nombre de pièces.', url: '' },
  emplacement: { fiabilite: 'donnees', texte: 'Écart entre les ventes réelles voisines (moins de 1,5 à 3 km) et la médiane de la commune.', url: '' },
};

/* Valeurs par defaut, en pourcentage du prix. */
export const COEFFS = {
  dpe: { Appartement: { A: 10, B: 10, F: -9, G: -9 }, Maison: { A: 10, B: 10, F: -14, G: -21 } },
  rdc: -8, dernierEtage: 5, hautSansAscenseur: -3,
  balconTerrasse: 9, jardinMaison: 4, jardinAppart: 5, piscine: 3,
  annee: [[2013, 6], [1990, 2], [1975, 0], [1949, -4], [0, 0]], // [annee minimale, pourcentage]
  etat: { travaux: -15, renove: 5, bon: 0, neuf: 30 },
  elasticiteSurface: -0.12,
};

const NOMS = { A: 'A', B: 'B', F: 'F', G: 'G' };
const med = (v) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

/* Corrections applicables au bien : [{ id, label, pct, source }] (pourcentages avant ajustement par l'utilisateur). */
export function corrections(bien, base) {
  const out = [];
  const apt = bien.type !== 'Maison';
  const ex = new Set(bien.extras || []);
  const add = (id, label, pct, source) => { if (pct) out.push({ id, label, pct, source }); };

  const d = COEFFS.dpe[apt ? 'Appartement' : 'Maison'][bien.dpe];
  if (d) add('dpe', `DPE ${NOMS[bien.dpe]}`, d, 'dpe');

  if (apt && bien.etage != null) {
    if (bien.etage === 0) add('etage', 'Rez-de-chaussée', COEFFS.rdc, 'etage');
    else if (bien.etagesTotal && bien.etage === bien.etagesTotal && bien.etage >= 3 && ex.has('ascenseur')) add('etage', 'Dernier étage avec ascenseur', COEFFS.dernierEtage, 'etage');
    else if (bien.etage >= 4 && !ex.has('ascenseur')) add('etage', `${bien.etage}e étage sans ascenseur`, COEFFS.hautSansAscenseur, 'etage');
  }
  if (apt && (ex.has('balcon') || ex.has('terrasse'))) add('balcon', ex.has('terrasse') ? 'Terrasse' : 'Balcon', COEFFS.balconTerrasse, 'balcon');
  if (ex.has('jardin')) add('jardin', 'Jardin', apt ? COEFFS.jardinAppart : COEFFS.jardinMaison, apt ? 'jardinAppart' : 'jardin');
  if (!apt && ex.has('piscine')) add('piscine', 'Piscine', COEFFS.piscine, 'piscine');

  if (bien.annee) {
    const [, pct] = COEFFS.annee.find(([a]) => bien.annee >= a);
    add('annee', `Construit en ${bien.annee}`, pct, 'annee');
  }
  if (bien.etat && COEFFS.etat[bien.etat]) add('etat', { travaux: 'À rénover', renove: 'Rénové', neuf: 'Neuf', bon: 'Bon état' }[bien.etat], COEFFS.etat[bien.etat], 'etat');

  if (base.surfaceType && !base.ajustePieces && bien.surface > 0) {
    const pct = clamp((Math.pow(bien.surface / base.surfaceType, COEFFS.elasticiteSurface) - 1) * 100, -12, 12);
    if (Math.abs(pct) >= 0.5) add('surface', `Surface ${Math.round(bien.surface)} m² (secteur : ${Math.round(base.surfaceType)} m²)`, Math.round(pct * 10) / 10, 'surface');
  }
  return out;
}

/* Effet de l'emplacement : ventes voisines (liste de prix au m2) comparees a la mediane de la commune. */
export function effetEmplacement(prixM2Voisins, medianeCommune) {
  const n = prixM2Voisins.length;
  if (n < 8 || !(medianeCommune > 0)) return null;
  const facteur = clamp(med(prixM2Voisins) / medianeCommune, 0.8, 1.25);
  const poids = n / (n + 12);
  return { pct: Math.round(poids * (facteur - 1) * 1000) / 10, n, medianeVoisins: Math.round(med(prixM2Voisins)) };
}

/* bien : { type, surface, pieces, annee, etage, etagesTotal, dpe, etat, extras, parkingEur, garageEur, libre }
   base : resultat de choisirStats() + { source } ; voisins : prix au m2 des ventes voisines ; surcharges : { id: pourcentage } */
export function estimer({ bien, base, voisins = [], surcharges = {} }) {
  if (!base || !(bien.surface > 0)) return { ok: false, erreur: 'Surface et marché local nécessaires.' };
  const lignes = [];
  const emp = effetEmplacement(voisins, base.medianeBrute || base.mediane);
  if (emp) lignes.push({ id: 'emplacement', label: `Emplacement précis (${emp.n} ventes voisines, médiane ${emp.medianeVoisins} €/m²)`, pct: emp.pct, source: 'emplacement' });
  lignes.push(...corrections(bien, base));
  if (bien.libre) lignes.push({ id: 'libre', label: 'Ajustement personnel (vue, calme, quartier...)', pct: bien.libre, source: null });

  let facteur = 1;
  let hypotheses = 0;
  for (const l of lignes) {
    l.defaut = l.pct;
    if (surcharges[l.id] != null && Number.isFinite(surcharges[l.id])) { l.pct = surcharges[l.id]; l.modifie = true; }
    l.fiabilite = l.modifie || l.id === 'libre' ? 'saisie' : (SOURCES[l.source] || {}).fiabilite;
    if (l.fiabilite === 'hypothese') hypotheses += 1;
    l.effetM2 = base.mediane * facteur * (l.pct / 100);
    facteur *= 1 + l.pct / 100;
  }
  const ppm2 = base.mediane * facteur;
  const extras = [];
  if (bien.parkingEur > 0) extras.push({ label: 'Parking', eur: bien.parkingEur });
  if (bien.garageEur > 0) extras.push({ label: 'Garage', eur: bien.garageEur });
  const supplement = extras.reduce((s, e) => s + e.eur, 0);
  const central = ppm2 * bien.surface + supplement;

  const q = base.q;
  const marge = Math.min(0.12, 0.02 * hypotheses);
  const bas = (ppm2 * (q[1] / q[2]) * (1 - marge)) * bien.surface + supplement;
  const haut = (ppm2 * (q[3] / q[2]) * (1 + marge)) * bien.surface + supplement;

  // Confiance : qualite du marche local, emplacement precis, nombre d'hypotheses.
  let pts = 0;
  const raisons = [];
  if (base.source === 'dvf') { pts += base.n >= 100 ? 2 : base.n >= 30 ? 1 : 0; raisons.push(`${base.n} ventes réelles${base.n < 30 ? ' (peu)' : ''}`); }
  else if (base.source === 'manuel') { pts -= 1; raisons.push('prix de référence saisi par vous'); }
  else if (base.source === 'notaires') { raisons.push('médiane des notaires, sans détail des ventes'); }
  else if (base.source === 'annonces') { pts -= 1; raisons.push('prix d\'annonces (prix demandés)'); }
  if (emp) { pts += 1; raisons.push('ventes voisines prises en compte'); }
  if (hypotheses) { pts -= Math.min(2, hypotheses * 0.5); raisons.push(`${hypotheses} correction${hypotheses > 1 ? 's' : ''} fondée${hypotheses > 1 ? 's' : ''} sur une hypothèse`); }
  const confiance = pts >= 2 ? 'bonne' : pts >= 1 ? 'correcte' : pts >= 0 ? 'indicative' : 'faible';

  return { ok: true, central, bas, haut, ppm2, ppm2Base: base.mediane, facteur, lignes, extras, supplement, confiance, raisons, hypotheses };
}

export const arrondir = (v, pas = 1000) => Math.round(v / pas) * pas;
