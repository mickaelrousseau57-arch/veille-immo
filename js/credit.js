/* Calculs de credit immobilier, capacite d'emprunt, rendement locatif. Fonctions pures, sans DOM. */

export const FRAIS_NOTAIRE = { ancien: 7.5, neuf: 2.5 }; // en % du prix, estimation courante a ajuster
export const ENDETTEMENT_MAX = 35; // % des revenus, assurance comprise (norme HCSF)
export const DUREE_MAX = 25; // ans (27 pour le neuf ou avec travaux importants)

/* Mensualite hors assurance d'un pret amortissable a taux fixe. */
export function mensualite(capital, tauxPct, dureeAns) {
  const n = Math.round(dureeAns * 12);
  if (!(capital > 0) || !(n > 0)) return 0;
  const r = tauxPct / 100 / 12;
  if (r === 0) return capital / n;
  return (capital * r) / (1 - (1 + r) ** -n);
}

/* Taux de reference pour une duree donnee : interpolation lineaire dans la table [{duree, taux}]. */
export function tauxPourDuree(table, duree) {
  const t = [...table].sort((a, b) => a.duree - b.duree);
  if (!t.length) return null;
  if (t.length === 1) return t[0].taux;
  let i = t.findIndex((x) => x.duree >= duree);
  if (i === 0) i = 1; // en dessous de la plus courte duree : on prolonge la premiere pente
  if (i === -1) i = t.length - 1; // au dela de la plus longue : on prolonge la derniere pente
  const a = t[i - 1], b = t[i];
  const taux = a.taux + ((b.taux - a.taux) * (duree - a.duree)) / (b.duree - a.duree);
  return Math.max(0, Math.round(taux * 100) / 100);
}

/* Simulation d'un achat financee par un pret.
   prix : prix du bien ; travaux ; fraisNotairePct ; apport ; tauxPct ; dureeAns ; assurancePct (annuel, sur capital initial). */
export function simuler({ prix, travaux = 0, fraisNotairePct = FRAIS_NOTAIRE.ancien, apport = 0, tauxPct, dureeAns, assurancePct = 0.3 }) {
  const fraisNotaire = (prix * fraisNotairePct) / 100;
  const coutProjet = prix + travaux + fraisNotaire;
  const capital = Math.max(0, coutProjet - apport);
  const mens = mensualite(capital, tauxPct, dureeAns);
  const assurance = (capital * assurancePct) / 100 / 12;
  const n = Math.round(dureeAns * 12);
  const interets = mens * n - capital;
  const coutAssurance = assurance * n;
  return {
    fraisNotaire, coutProjet, capital, mensualite: mens, assurance, mensualiteTotale: mens + assurance,
    interets, coutAssurance, coutCredit: interets + coutAssurance, coutTotal: coutProjet + interets + coutAssurance,
    apportCouvreFrais: apport >= fraisNotaire,
  };
}

/* Capacite d'emprunt : mensualite maximale selon le taux d'endettement, puis budget et prix maximum du bien. */
export function capacite({ revenus, charges = 0, apport = 0, tauxPct, dureeAns, assurancePct = 0.3, endettementPct = ENDETTEMENT_MAX, fraisNotairePct = FRAIS_NOTAIRE.ancien }) {
  const mensMax = Math.max(0, (revenus * endettementPct) / 100 - charges);
  const facteur = mensualite(1, tauxPct, dureeAns) + assurancePct / 100 / 12;
  const capital = facteur > 0 ? mensMax / facteur : 0;
  const budget = capital + Math.max(0, apport);
  const prixMax = budget / (1 + fraisNotairePct / 100);
  return { mensualiteMax: mensMax, capital, budget, prixMax, fraisNotaire: prixMax * (fraisNotairePct / 100) };
}

/* Tableau d'amortissement annuel : interets payes, capital rembourse et capital restant du a la fin de chaque annee. */
export function amortissement(capital, tauxPct, dureeAns) {
  const n = Math.round(dureeAns * 12);
  const m = mensualite(capital, tauxPct, dureeAns);
  const r = tauxPct / 100 / 12;
  let restant = capital;
  const rows = [];
  let interets = 0, rembourse = 0;
  for (let k = 1; k <= n; k++) {
    const i = restant * r;
    const c = Math.min(restant, m - i);
    interets += i;
    rembourse += c;
    restant = Math.max(0, restant - c);
    if (k % 12 === 0 || k === n) {
      rows.push({ annee: Math.ceil(k / 12), interets, rembourse, restant });
      interets = 0;
      rembourse = 0;
    }
  }
  return rows;
}

/* Surface achetable avec un budget a un prix au m2 donne. */
export const surfaceAchetable = (prixMax, prixM2) => (prixM2 > 0 ? prixMax / prixM2 : null);

/* Rendement locatif.
   brut : loyer annuel / prix du bien. net : apres vacance, gestion, charges non recuperables, taxe fonciere, assurance PNO,
   rapporte au cout total (prix + frais + travaux). */
export function rendement({ prix, travaux = 0, fraisNotairePct = FRAIS_NOTAIRE.ancien, loyerMensuel, charges = 0, taxeFonciere = 0, vacancePct = 5, gestionPct = 0, pno = 0 }) {
  const frais = (prix * fraisNotairePct) / 100;
  const coutTotal = prix + travaux + frais;
  const loyerAn = loyerMensuel * 12;
  const encaisse = loyerAn * (1 - vacancePct / 100);
  const depenses = (loyerAn * gestionPct) / 100 + charges + taxeFonciere + pno;
  const revenuNet = encaisse - depenses;
  return {
    brut: prix > 0 ? (loyerAn / prix) * 100 : null,
    net: coutTotal > 0 ? (revenuNet / coutTotal) * 100 : null,
    revenuNet, depenses, coutTotal, loyerAn,
  };
}

/* Loyer necessaire pour atteindre un rendement brut cible. */
export const loyerPourRendement = (prix, brutPct) => (prix * brutPct) / 100 / 12;
