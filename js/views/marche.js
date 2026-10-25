/* Ecran "Marche" : vue d'ensemble d'une commune ou d'un code postal (prix reels, loyers, tendance, ventes, liens vers les sites). */

import { esc, eur, eurM2, num, pct, signedPct, store, frDate, toNumber } from '../util.js';
import { carte, kpi, segments, brancherSegments, selecteurHTML, brancherSelecteur, recents, toast, copier, champ } from '../ui.js';
import { marche, ventes } from '../data.js';
import { getCommune, setCommune, comparateur, recherches, setRef } from '../state.js';
import { choisirStats, tendance, loyerRef } from '../analysis.js';
import { courbes } from '../charts.js';
import { afficherVentes } from '../map.js';
import { liensRecherche, criteres } from '../portals.js';
import { icon } from '../icons.js';

const EXEMPLES = ['Paris', 'Lyon', 'Bordeaux', 'Nantes', 'Lille', 'Toulouse'];

export async function render(root, params = {}) {
  let commune = getCommune();
  let cp = commune && commune.cp ? commune.cp : null;
  let type = store.get('reg.typeMarche', 'Appartement');
  let modeLiens = store.get('reg.modeLiens', 'achat');

  const choisir = (c) => {
    setCommune(c);
    recents.add(c);
    commune = getCommune();
    cp = c.cp || null;
    dessiner();
  };

  async function demarrer() {
    if (params.insee && (!commune || commune.insee !== params.insee)) {
      const { communeParInsee } = await import('../data.js');
      const c = await communeParInsee(params.insee);
      if (c) { setCommune(c); commune = getCommune(); }
    }
    dessiner();
  }

  function entete() {
    return carte('', `${selecteurHTML('pick-marche', commune ? commune.nom : '')}
      <div class="chips" id="rec">${recents.list().filter((r) => !commune || r.insee !== commune.insee).map((r) => `<button class="chip" data-insee="${esc(r.insee)}">${esc(r.nom)}</button>`).join('')}</div>`, { classe: 'search' });
  }

  async function dessiner() {
    root.innerHTML = entete() + '<div id="corps"></div>';
    brancherSelecteur(root, 'pick-marche', choisir);
    root.querySelector('#rec').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-insee]');
      if (!b) return;
      const c = recents.list().find((r) => r.insee === b.dataset.insee);
      if (c) choisir(c);
    });
    const corps = root.querySelector('#corps');
    if (!commune) { corps.innerHTML = accueil(); brancherAccueil(corps); return; }
    corps.innerHTML = '<div class="skeleton" aria-busy="true"><div></div><div></div><div></div></div>';
    let m;
    try { m = await marche(commune, cp); } catch (e) { corps.innerHTML = carte('', `<div class="notice warn"><p>Données indisponibles pour ce département (${esc(e.message)}). Vérifiez la connexion puis réessayez.</p></div>`); return; }
    corps.innerHTML = fiche(m);
    brancher(corps, m);
  }

  function accueil() {
    return carte('Veille immobilière', `<p class="lead">Cherchez une ville ou un code postal pour voir les <b>prix réels de vente</b> au m², les <b>loyers</b>, la <b>tendance</b> et les liens vers les sites d'annonces.</p>
      <div class="chips">${EXEMPLES.map((n) => `<button class="chip" data-q="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      <p class="note">Données officielles : ventes enregistrées par les notaires (DVF) et loyers d'annonce par commune. Rien n'est envoyé : vos recherches et vos annonces restent sur cet appareil.</p>`);
  }
  function brancherAccueil(corps) {
    corps.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-q]');
      if (!b) return;
      const { chercher } = await import('../data.js');
      const r = await chercher(b.dataset.q, 1);
      if (r[0]) choisir(r[0]);
    });
  }

  function fiche(m) {
    const c = m.commune;
    const f = m.fiche || {};
    const scopes = c.cps.filter((x) => m.parCp[x]);
    const bloc = f[type === 'Maison' ? 'h' : 'a'];
    const stats = choisirStats(bloc);
    const t = tendance(bloc);
    const src = m.sources && m.sources[type === 'Maison' ? 'h' : 'a'];
    const l = f.l;
    const loyer = loyerRef(l, type, null);
    const rendement = stats && loyer ? ((loyer[0] * 12) / stats.mediane) * 100 : null;
    let h = '';

    h += carte('', `<div class="head"><div><h1>${esc(c.nom)}</h1><p class="muted">${esc(c.cps.join(', '))} · département ${esc(c.dep)}${c.pop ? ' · ' + num(c.pop) + ' hab.' : ''}</p></div>
      <div class="actions"><button class="btn ghost" id="btn-comp">${icon('plus')}Comparer</button></div></div>
      ${scopes.length > 1 ? `<div class="chips scope"><button class="chip${cp ? '' : ' on'}" data-cp="">Toute la commune</button>${scopes.map((x) => `<button class="chip${cp === x ? ' on' : ''}" data-cp="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}`);

    if (m.sansDvf) h += refManuelle(m);
    else if (!f.a && !f.h) h += carte('', '<div class="notice warn"><p>Aucune vente exploitable trouvée sur les cinq dernières années pour ce secteur.</p></div>');

    if (f.a || f.h) {
      h += carte('Prix de vente', `${segments('seg-type', [['Appartement', 'Appartements'], ['Maison', 'Maisons']], type)}
        ${stats ? `<div class="kpis">
          ${kpi('Prix médian', eurM2(stats.mediane), src === 'manuel' ? 'référence saisie par vous' : src === 'notaires' ? 'notaires, ventes 2024' : src === 'annonces' ? `${num(stats.n)} annonces (prix demandés)` : `${num(stats.n)} ventes · ${esc(stats.fenetre)}`)}
          ${kpi('Fourchette courante', `${num(stats.q[1])} – ${num(stats.q[3])}`, src === 'manuel' || src === 'notaires' ? '€/m², estimée à ± 15 %' : '€/m², la moitié des ventes')}
          ${bloc.s ? kpi(`${type === 'Maison' ? 'Maison' : 'Appartement'} type`, `${num(bloc.s)} m²`, `≈ ${eur(Math.round(bloc.s * stats.mediane))}`) : ''}
          ${t && t.an1 != null ? kpi('Évolution sur 1 an', signedPct(t.an1), t.an3 != null ? `${signedPct(t.an3)} sur 3 ans` : `médiane ${t.derniere}`) : ''}
        </div>
        ${src === 'dvf' && (stats.fiabilite === 'faible' || stats.fiabilite === 'moyenne') ? `<p class="note">Peu de ventes (${num(stats.n)}) : à prendre comme un ordre de grandeur.</p>` : ''}`
          : `<div class="notice"><p>Pas assez de ventes de ${type === 'Maison' ? 'maisons' : 'appartements'} pour calculer un prix fiable ici.</p></div>`}
        ${t ? `<h3 class="sec">Prix médian par année</h3>${courbes([{ nom: type === 'Maison' ? 'Maisons' : 'Appartements', classe: 'c1', points: t.serie.map((p) => ({ x: String(p.annee), y: p.mediane })) }])}` : ''}
        ${type === 'Appartement' && bloc && bloc.r ? `<h3 class="sec">Selon le nombre de pièces</h3><table class="tbl"><thead><tr><th>Pièces</th><th>Prix médian</th><th>Ventes</th></tr></thead><tbody>${Object.entries(bloc.r).map(([k, v]) => `<tr><td>${k === '5' ? '5 et plus' : k}</td><td>${eurM2(v[0])}</td><td>${num(v[1])}</td></tr>`).join('')}</tbody></table>` : ''}
        <p class="note">${src === 'manuel' ? 'Valeur de référence saisie par vous.' : src === 'notaires' ? 'Prix médian d\'actes de vente publié par les notaires (voir le détail ci-dessus).' : src === 'annonces' ? 'Prix demandés relevés dans les annonces que vous avez importées : en général supérieurs aux prix de vente.' : `Ventes réelles enregistrées (DVF) jusqu'au ${esc(frDate(m.meta.dvfRef))}. Logements vendus seuls, hors ventes atypiques.`}</p>`);
    }

    if (l && (l.a || l.h)) {
      h += carte('Loyers', `<div class="kpis">
        ${l.a ? kpi('Appartement', `${num(l.a[0], 1)} €/m²`, `par mois, ${num(l.a[1], 0)} à ${num(l.a[2], 0)}`) : ''}
        ${l.p ? kpi('1 à 2 pièces', `${num(l.p[0], 1)} €/m²`, 'par mois') : ''}
        ${l.g ? kpi('3 pièces et +', `${num(l.g[0], 1)} €/m²`, 'par mois') : ''}
        ${l.h ? kpi('Maison', `${num(l.h[0], 1)} €/m²`, 'par mois') : ''}
        ${rendement != null ? kpi('Rendement brut', pct(rendement), `${type === 'Maison' ? 'maison' : 'appartement'} acheté au prix médian`) : ''}
      </div><p class="note">Loyers d'annonce estimés, charges comprises (Carte des loyers ${esc(m.meta.loyersYear)}). ${l.t === 0 ? 'Estimation à partir de communes voisines : peu d\'annonces ici.' : `${num(l.n)} annonces observées.`}</p>`);
    }

    if (!m.sansDvf && (f.a || f.h)) {
      h += carte('Ventes récentes', `<div id="map" class="map" hidden></div><p class="note" id="legende" hidden><span class="dotl good"></span>sous la médiane <span class="dotl neutral"></span>proche <span class="dotl warn"></span>au-dessus <span class="dotl bad"></span>nettement au-dessus</p><div class="actions"><button class="btn" id="btn-map">${icon('map')}Voir sur la carte</button></div><div id="ventes"></div>`, { aide: '12 derniers mois' });
    }

    h += carte('Chercher des annonces', `${segments('seg-mode', [['achat', 'Acheter'], ['location', 'Louer']], modeLiens)}
      <ul class="links" id="liens"></ul>
      <p class="note">Ces liens ouvrent le site dans un nouvel onglet. Pour les sites marqués « accueil », recopiez les critères (bouton ci-dessous). Copiez ensuite l'annonce trouvée dans « Analyser ».</p>
      <div class="actions"><button class="btn ghost" id="btn-crit">${icon('copy')}Copier les critères</button><button class="btn ghost" id="btn-save">${icon('eye')}Suivre cette recherche</button><a class="btn" href="#analyser?insee=${esc(c.insee)}">${icon('scan')}Analyser une annonce ici</a></div>`);
    return h;
  }

  function refManuelle(m) {
    const ref = store.get('refs', {})[m.commune.insee] || {};
    const n = m.notaires;
    const c = n && n.commune;
    const obs = m.nbObservations || { a: 0, h: 0 };
    const eu = (v) => `${num(v)} €`;
    const evo = (v) => (v == null ? '' : ` (${v > 0 ? '+' : ''}${num(v, 1)} %)`);
    const lignes = [];
    if (c && c.a) lignes.push(`Appartements anciens : <b>${num(c.a)} €/m²</b>${evo(c.aEvo)}`);
    if (c && c.h) lignes.push(`Maisons anciennes : prix médian <b>${eu(c.h)}</b>${evo(c.hEvo)}`);
    return carte('Prix de vente', `
      <div class="notice"><p>Les ventes réelles ne sont pas publiées pour ce département (Alsace-Moselle et Mayotte ne figurent pas dans les données DVF : les actes sont au Livre foncier, non ouvert). L'application utilise à la place, dans cet ordre : votre prix de référence, les prix médians des notaires, puis les annonces que vous importez.</p></div>
      ${n ? `<h3 class="sec">Repères des notaires (ventes 2024)</h3>
        ${lignes.length ? `<p class="line" style="margin-top:0">${esc(m.commune.nom)} : ${lignes.join(' · ')}</p>` : `<p class="muted">${esc(m.commune.nom)} n'est pas détaillée dans cette publication.</p>`}
        ${n.dep ? `<p class="muted">Département : appartements ${num(n.dep.a)} €/m²${evo(n.dep.aEvo)}, maisons ${eu(n.dep.h)}${evo(n.dep.hEvo)}.</p>` : ''}
        ${c && c.quartiers ? `<details><summary>Appartements par quartier</summary><table class="tbl"><thead><tr><th>Quartier</th><th>Prix médian</th><th>1 an</th></tr></thead><tbody>${c.quartiers.map((q) => `<tr><td>${esc(q.nom)}</td><td>${eurM2(q.a)}</td><td>${signedPct(q.evo)}</td></tr>`).join('')}</tbody></table></details>` : ''}
        ${n.secteurs.length ? `<details><summary>Par secteur du département</summary><table class="tbl"><thead><tr><th>Secteur</th><th>Appart.</th><th>Maison</th></tr></thead><tbody>${n.secteurs.map((q) => `<tr><td>${esc(q.nom)}</td><td>${q.a ? eurM2(q.a) : '--'}</td><td>${q.h ? eu(q.h) : '--'}</td></tr>`).join('')}</tbody></table></details>` : ''}
        <p class="note">Source : <a href="${esc(n.url)}" target="_blank" rel="noopener noreferrer">${esc(n.source)}</a>, ${esc(n.periode)}. ${esc(n.note)}</p>` : ''}
      <h3 class="sec">Annonces observées</h3>
      <p class="muted" style="margin:0">${num(obs.a)} appartement(s) et ${num(obs.h)} maison(s) relevés dans vos imports pour cette commune. Dès 8 annonces d'un même type, l'application affiche leur médiane (prix demandés, pas des ventes).</p>
      <div class="actions"><a class="btn" href="#importer">${icon('scan')}Importer des annonces</a></div>
      <details><summary>Saisir mon propre prix de référence</summary>
        <div class="grid2">${champ({ id: 'ref-a', label: 'Appartement', type: 'number', valeur: ref.a || '', suffixe: '€/m²' })}${champ({ id: 'ref-h', label: 'Maison', type: 'number', valeur: ref.h || '', suffixe: '€/m²' })}</div>
        <p class="note">Il remplace les autres sources. Fourchette estimée à ± 15 %.</p>
        <div class="actions"><button class="btn" id="btn-ref">Enregistrer</button></div></details>`);
  }

  async function brancher(corps, m) {
    const c = m.commune;
    brancherSegments(corps, 'seg-type', (v) => { type = v; store.set('reg.typeMarche', v); dessiner(); });
    corps.querySelector('.scope')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-cp]');
      if (b) { cp = b.dataset.cp || null; dessiner(); }
    });
    corps.querySelector('#btn-comp')?.addEventListener('click', () => toast(comparateur.add(c) ? 'Ajouté au comparateur (onglet Plus)' : 'Déjà dans le comparateur, ou 4 villes atteintes'));
    corps.querySelector('#btn-ref')?.addEventListener('click', () => {
      setRef(c.insee, toNumber(corps.querySelector('#ref-a').value), toNumber(corps.querySelector('#ref-h').value));
      toast('Prix de référence enregistrés');
      dessiner();
    });
    const liens = () => {
      corps.querySelector('#liens').innerHTML = liensRecherche({ ...c, cps: cp ? [cp, ...c.cps.filter((x) => x !== cp)] : c.cps }, modeLiens)
        .map((p) => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.nom)}<small>${p.direct ? 'recherche directe' : 'accueil'}</small>${icon('external')}</a></li>`).join('');
    };
    liens();
    brancherSegments(corps, 'seg-mode', (v) => { modeLiens = v; store.set('reg.modeLiens', v); liens(); });
    corps.querySelector('#btn-crit')?.addEventListener('click', () => copier(criteres({ commune: c, mode: modeLiens, type: type === 'Maison' ? 'maison' : 'appartement' })));
    corps.querySelector('#btn-save')?.addEventListener('click', () => {
      recherches.add({ insee: c.insee, nom: c.nom, dep: c.dep, cps: c.cps, lat: c.lat, lon: c.lon, mode: modeLiens, type: type === 'Maison' ? 'Maison' : 'Appartement', budgetMax: null, surfaceMin: null });
      toast('Recherche ajoutée à Ma veille');
    });
    if (m.sansDvf) return;
    const v = (await ventes(c.dep))[c.insee] || [];
    const t = type === 'Maison' ? 1 : 0;
    const rows = v.filter((x) => x[4] === t && (!cp || x[8] === cp));
    const box = corps.querySelector('#ventes');
    if (box) {
      box.innerHTML = rows.length
        ? `<ul class="comps">${rows.slice(0, 8).map((x) => `<li><div><b>${eur(x[1])}</b> · ${num(x[2])} m²${x[3] ? ` · ${x[3]} p.` : ''}<small>${esc(x[7] || 'Adresse non précisée')} · ${esc(frDate(x[0]))}</small></div><b class="ppm">${eurM2(x[1] / x[2])}</b></li>`).join('')}</ul><p class="note">${rows.length > 8 ? `8 ventes affichées sur ${rows.length} conservées pour cette commune.` : ''} Les 40 ventes les plus récentes de la commune sont conservées.</p>`
        : '<p class="muted">Aucune vente récente enregistrée pour ce filtre.</p>';
    }
    corps.querySelector('#btn-map')?.addEventListener('click', async (e) => {
      const el = corps.querySelector('#map');
      el.hidden = false;
      corps.querySelector('#legende').hidden = false;
      e.currentTarget.disabled = true;
      try {
        const bloc = m.fiche && m.fiche[type === 'Maison' ? 'h' : 'a'];
        const st = choisirStats(bloc);
        const n = await afficherVentes(el, { centre: [c.lat, c.lon], ventes: cp ? v.filter((x) => x[8] === cp) : v, mediane: st && st.mediane, type });
        if (!n) toast('Aucune vente géolocalisée à afficher');
      } catch { toast('Carte indisponible hors connexion'); el.hidden = true; }
      e.currentTarget.disabled = false;
    });
  }

  demarrer();
}
