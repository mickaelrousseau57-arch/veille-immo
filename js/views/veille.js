/* Ecran "Ma veille" : annonces suivies (verdict recalcule avec les donnees du jour), tri, filtres, vue tableau,
   selection et suppression en masse, baisses de prix, recherches enregistrees. */

import { esc, eur, eurM2, num, signedPct, frDate, todayISO, toNumber, store } from '../util.js';
import { carte, badge, meta, toast, toastAction, telecharger, segments, brancherSegments, champ, veilleSelectHTML, optionsVeilles, brancherVeilleSelect, creerVeille } from '../ui.js';
import { annonces, recherches, veilles, STATUTS, variationPrix, exporter, importer, versCSV } from '../state.js';
import { evaluer } from '../evaluer.js';
import { liensRecherche } from '../portals.js';
import { badgeVerdict } from './resultat.js';
import { EQUIPEMENTS, ETATS, CHAUFFAGES, resume } from '../caracteristiques.js';
import { titreAuto, titreSuspect } from '../multi.js';
import { TRIS, FILTRES_VIDES, filtrer, trier, communesDe, nombreFiltres, categorie } from '../filtres.js';
import { icon } from '../icons.js';
import { baroMini } from '../charts.js';

const JOURS_RAPPEL = 7;
const joursDepuis = (iso) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
const ANCIENS_TRIS = { score: 'ecart', prix: 'prixAsc' };
const NOMS_EQUIP = Object.fromEntries(EQUIPEMENTS);
const options = (liste, valeur, vide) => `${vide ? `<option value="">${esc(vide)}</option>` : ''}${liste.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(valeur ?? '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}`;

