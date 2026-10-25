/* Ecran "Plus" : comparateur de villes, investissement locatif, checklist de visite, donnees et confidentialite. */

import { esc, eur, eurM2, num, pct, signedPct, toNumber, store, frDate } from '../util.js';
import { carte, kpi, champ, selecteurHTML, brancherSelecteur, lire, toast, telecharger } from '../ui.js';
import { marche, meta, taux } from '../data.js';
import { comparateur, reglages, getCommune, exporter, importer } from '../state.js';
import { choisirStats, tendance, loyerRef } from '../analysis.js';
import { rendement, simuler, tauxPourDuree, FRAIS_NOTAIRE } from '../credit.js';
import { icon } from '../icons.js';

const CHECKLIST = [
  ['Le bien', ['État général des murs, plafonds et sols (fissures, humidité, traces de moisissure)', 'Fenêtres et isolation (double vitrage, courants d\'air, bruit)', 'Chauffage, chauffe-eau, âge et entretien', 'Électricité : tableau, prises, mise aux normes', 'Plomberie : pression, écoulements, fuites visibles', 'Luminosité et exposition aux différentes heures', 'Rangements, cave, parking, local vélo']],
  ['Copropriété et immeuble', ['Charges annuelles et ce qu\'elles couvrent', 'Travaux votés ou à prévoir (toiture, façade, ascenseur)', 'Procès-verbaux des 3 dernières assemblées générales', 'Fonds de travaux et impayés de charges', 'État des parties communes']],
  ['Quartier', ['Visite en soirée et le week-end (bruit, voisinage, stationnement)', 'Transports, commerces, écoles à pied', 'Projets d\'urbanisme à proximité', 'Risques naturels et pollution (consulter les fiches officielles de la commune)']],
  ['Documents à demander', ['Diagnostics (DPE, électricité, gaz, amiante, plomb selon l\'âge)', 'Taxe foncière et dernier avis de charges', 'Règlement de copropriété, état daté', 'Surface mesurée (loi Carrez pour un lot en copropriété)']],
];

