/* Graphiques SVG sans dependance. Les couleurs viennent des variables CSS (themes clair et sombre). */

import { num, esc } from './util.js';

/* Courbes d'evolution : series = [{ nom, classe, points: [{ x, y }] }], x = annee (texte). */
export function courbes(series, { unite = '€/m²', hauteur = 150 } = {}) {
  const pts = series.flatMap((s) => s.points);
  if (!pts.length) return '';
  const xs = [...new Set(pts.map((p) => p.x))].sort();
  const ys = pts.map((p) => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  const marge = (max - min) * 0.18 || max * 0.1 || 1;
  min -= marge; max += marge;
  const W = 320, H = hauteur, L = 44, R = 10, T = 10, B = 22;
  const X = (x) => L + (xs.length === 1 ? (W - L - R) / 2 : (xs.indexOf(x) / (xs.length - 1)) * (W - L - R));
  const Y = (y) => T + (1 - (y - min) / (max - min)) * (H - T - B);
  const grille = [0, 0.5, 1].map((k) => {
    const v = min + (max - min) * k;
    return `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="axis" x="${L - 6}" y="${(Y(v) + 3).toFixed(1)}" text-anchor="end">${num(v)}</text>`;
  }).join('');
  const labels = xs.map((x) => `<text class="axis" x="${X(x).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(x)}</text>`).join('');
  const lignes = series.map((s) => {
    if (!s.points.length) return '';
    const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${X(p.x).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
    const dots = s.points.map((p) => `<circle class="dot ${s.classe}" cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="3.2"><title>${esc(s.nom)} ${esc(p.x)} : ${num(p.y)} ${unite}</title></circle>`).join('');
    return `<path class="line ${s.classe}" d="${d}"/>${dots}`;
  }).join('');
  const resume = series.map((s) => `${s.nom} : ${s.points.map((p) => `${p.x} ${num(p.y)}`).join(', ')}`).join(' ; ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`Évolution du prix médian au m². ${resume}`)}">${grille}${labels}${lignes}</svg>`;
}

/* Position d'un prix au m2 dans la distribution locale : barre p10-p90, boite p25-p75, mediane et repere du bien. */
export function distribution(q, valeur, { unite = '€/m²' } = {}) {
  const min = Math.min(q[0], valeur) * 0.92, max = Math.max(q[4], valeur) * 1.06;
  const W = 320, L = 10, R = 10;
  const X = (v) => L + ((v - min) / (max - min)) * (W - L - R);
  const lab = (v, anchor, y = 56) => `<text class="axis" x="${X(v).toFixed(1)}" y="${y}" text-anchor="${anchor}">${num(v)}</text>`;
  return `<svg class="chart dist" viewBox="0 0 ${W} 70" role="img" aria-label="${esc(`Ce bien : ${num(valeur)} ${unite}. Marché : médiane ${num(q[2])}, entre ${num(q[1])} et ${num(q[3])} pour la moitié des ventes.`)}">
    <line class="whisker" x1="${X(q[0]).toFixed(1)}" x2="${X(q[4]).toFixed(1)}" y1="26" y2="26"/>
    <rect class="box" x="${X(q[1]).toFixed(1)}" y="16" width="${(X(q[3]) - X(q[1])).toFixed(1)}" height="20" rx="4"/>
    <line class="med" x1="${X(q[2]).toFixed(1)}" x2="${X(q[2]).toFixed(1)}" y1="12" y2="40"/>
    <path class="mark" d="M${X(valeur).toFixed(1)} 44 l-6 -9 h12 z"/>
    <text class="axis strong" x="${X(valeur).toFixed(1)}" y="10" text-anchor="middle">Ce bien ${num(valeur)}</text>
    ${lab(q[0], 'middle')}${lab(q[2], 'middle')}${lab(q[4], 'middle')}
  </svg>`;
}

/* Capital rembourse et interets par annee. rows : sortie de amortissement(). */
export function amortissementChart(rows) {
  const W = 320, H = 130, L = 8, R = 8, T = 8, B = 20;
  const max = Math.max(...rows.map((r) => r.interets + r.rembourse));
  const bw = (W - L - R) / rows.length;
  const barres = rows.map((r, i) => {
    const hC = ((r.rembourse) / max) * (H - T - B), hI = ((r.interets) / max) * (H - T - B);
    const x = L + i * bw + bw * 0.12, w = bw * 0.76;
    const yC = H - B - hC, yI = yC - hI;
    return `<rect class="bar cap" x="${x.toFixed(1)}" y="${yC.toFixed(1)}" width="${w.toFixed(1)}" height="${hC.toFixed(1)}"><title>Année ${r.annee} : capital ${num(r.rembourse)} €</title></rect><rect class="bar int" x="${x.toFixed(1)}" y="${yI.toFixed(1)}" width="${w.toFixed(1)}" height="${hI.toFixed(1)}"><title>Année ${r.annee} : intérêts ${num(r.interets)} €</title></rect>`;
  }).join('');
  const pas = rows.length > 15 ? 5 : rows.length > 8 ? 2 : 1;
  const axe = rows.map((r, i) => (r.annee % pas === 0 || i === 0 ? `<text class="axis" x="${(L + i * bw + bw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle">${r.annee}</text>` : '')).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Répartition annuelle entre capital remboursé et intérêts">${barres}${axe}</svg>`;
}
