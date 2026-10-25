/* Affichage du resultat d'une analyse (achat ou location), partage entre "Analyser" et "Ma veille". */

import { esc, eur, eurM2, num, pct, signedPct, frDate } from '../util.js';
import { badge, kpi } from '../ui.js';
import { distribution, barometre } from '../charts.js';

const TONE_TXT = { good: 'good', neutral: 'neutral', warn: 'warn', bad: 'bad', info: 'info' };

export function resultatAchat(r, a) {
  if (!r.ok) {
    return `<div class="notice warn"><p>${esc(r.erreur || 'Analyse impossible.')}</p></div>${r.alertes && r.alertes.length ? alertes(r.alertes) : ''}`;
  }
  const v = r.verdict;
  const position = r.ecart <= 0 ? `${num(Math.abs(r.ecart), 1)} % sous la médiane du secteur` : `${num(r.ecart, 1)} % au-dessus de la médiane du secteur`;
  return `
    <div class="baro">${barometre(r.ecart, v.label)}
      <p class="baro-txt"><b>${esc(v.label)}</b>${esc(position)} (${eurM2(r.stats.mediane)}). ${esc(v.texte)} Moins cher que ${num(100 - r.score)} % des ventes comparables.</p></div>
    <div class="figs">
      ${kpi('Prix au m² du bien', eurM2(r.ppm2), `médiane du secteur ${eurM2(r.stats.mediane)}`)}
      ${kpi(`Prix attendu pour ${num(a.surface)} m²`, eur(r.attendu.median), `de ${eur(r.attendu.bas)} à ${eur(r.attendu.haut)} pour la moitié des ventes`)}
      ${kpi('Offre à viser', eur(r.cible), r.economie > 0 ? `${eur(r.economie)} de moins que le prix demandé` : 'prix déjà aligné')}
      ${r.rendementBrut != null ? kpi('Rendement brut estimé', pct(r.rendementBrut), `loyer du secteur ≈ ${eur(r.loyerEstime)} par mois`) : ''}
    </div>
    <h3 class="sec">Où se situe ce prix</h3>
    <div class="distrib">${distribution(r.stats.q, r.ppm2)}<p class="note">80 % des ventes se font entre ${eurM2(r.stats.q[0])} et ${eurM2(r.stats.q[4])}, la moitié entre ${eurM2(r.stats.q[1])} et ${eurM2(r.stats.q[3])}.</p></div>
    ${r.tendance && (r.tendance.an1 != null) ? `<p class="line">Évolution des prix dans le secteur : <b>${signedPct(r.tendance.an1)}</b> sur 1 an${r.tendance.an3 != null ? `, <b>${signedPct(r.tendance.an3)}</b> sur 3 ans` : ''}.</p>` : ''}
    ${alertes(r.alertes)}
    <p class="note">${noteSource(r, a)}</p>
    ${r.comparables && r.comparables.length ? comparablesHTML(r.comparables) : ''}`;
}

export function resultatLocation(r, a) {
  if (!r.ok) return `<div class="notice warn"><p>${esc(r.erreur || 'Analyse impossible.')}</p></div>`;
  const v = r.verdict;
  return `
    <div class="baro">${barometre(r.ecart, v.label)}
      <p class="baro-txt"><b>${esc(v.label)}</b>${esc(r.ecart <= 0 ? `${num(Math.abs(r.ecart), 0)} % sous` : `${num(r.ecart, 0)} % au-dessus de`)} le loyer d'annonce habituel du secteur. ${esc(v.texte)}</p></div>
    <div class="figs">
      ${kpi('Loyer au m²', `${num(r.ppm2, 1)} €/m²`, `référence du secteur ${num(r.ref[0], 1)} €/m²`)}
      ${kpi(`Loyer attendu pour ${num(a.surface)} m²`, eur(r.loyerAttendu), `de ${eur(Math.round(r.ref[1] * a.surface))} à ${eur(Math.round(r.ref[2] * a.surface))}`)}
    </div>
    <p class="note">Loyers d'annonce charges comprises, estimés par commune (Carte des loyers 2025, Ministère de la Transition écologique). Dans les villes à encadrement des loyers, le plafond légal peut être inférieur.</p>`;
}

function noteSource(r, a) {
  const src = r.marche.sources && r.marche.sources[a.type === 'Maison' ? 'h' : 'a'];
  const nom = esc(r.commune.nom);
  if (src === 'manuel') return `Base : prix de référence saisi par vous pour ${nom}, fourchette estimée à ± 15 %.`;
  if (src === 'notaires') return `Base : prix médian des ventes 2024 publié par les notaires pour ${nom}, fourchette estimée à ± 15 % (pas de données de vente détaillées dans ce département).`;
  if (src === 'annonces') return `Base : ${num(r.stats.n)} annonces observées dans vos imports à ${nom}. Ce sont des prix demandés, en général au-dessus des prix de vente : le verdict est comparatif, pas absolu.`;
  return `Base : ${num(r.stats.n)} ventes réelles (${esc(r.stats.fenetre)}) à ${nom}${r.perimetre !== 'commune' ? ' (code postal ' + esc(r.perimetre) + ')' : ''}, fiabilité ${esc(r.stats.fiabilite)}.`;
}

export const alertes = (l) => (l && l.length ? `<ul class="alerts">${l.map((x) => `<li class="${x.tone}">${esc(x.texte)}</li>`).join('')}</ul>` : '');

export function comparablesHTML(l) {
  return `<h3 class="sec">Ventes comparables récentes</h3><ul class="comps">${l.map((c) => `<li><div><b>${eur(c.prix)}</b>, ${num(c.surface)} m²${c.pieces ? `, ${c.pieces} p.` : ''}<small>${esc(c.adresse || 'Adresse non précisée')}, ${esc(frDate(c.date))}${c.dist ? `, à ${num(c.dist, 1)} km` : ''}</small></div><b class="ppm">${eurM2(c.ppm2)}</b></li>`).join('')}</ul>`;
}

export const badgeVerdict = (r) => (r && r.ok ? badge(r.verdict.tone, r.verdict.label) : badge('info', 'Non évalué'));
