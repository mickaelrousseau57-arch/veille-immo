/* Ecran "Ma veille" : annonces suivies (verdict recalcule avec les donnees du jour), baisses de prix, recherches enregistrees. */

import { esc, eur, eurM2, num, signedPct, frDate, todayISO, toNumber, store } from '../util.js';
import { carte, badge, toast, telecharger, segments, brancherSegments, champ } from '../ui.js';
import { annonces, recherches, STATUTS, variationPrix, exporter, importer, versCSV } from '../state.js';
import { evaluer } from '../evaluer.js';
import { liensRecherche } from '../portals.js';
import { badgeVerdict } from './resultat.js';
import { icon } from '../icons.js';

const JOURS_RAPPEL = 7;
const joursDepuis = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

export async function render(root) {
  let tri = store.get('reg.triVeille', 'score');
  let filtre = store.get('reg.filtreVeille', 'actives');
  let evals = new Map();

  function tete() {
    const l = annonces.list();
    return carte('Ma veille', `<p class="lead">Les annonces que vous suivez, comparées au marché avec les données du jour. Le prix se met à jour à la main : notez chaque changement pour repérer les baisses.</p>
      <div class="toolbar">${segments('seg-filtre', [['actives', 'En cours'], ['ecarte', 'Écartées'], ['tout', 'Toutes']], filtre)}
      <select id="tri" aria-label="Trier par"><option value="score"${tri === 'score' ? ' selected' : ''}>Meilleures affaires</option><option value="recent"${tri === 'recent' ? ' selected' : ''}>Plus récentes</option><option value="prix"${tri === 'prix' ? ' selected' : ''}>Prix croissant</option><option value="baisse"${tri === 'baisse' ? ' selected' : ''}>Plus fortes baisses</option></select></div>
      ${l.length ? '' : `<div class="empty"><p>Aucune annonce suivie pour l'instant.</p><p class="muted">Analysez une annonce puis touchez « Suivre cette annonce ».</p><div class="actions"><a class="btn primary" href="#importer">${icon('scan')}Importer plusieurs annonces</a><a class="btn" href="#analyser">Analyser une annonce</a></div></div>`}
      <div class="actions"><a class="btn ghost" href="#importer">${icon('scan')}Importer plusieurs annonces</a><a class="btn ghost" href="#alertes">${icon('eye')}Alertes e-mail</a></div>`);
  }

  function visibles() {
    let l = annonces.list();
    if (filtre === 'actives') l = l.filter((a) => a.statut !== 'ecarte');
    else if (filtre === 'ecarte') l = l.filter((a) => a.statut === 'ecarte');
    const sc = (a) => { const r = evals.get(a.id); return r && r.ok && a.mode === 'vente' ? r.score : -1; };
    if (tri === 'score') l.sort((a, b) => sc(b) - sc(a));
    else if (tri === 'prix') l.sort((a, b) => a.prix - b.prix);
    else if (tri === 'baisse') l.sort((a, b) => (variationPrix(a) ?? 0) - (variationPrix(b) ?? 0));
    return l;
  }

  function ligne(a) {
    const r = evals.get(a.id);
    const v = variationPrix(a);
    const retard = joursDepuis(a.verifieLe || a.creeLe) >= JOURS_RAPPEL && a.statut !== 'ecarte';
    const st = STATUTS.find((s) => s.id === a.statut) || STATUTS[0];
    return `<article class="ann${a.statut === 'ecarte' ? ' off' : ''}" data-id="${esc(a.id)}">
      <div class="ann-top"><div><h3>${esc(a.titre || a.type)}</h3><p class="muted">${esc(a.communeNom || '')}${a.cp ? ' ' + esc(a.cp) : ''} · ${a.mode === 'location' ? 'Location' : 'Vente'}${(a.sources || []).length > 1 ? ' · ' + a.sources.length + ' sites' : a.portail ? ' · ' + esc(a.portail) : ''}</p></div>
        <div class="ann-badges">${r ? badgeVerdict(r) : badge('info', '…')}${v != null && v !== 0 ? badge(v < 0 ? 'good' : 'warn', `${signedPct(v)} depuis la saisie`) : ''}</div></div>
      <div class="ann-nums"><b>${eur(a.prix)}${a.mode === 'location' ? '/mois' : ''}</b><span>${num(a.surface)} m²${a.pieces ? ' · ' + a.pieces + ' p.' : ''}</span><span>${a.mode === 'location' ? `${num(a.prix / a.surface, 1)} €/m²` : eurM2(a.prix / a.surface)}</span>${r && r.ok && a.mode === 'vente' ? `<span>${r.ecart > 0 ? '+' : ''}${num(r.ecart, 0)} % vs marché</span><span>score ${r.score}</span>` : ''}${a.dpe ? `<span>DPE ${esc(a.dpe)}</span>` : ''}</div>
      ${retard ? `<p class="remind">${icon('eye')}Vérifié il y a ${joursDepuis(a.verifieLe || a.creeLe)} jours : l'annonce est-elle toujours en ligne, le prix a-t-il changé ?</p>` : ''}
      <details><summary>Détails, statut et notes</summary>
        <div class="grid2"><div class="field"><label for="st-${esc(a.id)}">Statut</label><div class="inp"><select id="st-${esc(a.id)}" data-act="statut">${STATUTS.map((s) => `<option value="${s.id}"${s.id === a.statut ? ' selected' : ''}>${esc(s.nom)}</option>`).join('')}</select></div></div>
        ${champ({ id: 'np-' + a.id, label: 'Nouveau prix constaté', type: 'number', suffixe: a.mode === 'location' ? '€/mois' : '€', attrs: `placeholder="${num(a.prix)}"` })}</div>
        <div class="actions"><button class="btn" data-act="prix">Enregistrer le nouveau prix</button><button class="btn ghost" data-act="verifie">${icon('check')}Vérifiée aujourd'hui</button></div>
        <div class="field"><label for="no-${esc(a.id)}">Notes</label><div class="inp"><textarea id="no-${esc(a.id)}" rows="3" data-act="note" placeholder="Visite, questions, charges, travaux...">${esc(a.note || '')}</textarea></div></div>
        ${(a.historique || []).length > 1 ? `<p class="muted">Historique : ${(a.historique || []).map((h) => `${esc(frDate(h.date))} ${eur(h.prix)}`).join(' → ')}</p>` : ''}
        ${(a.sources || []).length > 1 ? `<p class="muted">Cette annonce est publiée sur ${(a.sources).length} sites :</p><div class="chips">${a.sources.map((x) => (x.url ? `<a class="chip" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.portail || 'Lien')}</a>` : `<span class="chip">${esc(x.portail)}</span>`)).join('')}</div>` : ''}
        <p class="muted">Ajoutée le ${esc(frDate(a.creeLe))}</p>
        <div class="actions">${a.url ? `<a class="btn ghost" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${icon('external')}Ouvrir l'annonce</a>` : ''}${a.mode === 'vente' ? `<a class="btn ghost" href="#credit?prix=${a.prix}&insee=${esc(a.insee || '')}">${icon('calc')}Crédit</a>` : ''}<button class="btn danger" data-act="suppr">${icon('trash')}Supprimer</button></div>
      </details></article>`;
  }

  function listeRecherches() {
    const l = recherches.list();
    if (!l.length) return carte('Mes recherches', '<p class="muted">Aucune recherche enregistrée. Dans « Marché », choisissez une ville puis « Suivre cette recherche » : vous retrouverez ici les liens vers tous les sites.</p>');
    return carte('Mes recherches', `<ul class="searches">${l.map((r) => `<li data-r="${esc(r.id)}"><details><summary><b>${esc(r.nom)}</b> · ${r.mode === 'location' ? 'location' : 'achat'}${r.type ? ' · ' + esc(r.type.toLowerCase()) : ''}</summary>
      <ul class="links">${liensRecherche(r, r.mode).map((p) => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.nom)}<small>${p.direct ? 'recherche directe' : 'accueil'}</small>${icon('external')}</a></li>`).join('')}</ul>
      <div class="actions"><a class="btn ghost" href="#marche?insee=${esc(r.insee)}">${icon('chart')}Voir le marché</a><button class="btn danger" data-act="suppr-r">${icon('trash')}Retirer</button></div></details></li>`).join('')}</ul>`);
  }

  function sauvegarde() {
    return carte('Sauvegarde', `<p class="muted">Vos annonces restent sur cet appareil. Exportez-les pour les retrouver sur un autre appareil ou les ouvrir dans un tableur.</p>
      <div class="actions"><button class="btn ghost" id="exp-json">${icon('download')}Sauvegarde (.json)</button><button class="btn ghost" id="exp-csv">${icon('download')}Tableur (.csv)</button><label class="btn ghost file">${icon('upload')}Restaurer<input type="file" id="imp" accept="application/json,.json" hidden></label></div>`);
  }

  async function dessiner() {
    const l = visibles();
    root.innerHTML = tete() + `<div id="liste">${l.map(ligne).join('')}</div>` + listeRecherches() + sauvegarde();
    brancher();
  }

  async function evaluerTout() {
    const l = annonces.list();
    await Promise.all(l.map(async (a) => {
      try { evals.set(a.id, await evaluer(a)); } catch { evals.set(a.id, { ok: false }); }
    }));
  }

  function brancher() {
    brancherSegments(root, 'seg-filtre', (v) => { filtre = v; store.set('reg.filtreVeille', v); dessiner(); });
    root.querySelector('#tri')?.addEventListener('change', (e) => { tri = e.target.value; store.set('reg.triVeille', tri); dessiner(); });
    root.querySelector('#liste').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      const art = e.target.closest('.ann');
      if (!b || !art) return;
      const id = art.dataset.id;
      if (b.dataset.act === 'suppr') { if (confirm('Supprimer cette annonce de Ma veille ?')) { annonces.remove(id); dessiner(); } }
      if (b.dataset.act === 'verifie') { annonces.update(id, { verifieLe: todayISO() }); toast('Marquée comme vérifiée'); dessiner(); }
      if (b.dataset.act === 'prix') {
        const n = toNumber(art.querySelector('[id^="np-"]').value);
        if (!(n > 0)) { toast('Saisissez le nouveau prix'); return; }
        annonces.changerPrix(id, n);
        reevaluer(id).then(dessiner);
      }
    });
    root.querySelector('#liste').addEventListener('change', (e) => {
      const art = e.target.closest('.ann');
      if (!art) return;
      if (e.target.dataset.act === 'statut') { annonces.update(art.dataset.id, { statut: e.target.value }); if (filtre !== 'tout') dessiner(); }
      if (e.target.dataset.act === 'note') annonces.update(art.dataset.id, { note: e.target.value.slice(0, 2000) });
    });
    root.querySelector('.searches')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="suppr-r"]');
      if (b) { recherches.remove(b.closest('li[data-r]').dataset.r); dessiner(); }
    });
    root.querySelector('#exp-json')?.addEventListener('click', () => telecharger(`veille-immo-${todayISO()}.json`, exporter()));
    root.querySelector('#exp-csv')?.addEventListener('click', () => {
      const lignes = annonces.list().map((a) => {
        const r = evals.get(a.id);
        const v = variationPrix(a);
        return [a.titre, a.communeNom, a.cp, a.type, a.prix, a.surface, a.pieces, a.surface ? Math.round(a.prix / a.surface) : '', r && r.ok && a.mode === 'vente' ? Math.round(r.ecart * 10) / 10 : '', r && r.ok && a.mode === 'vente' ? r.score : '', a.dpe, (STATUTS.find((s) => s.id === a.statut) || {}).nom, v != null ? Math.round(v * 10) / 10 : '', a.url, a.note];
      });
      telecharger(`veille-immo-${todayISO()}.csv`, versCSV(lignes), 'text/csv;charset=utf-8');
    });
    root.querySelector('#imp')?.addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const n = importer(await f.text());
        toast(`${n} annonce(s) restaurée(s)`);
        await evaluerTout();
        dessiner();
      } catch (err) { toast(err.message); }
    });
  }

  async function reevaluer(id) {
    const a = annonces.list().find((x) => x.id === id);
    if (a) { try { evals.set(id, await evaluer(a)); } catch { evals.set(id, { ok: false }); } }
  }

  dessiner();
  if (annonces.list().length) { await evaluerTout(); dessiner(); }
}
