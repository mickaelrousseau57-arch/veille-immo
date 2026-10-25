/* Ecran "Alertes e-mail" : recevoir automatiquement les nouvelles annonces des sites, sans rien collecter soi-meme. */

import { esc, toNumber } from '../util.js';
import { carte, champ, copier, toast } from '../ui.js';
import { getCommune, recherches, reglages } from '../state.js';
import { PORTAILS, criteres } from '../portals.js';
import { consigneAlerte } from '../alertes.js';
import { icon } from '../icons.js';

export async function render(root) {
  const base = new URL('./', location.href).href;
  const c = getCommune();
  let liste = recherches.list();
  if (!liste.length && c) liste = [{ id: 'courante', insee: c.insee, nom: c.nom, dep: c.dep, cps: c.cps, mode: 'achat', type: '' }];
  const prefs = reglages.get('alertes', { heure: 8, budget: '', surface: '', exclus: [], portails: PORTAILS.slice(0, 5).map((p) => p.nom) });

  function etape1() {
    if (!liste.length) {
      return carte('1. Créer l\'alerte sur chaque site', `<div class="empty"><p>Choisissez d'abord une ville dans « Marché » puis touchez « Suivre cette recherche ».</p><a class="btn primary" href="#marche">${icon('chart')}Aller au marché</a></div>`);
    }
    return carte('1. Créer l\'alerte sur chaque site', `
      <p class="lead">Sur chaque site, enregistrez votre recherche et activez l'alerte par e-mail. Copiez les critères ci-dessous pour les recopier.</p>
      <ul class="searches">${liste.map((r) => `<li data-r="${esc(r.id)}"><details><summary><b>${esc(r.nom)}</b> · ${r.mode === 'location' ? 'location' : 'achat'}${r.type ? ' · ' + esc(String(r.type).toLowerCase()) : ''}</summary>
        <div class="actions"><button class="btn ghost" data-act="crit">${icon('copy')}Copier les critères</button></div>
        <ul class="links">${PORTAILS.map((p) => `<li><a href="${esc(p.accueil)}" target="_blank" rel="noopener noreferrer">${esc(p.nom)}<small>accueil</small>${icon('external')}</a></li>`).join('')}</ul></details></li>`).join('')}</ul>
      <p class="note">Les e-mails d'alerte arrivent dans votre boîte Gmail. Quelques jours d'alertes suffisent pour tester.</p>`);
  }

  function etape2() {
    return carte('2. Exploiter les alertes', `
      <h3>Option A : à la main, tout de suite</h3>
      <p class="muted" style="margin:6px 0 0">Quand une alerte arrive, ouvrez l'e-mail, copiez son contenu et collez-le dans « Plusieurs annonces » : l'application lit les annonces, fusionne les doublons et les classe. Les liens ne sont pas toujours conservés par le copier-coller.</p>
      <div class="actions"><a class="btn" href="#importer">${icon('scan')}Plusieurs annonces</a></div>
      <hr>
      <h3>Option B : automatique, avec Claude</h3>
      <p class="muted" style="margin:6px 0 0">Une tâche planifiée de Claude lit chaque jour vos e-mails d'alerte, fusionne les doublons, compare aux prix réels et prépare un brouillon de résumé dans Gmail (jamais envoyé automatiquement). Le brouillon se termine par un bloc à coller dans « Plusieurs annonces » : toutes les nouveautés arrivent classées dans Ma veille.</p>
      <div class="grid2">
        ${champ({ id: 'al-heure', label: 'Heure du résumé', type: 'number', valeur: prefs.heure, suffixe: 'h' })}
        ${champ({ id: 'al-budget', label: 'Budget ou loyer maximum (facultatif)', type: 'number', valeur: prefs.budget, suffixe: '€' })}
        ${champ({ id: 'al-surf', label: 'Surface minimale (facultatif)', type: 'number', valeur: prefs.surface, suffixe: 'm²' })}
      </div>
      <p class="hint">Sites dont vous recevez des alertes :</p>
      <div class="chips" id="al-portails">${PORTAILS.map((p) => `<button type="button" class="chip${prefs.portails.includes(p.nom) ? ' on' : ''}" data-p="${esc(p.nom)}" aria-pressed="${prefs.portails.includes(p.nom)}">${esc(p.nom)}</button>`).join('')}</div>
      <div class="field"><label for="al-texte">Consigne à donner à Claude</label><div class="inp"><textarea id="al-texte" rows="8" readonly></textarea></div></div>
      <div class="actions"><button class="btn primary" id="al-copier">${icon('copy')}Copier la consigne</button></div>
      <ol class="steps">
        <li>Copiez la consigne.</li>
        <li>Dans Claude, créez une tâche planifiée quotidienne et collez la consigne. Autorisez la lecture de Gmail et la création de brouillons uniquement.</li>
        <li>Chaque matin, ouvrez le brouillon, copiez son dernier bloc et collez-le dans « Plusieurs annonces ».</li>
      </ol>
      <p class="note">La consigne est faite pour ne rien modifier dans votre boîte mail et ne jamais envoyer de message. Elle lit les prix du marché dans les fichiers publics de cette application (${esc(base)}data/). Si vous voulez que la tâche soit créée à votre place dans cette session Claude, demandez-le : elle ne peut démarrer qu'après vos premières alertes.</p>`);
  }

  function texte() {
    const choisies = liste;
    const actifs = Array.from(root.querySelectorAll('#al-portails .chip.on')).map((x) => x.dataset.p);
    const heure = Math.min(23, Math.max(0, Math.round(toNumber(root.querySelector('#al-heure').value) ?? 8)));
    const budget = toNumber(root.querySelector('#al-budget').value);
    const surface = toNumber(root.querySelector('#al-surf').value);
    reglages.set('alertes', { heure, budget: budget || '', surface: surface || '', portails: actifs });
    root.querySelector('#al-texte').value = consigneAlerte({ base, recherches: choisies, portails: actifs, heure, budgetMax: budget, surfaceMin: surface });
  }

  root.innerHTML = etape1() + etape2();
  texte();
  root.addEventListener('input', (e) => { if (e.target.id && e.target.id.startsWith('al-')) texte(); });
  root.addEventListener('click', (e) => {
    const chip = e.target.closest('#al-portails .chip');
    if (chip) { chip.classList.toggle('on'); chip.setAttribute('aria-pressed', String(chip.classList.contains('on'))); texte(); return; }
    if (e.target.closest('#al-copier')) { copier(root.querySelector('#al-texte').value); return; }
    const b = e.target.closest('[data-act="crit"]');
    if (b) {
      const r = liste.find((x) => x.id === b.closest('li[data-r]').dataset.r);
      if (r) copier(criteres({ commune: r, mode: r.mode, type: r.type ? String(r.type).toLowerCase() : '', budgetMax: toNumber(root.querySelector('#al-budget').value), surfaceMin: toNumber(root.querySelector('#al-surf').value) }));
      else toast('Recherche introuvable');
    }
  });
}
