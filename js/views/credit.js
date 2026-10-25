/* Ecran "Credit" : simulation d'un pret, capacite d'emprunt, comparaison de durees, surface achetable dans la commune consultee. */

import { esc, eur, eurM2, num, pct, toNumber } from '../util.js';
import { carte, kpi, champ, segments, brancherSegments, lire } from '../ui.js';
import { taux, marche, communeParInsee } from '../data.js';
import { getCommune, reglages } from '../state.js';
import { tauxPourDuree, simuler, capacite, amortissement, surfaceAchetable, FRAIS_NOTAIRE, ENDETTEMENT_MAX, DUREE_MAX } from '../credit.js';
import { choisirStats } from '../analysis.js';
import { amortissementChart } from '../charts.js';

const DEF = { prix: '', travaux: '', apport: '', duree: 20, neuf: false, frais: '', ajust: 0, assurance: '', tauxManuel: '', revenus: '', charges: '' };

export async function render(root, params = {}) {
  let t;
  try { t = await taux(); } catch { root.innerHTML = carte('', '<div class="notice warn"><p>Taux de référence indisponibles. Vérifiez la connexion.</p></div>'); return; }
  let s = { ...DEF, ...reglages.get('credit', {}) };
  let onglet = reglages.get('creditOnglet', 'simuler');
  let commune = getCommune();
  if (params.insee) { const c = await communeParInsee(params.insee); if (c) commune = c; }
  if (params.prix) { s.prix = params.prix; onglet = 'simuler'; }

  const num0 = (v) => toNumber(v) || 0;
  const lireTout = () => {
    s = {
      prix: lire(root, 'c-prix'), travaux: lire(root, 'c-travaux'), apport: lire(root, 'c-apport'), duree: toNumber(lire(root, 'c-duree')) || 20,
      neuf: root.querySelector('#c-neuf') ? root.querySelector('#c-neuf').value === '1' : s.neuf, frais: lire(root, 'c-frais'), ajust: lire(root, 'c-ajust'),
      assurance: lire(root, 'c-assur'), tauxManuel: lire(root, 'c-taux'), revenus: lire(root, 'c-rev'), charges: lire(root, 'c-chg'),
    };
    reglages.set('credit', s);
  };
  const params2 = () => {
    const duree = Math.min(35, Math.max(1, s.duree));
    const ref = tauxPourDuree(t.durees, duree);
    const tx = toNumber(s.tauxManuel) != null ? toNumber(s.tauxManuel) : Math.max(0, ref + num0(s.ajust));
    return {
      duree, ref, tx,
      fraisPct: toNumber(s.frais) != null ? toNumber(s.frais) : (s.neuf ? FRAIS_NOTAIRE.neuf : FRAIS_NOTAIRE.ancien),
      assur: toNumber(s.assurance) != null ? toNumber(s.assurance) : t.assurance,
    };
  };

  function formulaire() {
    const p = params2();
    const commun = `${champ({ id: 'c-duree', label: 'Durée', type: 'number', valeur: s.duree, suffixe: 'ans' })}
      ${champ({ id: 'c-taux', label: 'Taux appliqué (laisser vide = taux moyen)', type: 'number', valeur: s.tauxManuel, suffixe: '%', attrs: `placeholder="${num(p.ref + num0(s.ajust), 2)}"` })}
      ${champ({ id: 'c-ajust', label: 'Écart par rapport au taux moyen', type: 'number', valeur: s.ajust, suffixe: 'points', aide: 'Par exemple -0,20 pour une bonne offre, +0,30 pour un dossier plus fragile.' })}
      ${champ({ id: 'c-assur', label: 'Assurance emprunteur (par an)', type: 'number', valeur: s.assurance, suffixe: '%', attrs: `placeholder="${num(t.assurance, 2)}"` })}`;
    const simul = `<div class="grid2">${champ({ id: 'c-prix', label: 'Prix du bien', type: 'number', valeur: s.prix, suffixe: '€' })}
        ${champ({ id: 'c-travaux', label: 'Travaux', type: 'number', valeur: s.travaux, suffixe: '€' })}
        ${champ({ id: 'c-apport', label: 'Apport', type: 'number', valeur: s.apport, suffixe: '€' })}
        <div class="field"><label for="c-neuf">Type de bien</label><div class="inp"><select id="c-neuf"><option value="0"${s.neuf ? '' : ' selected'}>Ancien</option><option value="1"${s.neuf ? ' selected' : ''}>Neuf</option></select></div></div>
        ${champ({ id: 'c-frais', label: 'Frais de notaire', type: 'number', valeur: s.frais, suffixe: '%', attrs: `placeholder="${s.neuf ? FRAIS_NOTAIRE.neuf : FRAIS_NOTAIRE.ancien}"`, aide: 'Estimation courante : 7 à 8 % dans l\'ancien, 2 à 3 % dans le neuf.' })}
        ${commun}
        ${champ({ id: 'c-rev', label: 'Revenus nets mensuels du foyer (facultatif)', type: 'number', valeur: s.revenus, suffixe: '€' })}
        ${champ({ id: 'c-chg', label: 'Autres crédits en cours (par mois)', type: 'number', valeur: s.charges, suffixe: '€' })}</div>`;
    const capa = `<div class="grid2">${champ({ id: 'c-rev', label: 'Revenus nets mensuels du foyer', type: 'number', valeur: s.revenus, suffixe: '€' })}
        ${champ({ id: 'c-chg', label: 'Autres crédits en cours (par mois)', type: 'number', valeur: s.charges, suffixe: '€' })}
        ${champ({ id: 'c-apport', label: 'Apport', type: 'number', valeur: s.apport, suffixe: '€' })}
        <div class="field"><label for="c-neuf">Type de bien</label><div class="inp"><select id="c-neuf"><option value="0"${s.neuf ? '' : ' selected'}>Ancien</option><option value="1"${s.neuf ? ' selected' : ''}>Neuf</option></select></div></div>
        ${champ({ id: 'c-frais', label: 'Frais de notaire', type: 'number', valeur: s.frais, suffixe: '%', attrs: `placeholder="${s.neuf ? FRAIS_NOTAIRE.neuf : FRAIS_NOTAIRE.ancien}"` })}
        ${commun}</div>
        <input type="hidden" id="c-prix" value="${esc(s.prix)}"><input type="hidden" id="c-travaux" value="${esc(s.travaux)}">`;
    return `${segments('seg-credit', [['simuler', 'Simuler un achat'], ['capacite', 'Ma capacité']], onglet)}${onglet === 'simuler' ? simul : capa}`;
  }

  function tauxInfo() {
    const p = params2();
    return `<div class="rates"><p><b>Taux appliqué : ${num(p.tx, 2)} %</b> sur ${num(p.duree, 0)} ans <span class="muted">(moyenne du marché pour cette durée : ${num(p.ref, 2)} %)</span></p>
      <table class="tbl"><thead><tr><th>Durée</th>${t.durees.map((d) => `<th>${d.duree} ans</th>`).join('')}</tr></thead><tbody><tr><td>Taux moyen</td>${t.durees.map((d) => `<td>${num(d.taux, 2)} %</td>`).join('')}</tr></tbody></table>
      <p class="note">${esc(t.source)}. Taux global ${num(t.global.taux, 2)} % en ${esc(t.global.mois)}. Mis à jour le ${esc(t.maj)}.</p>
      <p class="note">${esc(t.avertissement)}</p></div>`;
  }

  async function resultats() {
    const out = root.querySelector('#out');
    const p = params2();
    if (onglet === 'simuler') {
      const prix = num0(s.prix);
      if (!(prix > 0)) { out.innerHTML = carte('Résultat', '<p class="muted">Saisissez le prix du bien pour voir la mensualité, le coût du crédit et le tableau d\'amortissement.</p>') + carte('Taux', tauxInfo()); return; }
      const r = simuler({ prix, travaux: num0(s.travaux), fraisNotairePct: p.fraisPct, apport: num0(s.apport), tauxPct: p.tx, dureeAns: p.duree, assurancePct: p.assur });
      const rev = num0(s.revenus);
      const endet = rev > 0 ? ((r.mensualiteTotale + num0(s.charges)) / rev) * 100 : null;
      const al = [];
      if (p.duree > DUREE_MAX) al.push(`Durée supérieure à ${DUREE_MAX} ans : la norme en vigueur autorise 25 ans (27 ans dans le neuf ou avec travaux importants), sauf dérogation de la banque.`);
      if (endet != null && endet > ENDETTEMENT_MAX) al.push(`Taux d'endettement de ${num(endet, 1)} % : au-dessus de ${ENDETTEMENT_MAX} %, la plupart des banques refusent le dossier.`);
      if (!r.apportCouvreFrais) al.push(`L'apport (${eur(num0(s.apport))}) ne couvre pas les frais de notaire estimés (${eur(r.fraisNotaire)}) : beaucoup de banques l'exigent.`);
      const rows = [10, 15, 20, 25].map((d) => {
        const tx = toNumber(s.tauxManuel) != null ? toNumber(s.tauxManuel) : Math.max(0, tauxPourDuree(t.durees, d) + num0(s.ajust));
        const x = simuler({ prix, travaux: num0(s.travaux), fraisNotairePct: p.fraisPct, apport: num0(s.apport), tauxPct: tx, dureeAns: d, assurancePct: p.assur });
        return `<tr><td>${d} ans</td><td>${num(tx, 2)} %</td><td>${eur(Math.round(x.mensualiteTotale))}</td><td>${eur(Math.round(x.coutCredit))}</td></tr>`;
      }).join('');
      let surf = '';
      if (commune) {
        try {
          const m = await marche(commune);
          const sa = choisirStats(m.fiche && m.fiche.a), sh = choisirStats(m.fiche && m.fiche.h);
          surf = (sa || sh) ? `<p class="line">À ${esc(commune.nom)}, ce budget de ${eur(prix)} correspond à ${[sa && `environ <b>${num(surfaceAchetable(prix, sa.mediane))} m²</b> d'appartement (${eurM2(sa.mediane)})`, sh && `<b>${num(surfaceAchetable(prix, sh.mediane))} m²</b> de maison (${eurM2(sh.mediane)})`].filter(Boolean).join(' ou ')}.</p>` : '';
        } catch { /* donnees de marche indisponibles : on n'affiche pas la surface */ }
      }
      out.innerHTML = carte('Résultat', `<div class="kpis">
          ${kpi('Mensualité avec assurance', eur(Math.round(r.mensualiteTotale)), `dont assurance ${eur(Math.round(r.assurance))}`)}
          ${kpi('Capital emprunté', eur(Math.round(r.capital)), `projet total ${eur(Math.round(r.coutProjet))}`)}
          ${kpi('Coût du crédit', eur(Math.round(r.coutCredit)), `intérêts ${eur(Math.round(r.interets))} + assurance ${eur(Math.round(r.coutAssurance))}`)}
          ${kpi('Frais de notaire', eur(Math.round(r.fraisNotaire)), `${num(p.fraisPct, 1)} % du prix`)}
          ${endet != null ? kpi('Taux d\'endettement', pct(endet), `limite usuelle ${ENDETTEMENT_MAX} %`) : ''}
        </div>${al.length ? `<ul class="alerts">${al.map((x) => `<li class="warn">${esc(x)}</li>`).join('')}</ul>` : ''}${surf}`)
        + carte('Comparer les durées', `<table class="tbl"><thead><tr><th>Durée</th><th>Taux</th><th>Mensualité</th><th>Coût du crédit</th></tr></thead><tbody>${rows}</tbody></table>`)
        + carte('Remboursement année par année', `${amortissementChart(amortissement(r.capital, p.tx, p.duree))}<p class="legend"><span class="dotl cap"></span>capital <span class="dotl int"></span>intérêts</p>`)
        + carte('Taux', tauxInfo());
      return;
    }
    const rev = num0(s.revenus);
    if (!(rev > 0)) { out.innerHTML = carte('Résultat', '<p class="muted">Saisissez vos revenus nets mensuels pour connaître la mensualité maximale, le montant empruntable et le prix du bien accessible.</p>') + carte('Taux', tauxInfo()); return; }
    const c = capacite({ revenus: rev, charges: num0(s.charges), apport: num0(s.apport), tauxPct: p.tx, dureeAns: p.duree, assurancePct: p.assur, fraisNotairePct: p.fraisPct });
    let surf = '';
    if (commune && c.prixMax > 0) {
      try {
        const m = await marche(commune);
        const sa = choisirStats(m.fiche && m.fiche.a), sh = choisirStats(m.fiche && m.fiche.h);
        if (sa || sh) surf = `<p class="line">À ${esc(commune.nom)} : environ ${[sa && `<b>${num(surfaceAchetable(c.prixMax, sa.mediane))} m²</b> en appartement (${eurM2(sa.mediane)})`, sh && `<b>${num(surfaceAchetable(c.prixMax, sh.mediane))} m²</b> en maison (${eurM2(sh.mediane)})`].filter(Boolean).join(' ou ')}.</p>`;
      } catch { /* donnees de marche indisponibles */ }
    } else if (!commune) surf = '<p class="note">Choisissez une commune dans « Marché » pour voir la surface que ce budget permet d\'acheter.</p>';
    out.innerHTML = carte('Résultat', `<div class="kpis">
        ${kpi('Mensualité maximale', eur(Math.round(c.mensualiteMax)), `${ENDETTEMENT_MAX} % des revenus${num0(s.charges) ? ' moins vos crédits' : ''}, assurance comprise`)}
        ${kpi('Montant empruntable', eur(Math.round(c.capital)), `sur ${num(p.duree, 0)} ans à ${num(p.tx, 2)} %`)}
        ${kpi('Budget total', eur(Math.round(c.budget)), 'emprunt + apport')}
        ${kpi('Prix du bien accessible', eur(Math.round(c.prixMax)), `frais de notaire ${eur(Math.round(c.fraisNotaire))} inclus dans le budget`)}
      </div>${p.duree > DUREE_MAX ? `<ul class="alerts"><li class="warn">Durée supérieure à ${DUREE_MAX} ans : à vérifier avec votre banque (27 ans possible dans le neuf ou avec travaux importants).</li></ul>` : ''}${surf}
      <div class="actions"><a class="btn" href="#credit?prix=${Math.round(c.prixMax)}${commune ? '&insee=' + esc(commune.insee) : ''}">Simuler ce prix</a></div>`)
      + carte('Taux', tauxInfo());
  }

  function dessiner() {
    root.innerHTML = carte('Crédit immobilier', `${formulaire()}`) + '<div id="out"></div>';
    brancherSegments(root, 'seg-credit', (v) => { lireTout(); onglet = v; reglages.set('creditOnglet', v); dessiner(); });
    resultats();
  }

  let timer;
  root.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { lireTout(); resultats(); }, 200); });
  root.addEventListener('change', () => { lireTout(); resultats(); });

  reglages.set('credit', s);
  dessiner();
}
