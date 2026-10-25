/* Ecran "Plusieurs annonces" : on colle une page de resultats (ou l'export du marque-page), l'application en tire les annonces,
   fusionne les doublons entre sites, les compare au marche et les classe. */

import { esc, eur, eurM2, num, store } from '../util.js';
import { carte, badge, segments, brancherSegments, selecteurHTML, brancherSelecteur, toast, basculeAnalyse } from '../ui.js';
import { chercher } from '../data.js';
import { getCommune, annonces } from '../state.js';
import { lireCollage, lireAnnonces, regrouper, memeBien } from '../multi.js';
import { marquePageHTML, brancherMarquePage } from './marquepage.js';
import { collerTexte, surRetour } from '../presse.js';
import { PREFIXE } from '../multi.js';
import { evaluer } from '../evaluer.js';
import { champsDe, resume } from '../caracteristiques.js';
import { icon } from '../icons.js';

export async function render(root) {
  let mode = store.get('reg.importMode', 'vente');
  let defaut = getCommune();
  let lot = [];
  let texte = '';

  function formulaire() {
    return carte('Importer plusieurs annonces', `
      <p class="lead">Rassemblez en une seule liste les annonces de tous les sites : l'application les lit, supprime les doublons entre sites, les compare aux prix réels et les classe des meilleures affaires aux plus chères.</p>
      ${segments('seg-imp', [['vente', 'Achat'], ['location', 'Location']], mode)}
      ${marquePageHTML()}
      <details><summary>Sans marque-page : copier-coller de la page</summary>
        <p class="muted" style="margin-top:8px">Sur la page de résultats, sélectionnez tout (Ctrl+A ou Cmd+A), copiez, puis collez ci-dessous. Le résultat est moins précis (les liens des annonces sont perdus), à vérifier dans la liste.</p>
      </details>
      <div class="field"><label for="colle-multi">Contenu copié</label><div class="inp"><textarea id="colle-multi" rows="5" placeholder="Collez ici le contenu copié depuis une page de résultats..."></textarea></div></div>
      ${selecteurHTML('pick-imp', defaut ? defaut.nom : '', 'Commune des annonces sans code postal')}
      <p class="note">Vous recevez des alertes e-mail des sites ? Collez aussi leur contenu ici, ou <a href="#alertes">automatisez-les</a>.</p>
      <div class="actions"><button class="btn" id="btn-coller">${icon('copy')}Coller</button><button class="btn primary" id="btn-lire-multi">${icon('scan')}Lire les annonces</button></div>`);
  }

  function dessiner() {
    root.innerHTML = basculeAnalyse('plusieurs') + formulaire() + '<div id="lot"></div>';
    const ta = root.querySelector('#colle-multi');
    ta.value = texte;
    ta.addEventListener('input', () => { texte = ta.value; });
    brancherSegments(root, 'seg-imp', (v) => { mode = v; store.set('reg.importMode', v); });
    brancherSelecteur(root, 'pick-imp', (c) => { defaut = c; });
    brancherMarquePage(root);
    root.querySelector('#btn-coller').addEventListener('click', async () => {
      const t = await collerTexte();
      if (t == null) { toast('Collez à la main dans la zone de texte'); return; }
      texte = t; ta.value = t;
      if (!t) toast('Le presse-papiers est vide'); else if (t.startsWith(PREFIXE)) lire();
    });
    root.querySelector('#btn-lire-multi').addEventListener('click', lire);
    if (lot.length) afficherLot();
  }

  async function lire() {
    const zone = root.querySelector('#lot');
    let r;
    try { r = lireCollage(texte, mode); } catch (e) { toast(e.message); return; }
    const brut = lireAnnonces(r.items, { mode, page: r.page });
    if (!brut.length) {
      lot = [];
      zone.innerHTML = carte('', '<div class="notice warn"><p>Aucune annonce reconnue. Vérifiez le choix Achat ou Location, puis que le contenu collé vient bien d\'une page de résultats (avec les prix et les surfaces affichés).</p></div>');
      return;
    }
    zone.innerHTML = '<div class="skeleton" aria-busy="true"><div></div><div></div><div></div></div>';
    // Commune de chaque annonce : code postal lu dans l'annonce, sinon commune par defaut.
    const cache = new Map();
    for (const a of brut) {
      let c = null;
      if (a.cp) {
        if (!cache.has(a.cp)) { try { cache.set(a.cp, (await chercher(a.cp, 1))[0] || null); } catch { cache.set(a.cp, null); } }
        c = cache.get(a.cp);
      }
      if (!c && defaut) c = defaut;
      if (c) { a.insee = c.insee; a.communeNom = c.nom; a.dep = c.dep; a.cp = a.cp || (c.cps && c.cps.length === 1 ? c.cps[0] : null); }
    }
    lot = regrouper(brut).map((g) => ({ ...g, choisi: false, eval: null, existe: annonces.list().find((x) => memeBien(x, g)) || null }));
    lot.forEach((g) => { g.choisi = !g.existe && g.complete && !!g.insee; });
    afficherLot();
    await evaluerLot();
    trier();
    afficherLot();
  }

  async function evaluerUne(g) {
    if (!g.insee || !g.complete) { g.eval = null; return; }
    try { g.eval = await evaluer(g); } catch { g.eval = { ok: false }; }
  }
  async function evaluerLot() { await Promise.all(lot.map(evaluerUne)); }
  function trier() {
    const cle = (g) => (g.eval && g.eval.ok ? (g.mode === 'location' ? -g.eval.ecart : g.eval.score) : -1000);
    lot.sort((a, b) => cle(b) - cle(a));
  }

  function ligne(g, i) {
    const e = g.eval;
    const v = e && e.ok ? badge(e.verdict.tone, e.verdict.label) : badge('info', g.complete ? (g.insee ? 'Non évalué' : 'Commune ?') : 'Incomplète');
    const detail = e && e.ok ? (g.mode === 'location' ? `${e.ecart > 0 ? '+' : ''}${num(e.ecart, 0)} % vs marché` : `score ${e.score} · ${e.ecart > 0 ? '+' : ''}${num(e.ecart, 0)} %`) : '';
    const sources = (g.sources || []).filter((s) => s.portail).map((s) => `<span class="tag">${esc(s.portail)}</span>`).join('');
    return `<label class="row" data-i="${i}"><input type="checkbox" data-act="choix"${g.choisi ? ' checked' : ''} aria-label="Retenir cette annonce">
      <div class="row-main"><b>${esc(g.titre || `${g.type} ${g.communeNom || ''}`)}</b>
        <small>${esc(g.communeNom || 'Commune à préciser')}${g.cp ? ' ' + esc(g.cp) : ''}</small>
        <div class="row-nums"><span><b>${eur(g.prix)}${g.mode === 'location' ? '/mois' : ''}</b></span><span>${g.surface ? num(g.surface) + ' m²' : 'surface ?'}</span>${g.pieces ? `<span>${g.pieces} p.</span>` : ''}${g.surface ? `<span>${g.mode === 'location' ? num(g.prix / g.surface, 1) + ' €/m²' : eurM2(g.prix / g.surface)}</span>` : ''}${g.dpe ? `<span>DPE ${esc(g.dpe)}</span>` : ''}</div>
        ${resume(g).length ? `<div>${resume(g).map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>` : ''}
        <div>${sources}${(g.sources || []).length > 1 ? '<span class="tag">doublon fusionné</span>' : ''}${g.existe ? '<span class="tag">déjà dans Ma veille</span>' : ''}</div>
        ${!g.complete ? `<div class="inp mini"><input type="text" inputmode="decimal" data-act="surf" placeholder="Surface m²" aria-label="Surface en m²"></div>` : ''}
        ${g.typeIncertain ? `<div class="inp mini"><select data-act="type" aria-label="Type de bien"><option value="Appartement">Appartement</option><option value="Maison"${g.type === 'Maison' ? ' selected' : ''}>Maison</option></select></div>` : ''}
      </div><div class="row-v">${v}<small>${esc(detail)}</small></div></label>`;
  }

  function afficherLot() {
    const zone = root.querySelector('#lot');
    const n = lot.filter((g) => g.choisi).length;
    const fusions = lot.reduce((s, g) => s + ((g.sources || []).length - 1), 0);
    zone.innerHTML = carte(`${lot.length} annonce${lot.length > 1 ? 's' : ''}`, `
      <p class="muted">${fusions > 0 ? `${fusions} doublon${fusions > 1 ? 's' : ''} entre sites fusionné${fusions > 1 ? 's' : ''}. ` : ''}Classées de la meilleure affaire à la plus chère. Décochez celles qui ne vous intéressent pas.</p>
      <div class="actions"><button class="btn ghost" id="tout">Tout cocher</button><button class="btn ghost" id="rien">Tout décocher</button></div>
      <div id="rows">${lot.map(ligne).join('')}</div>
      <div class="actions"><button class="btn primary" id="ajouter"${n ? '' : ' disabled'}>${icon('eye')}Ajouter ${n} annonce${n > 1 ? 's' : ''} à Ma veille</button></div>
      <p class="note">Vérifiez les chiffres avant de décider : la lecture d'une page copiée peut se tromper (surface, type de bien). Le verdict compare au prix médian des ventes passées du secteur.</p>`);
    zone.querySelector('#tout').addEventListener('click', () => { lot.forEach((g) => { if (g.complete && g.insee) g.choisi = true; }); afficherLot(); });
    zone.querySelector('#rien').addEventListener('click', () => { lot.forEach((g) => { g.choisi = false; }); afficherLot(); });
    zone.querySelector('#rows').addEventListener('change', async (e) => {
      const row = e.target.closest('.row');
      if (!row) return;
      const g = lot[Number(row.dataset.i)];
      if (e.target.dataset.act === 'choix') { g.choisi = e.target.checked; afficherBouton(); return; }
      if (e.target.dataset.act === 'surf') {
        const s = Number(String(e.target.value).replace(',', '.'));
        if (s >= 8 && s <= 600) { g.surface = s; g.complete = true; await evaluerUne(g); afficherLot(); }
      }
      if (e.target.dataset.act === 'type') { g.type = e.target.value; g.typeIncertain = false; await evaluerUne(g); afficherLot(); }
    });
    zone.querySelector('#ajouter').addEventListener('click', ajouter);
  }
  function afficherBouton() {
    const n = lot.filter((g) => g.choisi).length;
    const b = root.querySelector('#ajouter');
    if (b) { b.disabled = !n; b.lastChild.textContent = `Ajouter ${n} annonce${n > 1 ? 's' : ''} à Ma veille`; }
  }

  function ajouter() {
    let neuves = 0, fusionnees = 0;
    for (const g of lot.filter((x) => x.choisi)) {
      if (g.existe) { if (annonces.ajouterSources(g.existe.id, g.sources)) fusionnees++; continue; }
      const { mode: md, type, prix, surface, pieces, dpe, terrain, url, titre, portail, communeNom, dep, cp, insee, sources } = g;
      annonces.add({ ...champsDe(g), insee, mode: md, type, prix, surface, pieces, dpe, terrain, url: url || (sources[0] && sources[0].url) || '', titre: titre || `${type} ${communeNom}`, portail: portail || (sources[0] && sources[0].portail) || '', communeNom, dep, cp, sources });
      neuves++;
    }
    toast(`${neuves} ajoutée${neuves > 1 ? 's' : ''}${fusionnees ? `, ${fusionnees} déjà suivie${fusionnees > 1 ? 's' : ''} enrichie${fusionnees > 1 ? 's' : ''}` : ''}`);
    location.hash = '#veille';
  }

  dessiner();
  const enAttente = sessionStorage.getItem('immo-import');
  if (enAttente) {
    sessionStorage.removeItem('immo-import');
    texte = enAttente;
    root.querySelector('#colle-multi').value = texte;
    lire();
  }
  surRetour(root, (t) => {
    texte = t;
    const ta = root.querySelector('#colle-multi');
    if (ta) ta.value = t;
    toast('Annonces lues dans le presse-papiers');
    lire();
  });
}