export async function render(root) {
  function comparateurHTML() {
    return `<p class="muted">Jusqu'à 4 villes côte à côte. Ajoutez-les ici ou avec le bouton « Comparer » de l'écran Marché.</p>
      ${selecteurHTML('pick-comp', '', 'Ajouter une ville')}
      <div id="comp-table"></div>`;
  }

  async function tableComparateur() {
    const box = root.querySelector('#comp-table');
    const l = comparateur.list();
    if (!l.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="skeleton" aria-busy="true"><div></div></div>';
    const cols = await Promise.all(l.map(async (c) => {
      try {
        const m = await marche(c);
        const sa = choisirStats(m.fiche && m.fiche.a), sh = choisirStats(m.fiche && m.fiche.h);
        const ta = tendance(m.fiche && m.fiche.a);
        const la = loyerRef(m.fiche && m.fiche.l, 'Appartement', null);
        return { c, sa, sh, ta, la, rend: sa && la ? (la[0] * 12 / sa.mediane) * 100 : null, sans: m.sansDvf };
      } catch { return { c, err: true }; }
    }));
    const row = (label, f) => `<tr><th scope="row">${label}</th>${cols.map((x) => `<td>${x.err ? '--' : f(x)}</td>`).join('')}</tr>`;
    box.innerHTML = `<div class="scroll"><table class="tbl cmp"><thead><tr><th></th>${cols.map((x) => `<th>${esc(x.c.nom)}<br><button class="link" data-rm="${esc(x.c.insee)}" aria-label="Retirer ${esc(x.c.nom)}">retirer</button></th>`).join('')}</tr></thead><tbody>
      ${row('Appartement', (x) => (x.sa ? eurM2(x.sa.mediane) : x.sans ? 'hors DVF' : '--'))}
      ${row('Maison', (x) => (x.sh ? eurM2(x.sh.mediane) : x.sans ? 'hors DVF' : '--'))}
      ${row('Évolution 1 an', (x) => (x.ta && x.ta.an1 != null ? signedPct(x.ta.an1) : '--'))}
      ${row('Évolution 3 ans', (x) => (x.ta && x.ta.an3 != null ? signedPct(x.ta.an3) : '--'))}
      ${row('Loyer appart.', (x) => (x.la ? `${num(x.la[0], 1)} €/m²` : '--'))}
      ${row('Rendement brut', (x) => (x.rend != null ? pct(x.rend) : '--'))}
      ${row('Ventes (12 mois)', (x) => (x.sa ? num(x.sa.n) : '--'))}</tbody></table></div>
      <p class="note">Rendement brut = loyer d'annonce estimé × 12 ÷ prix médian d'un appartement. Indicatif.</p>`;
  }

  function investissementHTML() {
    const s = reglages.get('invest', {});
    return `<p class="muted">Rendement brut et net, et trésorerie mensuelle avec un crédit.</p>
      <div class="grid2">
        ${champ({ id: 'i-prix', label: 'Prix d\'achat', type: 'number', valeur: s.prix || '', suffixe: '€' })}
        ${champ({ id: 'i-surf', label: 'Surface (pour estimer le loyer)', type: 'number', valeur: s.surf || '', suffixe: 'm²' })}
        ${champ({ id: 'i-travaux', label: 'Travaux', type: 'number', valeur: s.travaux || '', suffixe: '€' })}
        ${champ({ id: 'i-loyer', label: 'Loyer mensuel (vide = estimation du secteur)', type: 'number', valeur: s.loyer || '', suffixe: '€/mois' })}
        ${champ({ id: 'i-charges', label: 'Charges non récupérables (par an)', type: 'number', valeur: s.charges || '', suffixe: '€' })}
        ${champ({ id: 'i-tf', label: 'Taxe foncière (par an)', type: 'number', valeur: s.tf || '', suffixe: '€' })}
        ${champ({ id: 'i-vac', label: 'Vacance locative', type: 'number', valeur: s.vac ?? 5, suffixe: '%' })}
        ${champ({ id: 'i-gest', label: 'Gestion locative', type: 'number', valeur: s.gest ?? 0, suffixe: '%' })}
        ${champ({ id: 'i-apport', label: 'Apport', type: 'number', valeur: s.apport || '', suffixe: '€' })}
        ${champ({ id: 'i-duree', label: 'Durée du crédit', type: 'number', valeur: s.duree || 20, suffixe: 'ans' })}
      </div><div id="i-out"></div>`;
  }

  async function calculInvest() {
    const g = (id) => toNumber(lire(root, id));
    const s = { prix: g('i-prix'), surf: g('i-surf'), travaux: g('i-travaux'), loyer: g('i-loyer'), charges: g('i-charges'), tf: g('i-tf'), vac: g('i-vac') ?? 5, gest: g('i-gest') ?? 0, apport: g('i-apport'), duree: g('i-duree') || 20 };
    reglages.set('invest', s);
    const out = root.querySelector('#i-out');
    if (!(s.prix > 0)) { out.innerHTML = ''; return; }
    let loyer = s.loyer, estime = false;
    const commune = getCommune();
    if (!(loyer > 0) && s.surf > 0 && commune) {
      try { const m = await marche(commune); const r = loyerRef(m.fiche && m.fiche.l, 'Appartement', null); if (r) { loyer = r[0] * s.surf; estime = true; } } catch { /* pas d'estimation */ }
    }
    if (!(loyer > 0)) { out.innerHTML = '<p class="note">Indiquez un loyer, ou une surface avec une commune choisie dans « Marché » pour estimer le loyer.</p>'; return; }
    const r = rendement({ prix: s.prix, travaux: s.travaux || 0, fraisNotairePct: FRAIS_NOTAIRE.ancien, loyerMensuel: loyer, charges: s.charges || 0, taxeFonciere: s.tf || 0, vacancePct: s.vac, gestionPct: s.gest });
    let credit = '';
    try {
      const t = await taux();
      const tx = tauxPourDuree(t.durees, s.duree);
      const c = simuler({ prix: s.prix, travaux: s.travaux || 0, fraisNotairePct: FRAIS_NOTAIRE.ancien, apport: s.apport || 0, tauxPct: tx, dureeAns: s.duree, assurancePct: t.assurance });
      const cash = r.revenuNet / 12 - c.mensualiteTotale;
      credit = `${kpi('Mensualité du crédit', eur(Math.round(c.mensualiteTotale)), `${num(tx, 2)} % sur ${s.duree} ans, assurance comprise`)}${kpi('Trésorerie mensuelle', `<span class="${cash >= 0 ? 'pos' : 'neg'}">${cash >= 0 ? '+' : ''}${eur(Math.round(cash))}</span>`, 'loyer net moins mensualité')}`;
    } catch { /* taux indisponibles : pas de simulation de crédit */ }
    out.innerHTML = `<div class="kpis">${kpi('Loyer retenu', eur(Math.round(loyer)) + '/mois', estime ? 'estimation du secteur' : 'saisi')}${kpi('Rendement brut', pct(r.brut), 'loyer annuel ÷ prix')}${kpi('Rendement net', pct(r.net), 'après vacance, charges, taxe, frais de notaire')}${credit}</div>
      <p class="note">Frais de notaire estimés à ${FRAIS_NOTAIRE.ancien} %. Hors impôt sur le revenu et prélèvements sociaux, qui dépendent de votre situation.</p>`;
  }

  function checklistHTML() {
    const coche = store.get('reg.visite', {});
    return CHECKLIST.map(([titre, items]) => `<h3 class="sec">${esc(titre)}</h3><ul class="check">${items.map((t, i) => {
      const k = `${titre}-${i}`;
      return `<li><label><input type="checkbox" data-k="${esc(k)}"${coche[k] ? ' checked' : ''}><span>${esc(t)}</span></label></li>`;
    }).join('')}</ul>`).join('') + '<div class="actions"><button class="btn ghost" id="chk-reset">Tout décocher</button></div>';
  }

  async function donneesHTML() {
    let m = null;
    try { m = await meta(); } catch { /* meta indisponible */ }
    return `<ul class="facts">
      <li><b>Prix de vente</b> : ventes réelles enregistrées par les notaires (Demandes de valeurs foncières, DGFiP / Etalab)${m ? `, ${m.dvfYears[0]} à ${m.dvfYears[m.dvfYears.length - 1]}, jusqu'au ${esc(frDate(m.dvfRef))}` : ''}. Alsace-Moselle (57, 67, 68) et Mayotte : non publiées ; l'application s'appuie alors sur les prix médians des notaires (ventes 2024, citation avec mention Notaires de France), puis sur les annonces que vous importez.</li>
      <li><b>Loyers</b> : Carte des loyers ${m ? esc(m.loyersYear) : ''}, loyers d'annonce estimés par commune (Ministère de la Transition écologique).</li>
      <li><b>Communes, codes postaux, population</b> : geo.api.gouv.fr (Etalab).</li>
      <li><b>Taux de crédit</b> : Observatoire Crédit Logement / CSA, repris à la main.</li>
      <li><b>Fond de carte</b> : OpenStreetMap, chargé seulement quand vous ouvrez la carte.</li>
    </ul>
    <p class="note">${m ? `Données générées le ${esc(frDate(m.generated))} : ${num(m.ventes)} ventes analysées, ${num(m.communes)} communes.` : ''} Les annonces des sites (Leboncoin, SeLoger, etc.) ne sont pas collectées automatiquement : leurs conditions d'utilisation l'interdisent. Vous les collez dans l'application, qui les compare aux données officielles ci-dessus.</p>
    <h3 class="sec">Confidentialité</h3>
    <p class="muted">Aucun compte, aucun suivi. Vos annonces, notes et réglages sont stockés uniquement dans ce navigateur. Les calculs se font sur votre appareil.</p>
    <div class="actions"><button class="btn ghost" id="bk-exp">${icon('download')}Sauvegarde (.json)</button><label class="btn ghost file">${icon('upload')}Restaurer<input type="file" id="bk-imp" accept="application/json,.json" hidden></label><button class="btn danger" id="bk-del">${icon('trash')}Tout effacer</button></div>`;
  }

  root.innerHTML = carte('Comparateur de villes', comparateurHTML()) + carte('Investissement locatif', investissementHTML())
    + carte('Checklist de visite', checklistHTML()) + carte('Données et confidentialité', '<div id="donnees"></div>');
  root.querySelector('#donnees').innerHTML = await donneesHTML();

  brancherSelecteur(root, 'pick-comp', async (c) => {
    toast(comparateur.add(c) ? `${c.nom} ajoutée` : 'Déjà dans le comparateur, ou 4 villes atteintes');
    root.querySelector('#pick-comp-q').value = '';
    await tableComparateur();
  });
  root.addEventListener('click', async (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { comparateur.remove(rm.dataset.rm); await tableComparateur(); }
    if (e.target.closest('#chk-reset')) { store.del('reg.visite'); root.querySelectorAll('.check input').forEach((i) => { i.checked = false; }); }
    if (e.target.closest('#bk-exp')) telecharger(`veille-immo-${new Date().toISOString().slice(0, 10)}.json`, exporter());
    if (e.target.closest('#bk-del') && confirm('Effacer toutes vos annonces, recherches et réglages sur cet appareil ?')) {
      Object.keys(localStorage).filter((k) => k.startsWith('immo.')).forEach((k) => localStorage.removeItem(k));
      toast('Données effacées');
      location.hash = '#marche';
      location.reload();
    }
  });
  root.addEventListener('change', async (e) => {
    if (e.target.matches('.check input')) {
      const c = store.get('reg.visite', {});
      c[e.target.dataset.k] = e.target.checked;
      store.set('reg.visite', c);
    }
    if (e.target.id === 'bk-imp') {
      const f = e.target.files[0];
      if (!f) return;
      try { toast(`${importer(await f.text())} annonce(s) restaurée(s)`); } catch (err) { toast(err.message); }
    }
  });
  let timer;
  root.addEventListener('input', (e) => { if (e.target.id && e.target.id.startsWith('i-')) { clearTimeout(timer); timer = setTimeout(calculInvest, 250); } });
  await tableComparateur();
  calculInvest();
}