export async function render(root, params = {}) {
  if (params.v) veilles.ouvrir(params.v);
  let scope = veilles.courante();
  const dansScope = (x) => scope === 'toutes' || veilles.idDe(x) === scope;
  // Anciens imports : un titre qui est en fait un lien d'interface ("Simuler mon credit") est remplace par un titre construit.
  const aCorriger = annonces.list().some((a) => titreSuspect(a.titre));
  if (aCorriger) annonces.save(annonces.list().map((a) => (titreSuspect(a.titre) ? { ...a, titre: titreAuto(a) } : a)));
  let statut = store.get('reg.filtreVeille', 'actives');
  let tri = store.get('reg.triVeille', 'ecart');
  tri = ANCIENS_TRIS[tri] || tri;
  if (!TRIS.some(([k]) => k === tri)) tri = 'ecart';
  let vue = store.get('reg.vueVeille', 'cartes');
  let filtres = { ...FILTRES_VIDES, ...store.get('reg.filtresVeille', {}) };
  filtres.communes = Array.isArray(filtres.communes) ? filtres.communes : [];
  filtres.equip = Array.isArray(filtres.equip) ? filtres.equip : [];
  let selection = false;
  const choisies = new Set();
  const ouverts = new Set();
  const evals = new Map();
  let panneauOuvert = false;

  const parStatut = () => annonces.list().filter(dansScope).filter((a) => (statut === 'actives' ? a.statut !== 'ecarte' : statut === 'ecarte' ? a.statut === 'ecarte' : true));
  const visibles = () => trier(filtrer(parStatut(), filtres, evals), tri, evals);

  /* ---------- Haut de page : filtres et commandes ---------- */
  function panneauFiltres() {
    const base = parStatut();
    const coms = communesDe(base);
    return `<details class="filtres" id="filtres"${panneauOuvert || nombreFiltres(filtres) ? ' open' : ''}><summary>Filtres<span id="nb-filtres">${nombreFiltres(filtres) ? ` (${nombreFiltres(filtres)})` : ''}</span></summary>
      <div class="grid2">
        <div class="field"><label for="f-mode">Achat ou location</label><div class="inp"><select id="f-mode" data-f="mode">${options([['vente', 'Achat'], ['location', 'Location']], filtres.mode, 'Tous')}</select></div></div>
        <div class="field"><label for="f-type">Type de bien</label><div class="inp"><select id="f-type" data-f="type">${options([['Appartement', 'Appartement'], ['Maison', 'Maison']], filtres.type, 'Tous')}</select></div></div>
        <div class="field"><label for="f-verdict">Prix par rapport au marché</label><div class="inp"><select id="f-verdict" data-f="verdict">${options([['bonne', 'Bonnes affaires'], ['marche', 'Prix du marché'], ['chere', 'Chères'], ['inconnue', 'Non évaluées']], filtres.verdict, 'Tous')}</select></div></div>
        <div class="field"><label for="f-dpe">DPE minimum</label><div class="inp"><select id="f-dpe" data-f="dpeMax">${options('ABCDEFG'.split('').map((x) => [x, `${x} ou mieux`]), filtres.dpeMax, 'Peu importe')}</select></div></div>
        ${champ({ id: 'f-prix', label: 'Prix maximum', type: 'number', valeur: filtres.prixMax, suffixe: '€', attrs: 'data-f="prixMax"' })}
        ${champ({ id: 'f-smin', label: 'Surface minimum', type: 'number', valeur: filtres.surfaceMin, suffixe: 'm²', attrs: 'data-f="surfaceMin"' })}
        ${champ({ id: 'f-smax', label: 'Surface maximum', type: 'number', valeur: filtres.surfaceMax, suffixe: 'm²', attrs: 'data-f="surfaceMax"' })}
        ${champ({ id: 'f-pieces', label: 'Pièces minimum', type: 'number', valeur: filtres.piecesMin, attrs: 'data-f="piecesMin"' })}
        ${champ({ id: 'f-ch', label: 'Chambres minimum', type: 'number', valeur: filtres.chambresMin, attrs: 'data-f="chambresMin"' })}
        ${champ({ id: 'f-annee', label: 'Construit après', type: 'number', valeur: filtres.anneeMin, attrs: 'data-f="anneeMin" placeholder="1990"' })}
      </div>
      ${coms.length ? `<p class="hint" style="margin-top:12px">Communes</p><div class="chips" id="f-communes">${coms.map((c) => `<button type="button" class="chip${filtres.communes.includes(c.nom) ? ' on' : ''}" data-v="${esc(c.nom)}" aria-pressed="${filtres.communes.includes(c.nom)}">${esc(c.nom)} (${c.n})</button>`).join('')}</div>` : ''}
      <p class="hint" style="margin-top:12px">Équipements (tous ceux choisis sont exigés)</p>
      <div class="chips" id="f-equip">${EQUIPEMENTS.map(([k, n]) => `<button type="button" class="chip${filtres.equip.includes(k) ? ' on' : ''}" data-v="${k}" aria-pressed="${filtres.equip.includes(k)}">${esc(n)}</button>`).join('')}</div>
      ${champ({ id: 'f-texte', label: 'Recherche dans les titres, communes et notes', valeur: filtres.texte, attrs: 'data-f="texte"' })}
      <p class="note">Un critère chiffré écarte les annonces dont la valeur n'est pas renseignée : complétez-la dans la fiche de l'annonce.</p>
      <div class="actions"><button type="button" class="btn ghost" id="f-reset">Réinitialiser les filtres</button></div>
    </details>`;
  }

  function tete() {
    const nomVeille = scope === 'toutes' ? 'Toutes les annonces' : (veilles.get(scope) || {}).nom;
    return carte(esc(nomVeille), `<div class="veille-barre">${veilleSelectHTML('sel-veille', scope, { label: 'Veille ouverte', toutes: true })}<a class="btn ghost" href="#veilles">Gérer mes veilles</a></div>
      <p class="lead">Les annonces de cette veille, comparées au marché avec les données du jour. Le prix se met à jour à la main : notez chaque changement pour repérer les baisses.</p>
      ${segments('seg-statut', [['actives', 'En cours'], ['ecarte', 'Écartées'], ['tout', 'Toutes']], statut)}
      <div class="toolbar">
        <div class="field" style="margin:0"><label for="tri">Trier par</label><div class="inp"><select id="tri">${options(TRIS, tri)}</select></div></div>
        ${segments('seg-vue', [['cartes', 'Cartes'], ['tableau', 'Tableau']], vue)}
      </div>
      <div class="barre-info"><span id="compteur"></span><button type="button" class="btn ghost" id="btn-sel">${icon('check')}<span id="btn-sel-txt">Sélectionner</span></button></div>`);
  }

  /* ---------- Liste : cartes ou tableau ---------- */
  function caracteristiquesHTML(a) {
    return `<h3 class="sec">Caractéristiques (modifiables)</h3>
      <div class="grid2">
        <div class="field"><label for="c-type-${esc(a.id)}">Type</label><div class="inp"><select id="c-type-${esc(a.id)}" data-f="type">${options([['Appartement', 'Appartement'], ['Maison', 'Maison']], a.type)}</select></div></div>
        ${champ({ id: `c-surface-${a.id}`, label: 'Surface', type: 'number', valeur: a.surface ?? '', suffixe: 'm²', attrs: 'data-f="surface"' })}
        ${champ({ id: `c-pieces-${a.id}`, label: 'Pièces', type: 'number', valeur: a.pieces ?? '', attrs: 'data-f="pieces"' })}
        ${champ({ id: `c-chambres-${a.id}`, label: 'Chambres', type: 'number', valeur: a.chambres ?? '', attrs: 'data-f="chambres"' })}
        ${champ({ id: `c-sdb-${a.id}`, label: 'Salles de bain', type: 'number', valeur: a.sdb ?? '', attrs: 'data-f="sdb"' })}
        ${champ({ id: `c-annee-${a.id}`, label: 'Année de construction', type: 'number', valeur: a.annee ?? '', attrs: 'data-f="annee"' })}
        ${champ({ id: `c-etage-${a.id}`, label: 'Étage', type: 'number', valeur: a.etage ?? '', attrs: 'data-f="etage"' })}
        ${champ({ id: `c-terrain-${a.id}`, label: 'Terrain', type: 'number', valeur: a.terrain ?? '', suffixe: 'm²', attrs: 'data-f="terrain"' })}
        <div class="field"><label for="c-dpe-${esc(a.id)}">DPE</label><div class="inp"><select id="c-dpe-${esc(a.id)}" data-f="dpe">${options('ABCDEFG'.split('').map((x) => [x, x]), a.dpe, 'Inconnu')}</select></div></div>
        <div class="field"><label for="c-etat-${esc(a.id)}">État</label><div class="inp"><select id="c-etat-${esc(a.id)}" data-f="etat">${options(ETATS, a.etat, 'Inconnu')}</select></div></div>
        <div class="field"><label for="c-chauf-${esc(a.id)}">Chauffage</label><div class="inp"><select id="c-chauf-${esc(a.id)}" data-f="chauffage">${options(CHAUFFAGES, a.chauffage, 'Inconnu')}</select></div></div>
        ${a.mode !== 'location' ? champ({ id: `c-charges-${a.id}`, label: 'Charges de copropriété', type: 'number', valeur: a.chargesAn ?? '', suffixe: '€/an', attrs: 'data-f="chargesAn"' }) : ''}
      </div>
      ${veilleSelectHTML('c-veille-' + a.id, veilles.idDe(a), { label: 'Rangée dans la veille' })}
      <div class="chips" data-equip>${EQUIPEMENTS.map(([k, n]) => `<button type="button" class="chip${(a.extras || []).includes(k) ? ' on' : ''}" data-v="${k}" aria-pressed="${(a.extras || []).includes(k)}">${esc(n)}</button>`).join('')}</div>`;
  }

  function carteAnnonce(a) {
    const r = evals.get(a.id);
    const v = variationPrix(a);
    const retard = joursDepuis(a.verifieLe || a.creeLe) >= JOURS_RAPPEL && a.statut !== 'ecarte';
    const carac = resume(a);
    const sel = selection ? `<label class="ann-sel"><input type="checkbox" data-act="sel"${choisies.has(a.id) ? ' checked' : ''} aria-label="Sélectionner cette annonce"></label>` : '';
    const sites = (a.sources || []).length > 1 ? `${a.sources.length} sites` : a.portail ? esc(a.portail) : '';
    const verdict = r && r.ok
      ? `${baroMini(r.ecart)}<span class="ann-v">${badgeVerdict(r)}<span class="muted">${r.ecart > 0 ? '+' : r.ecart < 0 ? '−' : ''}${num(Math.abs(r.ecart), 0)} % par rapport au marché</span></span>`
      : `<span class="ann-v">${r ? badge('info', 'Non évalué') : '<span class="muted">Évaluation en cours</span>'}</span>`;
    return `<article class="ann${a.statut === 'ecarte' ? ' off' : ''}${choisies.has(a.id) ? ' choisie' : ''}" data-id="${esc(a.id)}">
      <div class="ann-row">${sel}
        <div class="ann-titre"><h3>${esc(a.titre || a.type)}</h3>${meta(`${esc(a.communeNom || '')}${a.cp ? ' ' + esc(a.cp) : ''}`, a.mode === 'location' ? 'Location' : 'Vente', sites, `${num(a.surface)} m²`, a.pieces ? `${a.pieces} pièces` : '', a.dpe ? `DPE ${esc(a.dpe)}` : '')}</div>
        <div class="ann-prix"><b>${eur(a.prix)}${a.mode === 'location' ? ' par mois' : ''}</b><span>${a.mode === 'location' ? `${num(a.prix / a.surface, 1)} €/m²` : eurM2(a.prix / a.surface)}</span>${v != null && v !== 0 ? `<span class="${v < 0 ? 'pos' : 'neg'}">${signedPct(v)} depuis la saisie</span>` : ''}</div>
        <div class="ann-verdict">${verdict}</div>
      </div>
      ${carac.length ? meta(...carac.map(esc)) : ''}
      ${retard ? `<p class="remind">${icon('eye')}Vérifié il y a ${joursDepuis(a.verifieLe || a.creeLe)} jours : l'annonce est-elle toujours en ligne, le prix a-t-il changé ?</p>` : ''}
      <details${ouverts.has(a.id) ? ' open' : ''} data-d="${esc(a.id)}"><summary>Détails, statut et notes</summary>
        <div class="grid2"><div class="field"><label for="st-${esc(a.id)}">Statut</label><div class="inp"><select id="st-${esc(a.id)}" data-act="statut">${STATUTS.map((s) => `<option value="${s.id}"${s.id === a.statut ? ' selected' : ''}>${esc(s.nom)}</option>`).join('')}</select></div></div>
        ${champ({ id: 'np-' + a.id, label: 'Nouveau prix constaté', type: 'number', suffixe: a.mode === 'location' ? '€/mois' : '€', attrs: `placeholder="${num(a.prix)}"` })}</div>
        <div class="actions"><button class="btn" data-act="prix">Enregistrer le nouveau prix</button><button class="btn ghost" data-act="verifie">${icon('check')}Vérifiée aujourd'hui</button></div>
        ${caracteristiquesHTML(a)}
        <div class="field"><label for="no-${esc(a.id)}">Notes</label><div class="inp"><textarea id="no-${esc(a.id)}" rows="3" data-act="note" placeholder="Visite, questions, charges, travaux...">${esc(a.note || '')}</textarea></div></div>
        ${(a.historique || []).length > 1 ? `<p class="muted">Historique : ${(a.historique || []).map((h) => `${esc(frDate(h.date))} ${eur(h.prix)}`).join(' → ')}</p>` : ''}
        ${(a.sources || []).length > 1 ? `<p class="muted">Cette annonce est publiée sur ${a.sources.length} sites :</p><div class="chips">${a.sources.map((x) => (x.url ? `<a class="chip" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.portail || 'Lien')}</a>` : `<span class="chip">${esc(x.portail)}</span>`)).join('')}</div>` : ''}
        <p class="muted">Ajoutée le ${esc(frDate(a.creeLe))}</p>
        <div class="actions">${a.url ? `<a class="btn ghost" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${icon('external')}Ouvrir l'annonce</a>` : ''}${a.mode === 'vente' ? `<a class="btn ghost" href="#credit?prix=${a.prix}&insee=${esc(a.insee || '')}">${icon('calc')}Crédit</a><a class="btn ghost" href="#estimer?annonce=${esc(a.id)}">Estimer finement</a>` : ''}<button class="btn danger" data-act="suppr">${icon('trash')}Supprimer</button></div>
      </details></article>`;
  }

  const TRI_COLONNES = { commune: ['commune', 'commune'], prix: ['prixAsc', 'prixDesc'], ppm2: ['ppm2Asc', 'ppm2Desc'], surface: ['surfaceDesc', 'surfaceDesc'], annee: ['anneeDesc', 'anneeDesc'], ecart: ['ecart', 'ecartDesc'] };
  const entete = (cle, texte) => {
    const [asc, desc] = TRI_COLONNES[cle];
    const actif = tri === asc || tri === desc;
    return `<th scope="col"><button type="button" class="th-tri${actif ? ' actif' : ''}" data-tri="${cle}">${texte}${actif ? (tri === desc && asc !== desc ? ' ▼' : ' ▲') : ''}</button></th>`;
  };

  function tableau(l) {
    const lignes = l.map((a) => {
      const r = evals.get(a.id);
      return `<tr data-id="${esc(a.id)}"${choisies.has(a.id) ? ' class="choisie"' : ''}>
        ${selection ? `<td><input type="checkbox" data-act="sel"${choisies.has(a.id) ? ' checked' : ''} aria-label="Sélectionner"></td>` : ''}
        <th scope="row" class="col-titre">${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${esc(a.titre || a.type)}</a>` : esc(a.titre || a.type)}<small>${esc(a.communeNom || '')}${a.cp ? ' ' + esc(a.cp) : ''}, ${a.mode === 'location' ? 'location' : esc(a.type.toLowerCase())}</small></th>
        <td>${eur(a.prix)}</td><td>${num(a.surface)}</td><td>${a.mode === 'location' ? num(a.prix / a.surface, 1) : num(a.prix / a.surface)}</td><td>${a.pieces ?? '--'}</td><td>${a.chambres ?? '--'}</td><td>${a.annee ?? '--'}</td><td>${esc(a.dpe || '--')}</td>
        <td>${(a.extras || []).map((k) => esc((NOMS_EQUIP[k] || k).toLowerCase())).join(', ') || '--'}</td>
        <td>${r && r.ok ? `<b class="${r.ecart <= -5 ? 'pos' : r.ecart >= 5 ? 'neg' : ''}">${r.ecart > 0 ? '+' : ''}${num(r.ecart, 0)} %</b>` : '--'}</td></tr>`;
    }).join('');
    return `<div class="scroll"><table class="tbl cmp tab-veille"><thead><tr>${selection ? '<th></th>' : ''}${entete('commune', 'Annonce')}${entete('prix', 'Prix')}${entete('surface', 'm²')}${entete('ppm2', '€/m²')}<th>Pièces</th><th>Ch.</th>${entete('annee', 'Année')}<th>DPE</th><th>Équipements</th>${entete('ecart', 'Écart marché')}</tr></thead><tbody>${lignes}</tbody></table></div>`;
  }

  function afficherListe() {
    const l = visibles();
    const total = parStatut().length;
    const sv = root.querySelector('#sel-veille');
    if (sv) sv.innerHTML = optionsVeilles(scope, { toutes: true });
    const dm = root.querySelector('#sel-demenager');
    if (dm) dm.innerHTML = optionsVeilles('', { vide: 'Déplacer vers...' });
    root.querySelector('#compteur').textContent = total ? `${l.length} annonce${l.length > 1 ? 's' : ''} affichée${l.length > 1 ? 's' : ''} sur ${total}` : '';
    const nbf = nombreFiltres(filtres);
    root.querySelector('#nb-filtres').textContent = nbf ? ` (${nbf})` : '';
    const zone = root.querySelector('#liste');
    if (!annonces.list().length) {
      zone.innerHTML = carte('', `<div class="empty"><p>Aucune annonce suivie pour l'instant.</p><p class="muted">Analysez une annonce puis touchez « Suivre cette annonce », ou importez une page de résultats.</p><div class="actions"><a class="btn primary" href="#importer">${icon('scan')}Importer plusieurs annonces</a><a class="btn" href="#analyser">Analyser une annonce</a></div></div>`);
    } else if (!l.length) {
      zone.innerHTML = carte('', `<div class="empty"><p>Aucune annonce ne correspond aux filtres.</p><button type="button" class="btn" id="f-reset-2">Réinitialiser les filtres</button></div>`);
    } else if (vue === 'tableau') {
      zone.innerHTML = tableau(l);
    } else if (tri === 'commune') {
      let courante = null;
      zone.innerHTML = l.map((a) => {
        const entetes = a.communeNom !== courante ? `<h3 class="groupe">${esc(a.communeNom || 'Sans commune')}<span class="sub">${l.filter((x) => x.communeNom === a.communeNom).length} annonce(s)</span></h3>` : '';
        courante = a.communeNom;
        return entetes + carteAnnonce(a);
      }).join('');
    } else {
      zone.innerHTML = l.map(carteAnnonce).join('');
    }
    barreSelection(l);
  }

  /* ---------- Selection et suppression en masse ---------- */
  function barreSelection(l) {
    const barre = root.querySelector('#barre-sel');
    document.body.classList.toggle('avec-barre', selection);
    barre.hidden = !selection;
    root.querySelector('#btn-sel-txt').textContent = selection ? 'Terminer' : 'Sélectionner';
    if (!selection) return;
    const idsVisibles = new Set(l.map((a) => a.id));
    for (const id of [...choisies]) if (!idsVisibles.has(id)) choisies.delete(id);
    const n = choisies.size;
    barre.querySelector('#nb-sel').textContent = `${n} sélectionnée${n > 1 ? 's' : ''}`;
    barre.querySelectorAll('[data-bulk]').forEach((b) => { b.disabled = !n; });
  }

  function basculerSelection(actif) {
    selection = actif;
    if (!actif) choisies.clear();
    afficherListe();
  }

  function supprimerSelection() {
    const ids = [...choisies];
    if (!ids.length) return;
    if (!confirm(`Supprimer ${ids.length} annonce${ids.length > 1 ? 's' : ''} de Ma veille ?`)) return;
    const avant = annonces.list();
    annonces.save(avant.filter((a) => !choisies.has(a.id)));
    choisies.clear();
    afficherListe();
    toastAction(`${ids.length} annonce${ids.length > 1 ? 's' : ''} supprimée${ids.length > 1 ? 's' : ''}`, 'Annuler', () => {
      const actuelles = annonces.list();
      const presentes = new Set(actuelles.map((a) => a.id));
      annonces.save([...avant.filter((a) => !presentes.has(a.id) && ids.includes(a.id)), ...actuelles]);
      afficherListe();
    });
  }

  function changerStatutSelection(s) {
    const ids = new Set(choisies);
    if (!ids.size) return;
    annonces.save(annonces.list().map((a) => (ids.has(a.id) ? { ...a, statut: s } : a)));
    toast(`${ids.size} annonce${ids.size > 1 ? 's' : ''} : statut « ${(STATUTS.find((x) => x.id === s) || {}).nom} »`);
    choisies.clear();
    afficherListe();
  }

  /* ---------- Recherches enregistrees, sauvegarde ---------- */
  function listeRecherches() {
    const l = recherches.list().filter(dansScope);
    if (!l.length) return carte('Mes recherches', '<p class="muted">Aucune recherche enregistrée. Dans « Marché », choisissez une ville puis « Suivre cette recherche » : vous retrouverez ici les liens vers tous les sites.</p>');
    return carte('Mes recherches', `<ul class="searches">${l.map((r) => `<li data-r="${esc(r.id)}"><details><summary><b>${esc(r.nom)}</b>, ${r.mode === 'location' ? 'location' : 'achat'}${r.type ? ', ' + esc(r.type.toLowerCase()) : ''}</summary>
      <ul class="links">${liensRecherche(r, r.mode).map((p) => `<li><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">${esc(p.nom)}<small>${p.direct ? 'recherche directe' : 'accueil'}</small>${icon('external')}</a></li>`).join('')}</ul>
      <div class="actions"><a class="btn ghost" href="#marche?insee=${esc(r.insee)}">${icon('chart')}Voir le marché</a><button class="btn danger" data-act="suppr-r">${icon('trash')}Retirer</button></div></details></li>`).join('')}</ul>`);
  }

  function sauvegarde() {
    return carte('Sauvegarde', `<p class="muted">Vos annonces restent sur cet appareil. Exportez ${scope === 'toutes' ? 'toutes vos veilles' : 'cette veille'} pour la retrouver sur un autre appareil ou l'ouvrir dans un tableur. Supprimer une veille la retire aussi de vos futures sauvegardes.</p>
      <div class="actions"><button class="btn ghost" id="exp-json">${icon('download')}Sauvegarde (.json)</button><button class="btn ghost" id="exp-csv">${icon('download')}Tableur (.csv)</button><label class="btn ghost file">${icon('upload')}Restaurer<input type="file" id="imp" accept="application/json,.json" hidden></label></div>
      <div class="actions"><a class="btn ghost" href="#importer">${icon('scan')}Importer plusieurs annonces</a><a class="btn ghost" href="#alertes">${icon('eye')}Alertes e-mail</a><a class="btn ghost" href="#veilles">Gérer mes veilles et la sauvegarde</a></div>`);
  }

  function barre() {
    return `<div class="barre-sel" id="barre-sel" hidden role="region" aria-label="Actions sur la sélection">
      <span id="nb-sel">0 sélectionnée</span>
      <button type="button" class="btn ghost" id="sel-tout">Tout</button><button type="button" class="btn ghost" id="sel-rien">Aucune</button>
      <select id="sel-statut" data-bulk aria-label="Changer le statut"><option value="">Statut...</option>${STATUTS.map((s) => `<option value="${s.id}">${esc(s.nom)}</option>`).join('')}</select>
      <select id="sel-demenager" data-bulk aria-label="Déplacer vers une autre veille">${optionsVeilles('', { vide: 'Déplacer vers...' })}</select>
      <button type="button" class="btn danger" id="sel-suppr" data-bulk>${icon('trash')}Supprimer</button></div>`;
  }

  function dessiner() {
    const y = window.scrollY;
    root.innerHTML = tete() + `<div class="cols"><aside class="side avant" id="cote"><h3 class="side-titre">Filtres</h3>${panneauFiltres()}</aside><div id="liste"></div></div>` + listeRecherches() + sauvegarde() + barre();
    if (window.matchMedia('(min-width: 1100px)').matches) root.querySelector('#filtres').open = true;
    afficherListe();
    brancher();
    window.scrollTo(0, y);
  }

  async function evaluerTout() {
    await Promise.all(annonces.list().map(async (a) => {
      try { evals.set(a.id, await evaluer(a)); } catch { evals.set(a.id, { ok: false }); }
    }));
  }
  async function reevaluer(id) {
    const a = annonces.list().find((x) => x.id === id);
    if (a) { try { evals.set(id, await evaluer(a)); } catch { evals.set(id, { ok: false }); } }
  }

  /* ---------- Evenements ---------- */
  function majFiltre(el) {
    const k = el.dataset.f;
    if (!k) return;
    filtres[k] = el.value;
    store.set('reg.filtresVeille', filtres);
    afficherListe();
  }
  function reinitialiser() {
    filtres = { ...FILTRES_VIDES, communes: [], equip: [] };
    store.set('reg.filtresVeille', filtres);
    dessiner();
  }
  function basculer(liste, v) { const i = liste.indexOf(v); if (i >= 0) liste.splice(i, 1); else liste.push(v); }

  function brancher() {
    brancherSegments(root, 'seg-statut', (v) => { statut = v; store.set('reg.filtreVeille', v); dessiner(); });
    brancherSegments(root, 'seg-vue', (v) => { vue = v; store.set('reg.vueVeille', v); afficherListe(); });
    brancherVeilleSelect(root.querySelector('#sel-veille'), (id) => { scope = id; veilles.ouvrir(id); choisies.clear(); dessiner(); });
    const dem = root.querySelector('#sel-demenager');
    dem.addEventListener('change', () => {
      let cible = dem.value;
      if (!cible) return;
      if (cible === '__nouvelle') { const v = creerVeille(''); if (!v) { dem.value = ''; return; } cible = v.id; }
      const ids = [...choisies];
      veilles.deplacer(ids, cible);
      toast(`${ids.length} annonce${ids.length > 1 ? 's' : ''} déplacée${ids.length > 1 ? 's' : ''} vers « ${(veilles.get(cible) || {}).nom} »`);
      choisies.clear();
      dessiner();
    });
    root.querySelector('#tri').addEventListener('change', (e) => { tri = e.target.value; store.set('reg.triVeille', tri); afficherListe(); });
    root.querySelector('#btn-sel').addEventListener('click', () => basculerSelection(!selection));
    root.querySelector('#f-reset').addEventListener('click', reinitialiser);

    const panneau = root.querySelector('#filtres');
    panneau.addEventListener('toggle', () => { panneauOuvert = panneau.open; });
    let timer;
    panneau.addEventListener('input', (e) => { if (e.target.dataset.f && e.target.tagName === 'INPUT') { clearTimeout(timer); timer = setTimeout(() => majFiltre(e.target), 250); } });
    panneau.addEventListener('change', (e) => { if (e.target.tagName === 'SELECT') majFiltre(e.target); });
    panneau.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const liste = chip.parentElement.id === 'f-equip' ? filtres.equip : chip.parentElement.id === 'f-communes' ? filtres.communes : null;
      if (!liste) return;
      basculer(liste, chip.dataset.v);
      chip.classList.toggle('on');
      chip.setAttribute('aria-pressed', String(chip.classList.contains('on')));
      store.set('reg.filtresVeille', filtres);
      afficherListe();
    });

    const barreEl = root.querySelector('#barre-sel');
    barreEl.querySelector('#sel-tout').addEventListener('click', () => { visibles().forEach((a) => choisies.add(a.id)); afficherListe(); });
    barreEl.querySelector('#sel-rien').addEventListener('click', () => { choisies.clear(); afficherListe(); });
    barreEl.querySelector('#sel-suppr').addEventListener('click', supprimerSelection);
    barreEl.querySelector('#sel-statut').addEventListener('change', (e) => { if (e.target.value) { changerStatutSelection(e.target.value); e.target.value = ''; } });

    const liste = root.querySelector('#liste');
    liste.addEventListener('toggle', (e) => {
      const d = e.target.closest && e.target.closest('details[data-d]');
      if (d) { if (d.open) ouverts.add(d.dataset.d); else ouverts.delete(d.dataset.d); }
    }, true);
    liste.addEventListener('click', (e) => {
      if (e.target.closest('#f-reset-2')) { reinitialiser(); return; }
      const th = e.target.closest('.th-tri');
      if (th) {
        const [asc, desc] = TRI_COLONNES[th.dataset.tri];
        tri = tri === asc ? desc : asc;
        store.set('reg.triVeille', tri);
        root.querySelector('#tri').value = tri;
        afficherListe();
        return;
      }
      const ligne = e.target.closest('[data-id]');
      if (!ligne) return;
      const id = ligne.dataset.id;
      const a = annonces.list().find((x) => x.id === id);
      const chip = e.target.closest('[data-equip] .chip');
      if (chip && a) {
        const extras = [...(a.extras || [])];
        basculer(extras, chip.dataset.v);
        annonces.update(id, { extras });
        chip.classList.toggle('on');
        chip.setAttribute('aria-pressed', String(chip.classList.contains('on')));
        return;
      }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'suppr') {
        if (confirm('Supprimer cette annonce de Ma veille ?')) {
          annonces.remove(id);
          afficherListe();
          toastAction('Annonce supprimée', 'Annuler', () => { annonces.save([a, ...annonces.list()]); afficherListe(); });
        }
      }
      if (b.dataset.act === 'verifie') { annonces.update(id, { verifieLe: todayISO() }); toast('Marquée comme vérifiée'); afficherListe(); }
      if (b.dataset.act === 'prix') {
        const n = toNumber(ligne.querySelector('[id^="np-"]').value);
        if (!(n > 0)) { toast('Saisissez le nouveau prix'); return; }
        annonces.changerPrix(id, n);
        reevaluer(id).then(afficherListe);
      }
      if (b.matches('[data-act="sel"]')) {
        if (b.checked) choisies.add(id); else choisies.delete(id);
        ligne.classList.toggle('choisie', b.checked);
        barreSelection(visibles());
      }
    });
    liste.addEventListener('change', (e) => {
      const ligne = e.target.closest('.ann');
      if (!ligne) return;
      const id = ligne.dataset.id;
      if (e.target.id && e.target.id.startsWith('c-veille-')) {
        let cible = e.target.value;
        if (cible === '__nouvelle') { const v = creerVeille(''); if (!v) { e.target.value = e.target.dataset.prev; return; } cible = v.id; }
        veilles.deplacer([id], cible);
        toast(`Rangée dans « ${(veilles.get(cible) || {}).nom} »`);
        dessiner();
        return;
      }
      if (e.target.dataset.act === 'statut') { annonces.update(id, { statut: e.target.value }); if (statut !== 'tout') afficherListe(); return; }
      if (e.target.dataset.act === 'note') { annonces.update(id, { note: e.target.value.slice(0, 2000) }); return; }
      const f = e.target.dataset.f;
      if (!f) return;
      const texte = ['type', 'dpe', 'etat', 'chauffage'].includes(f);
      const valeur = texte ? (e.target.value || null) : toNumber(e.target.value);
      if (f === 'surface' && !(valeur > 0)) { toast('La surface doit être positive'); return; }
      annonces.update(id, { [f]: valeur });
      if (['type', 'surface', 'pieces', 'dpe', 'terrain'].includes(f)) reevaluer(id).then(afficherListe); else afficherListe();
    });

    root.querySelector('.searches')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act="suppr-r"]');
      if (b) { recherches.remove(b.closest('li[data-r]').dataset.r); dessiner(); }
    });
    root.querySelector('#exp-json')?.addEventListener('click', () => telecharger(`veille-immo-${todayISO()}.json`, exporter(scope === 'toutes' ? null : scope)));
    root.querySelector('#exp-csv')?.addEventListener('click', () => {
      const lignes = annonces.list().filter(dansScope).map((a) => {
        const r = evals.get(a.id);
        const v = variationPrix(a);
        return [a.titre, a.communeNom, a.cp, a.type, a.prix, a.surface, a.pieces, a.surface ? Math.round(a.prix / a.surface) : '', r && r.ok && a.mode === 'vente' ? Math.round(r.ecart * 10) / 10 : '', r && r.ok && a.mode === 'vente' ? r.score : '', a.dpe, (STATUTS.find((s) => s.id === a.statut) || {}).nom, v != null ? Math.round(v * 10) / 10 : '', a.url, a.note,
          a.chambres, a.sdb, a.annee, a.etage, a.terrain, (ETATS.find(([k]) => k === a.etat) || [])[1], (CHAUFFAGES.find(([k]) => k === a.chauffage) || [])[1], (a.extras || []).map((k) => NOMS_EQUIP[k]).join(' / '), a.chargesAn, a.mode === 'location' ? 'Location' : 'Vente', categorie(r), (veilles.get(veilles.idDe(a)) || {}).nom];
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

  dessiner();
  if (annonces.list().length) { await evaluerTout(); afficherListe(); }
}
