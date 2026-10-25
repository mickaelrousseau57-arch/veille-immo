/* Ecran "Mes veilles" : creer, ouvrir, renommer, supprimer des veilles ; sauvegarde et remise a zero. */

import { esc, todayISO, frDate } from '../util.js';
import { carte, champ, toast, toastAction, telecharger, lire } from '../ui.js';
import { annonces, recherches, veilles, exporter, importer, remiseAZero, restaurerInstantane, toutRemettreAZero } from '../state.js';
import { icon } from '../icons.js';
import { depotValide, envoyer, recuperer, remplacerLocal } from '../sync.js';

const lireSync = () => { try { return JSON.parse(localStorage.getItem('immo.sync') || '{}'); } catch { return {}; } };
const ecrireSync = (o) => { try { localStorage.setItem('immo.sync', JSON.stringify(o)); } catch { /* stockage indisponible */ } };
const lirePhrase = () => { try { return sessionStorage.getItem('immo-phrase') || ''; } catch { return ''; } };
const retenirPhrase = (p) => { try { sessionStorage.setItem('immo-phrase', p); } catch { /* tant pis */ } };

export async function render(root) {
  function ligne(v) {
    const n = veilles.compter(v.id);
    return `<li class="veille-ligne" data-v="${esc(v.id)}">
      <div class="veille-nom"><b>${esc(v.nom)}</b><small>${n.annonces} annonce${n.annonces > 1 ? 's' : ''}, ${n.recherches} recherche${n.recherches > 1 ? 's' : ''}, créée le ${esc(frDate(v.creeLe))}</small></div>
      <div class="actions">
        <a class="btn primary" href="#veille?v=${esc(v.id)}">Ouvrir</a>
        <button type="button" class="btn ghost" data-act="renommer">Renommer</button>
        <button type="button" class="btn danger" data-act="supprimer">${icon('trash')}Supprimer</button>
      </div></li>`;
  }

  function dessiner() {
    const l = veilles.list();
    const total = annonces.list().length;
    const sync = lireSync();
    root.innerHTML = carte('Mes veilles', `
      <p class="lead">Une veille par ville ou par projet : vous rangez vos annonces où vous voulez et vous ouvrez chaque veille quand vous le souhaitez. Supprimer une veille supprime aussi ses annonces et ses recherches, et les retire de vos futures sauvegardes.</p>
      <ul class="veilles">${l.map(ligne).join('')}</ul>
      <div class="actions"><a class="btn" href="#veille?v=toutes">Voir toutes les annonces (${total})</a></div>`)
      + carte('Nouvelle veille', `${champ({ id: 'nv-nom', label: 'Nom (une ville, un projet...)', valeur: '', attrs: 'placeholder="Metz, Thionville, investissement..." maxlength="60"' })}
        <div class="actions"><button type="button" class="btn primary" id="nv-creer">${icon('plus')}Créer la veille</button></div>`)
      + carte('Synchroniser mes appareils', `
        <p class="muted">Retrouvez les mêmes veilles sur votre téléphone, votre tablette et votre ordinateur. Vos données sont chiffrées sur l'appareil avec une phrase secrète, puis déposées dans un dépôt GitHub privé qui est le vôtre. Personne d'autre ne peut les lire, et la phrase secrète n'est jamais enregistrée.</p>
        <details><summary>Mise en place, à faire une seule fois</summary>
          <ol class="steps">
            <li>Sur GitHub, créez un dépôt privé (par exemple « veille-immo-sync ») en cochant « Add a README file ».</li>
            <li>Dans GitHub, ouvrez Settings, Developer settings, Personal access tokens, Fine-grained tokens, puis Generate new token. Choisissez « Only select repositories » et ce dépôt, puis dans Repository permissions mettez Contents sur « Read and write ». La clé ne peut alors rien faire d'autre.</li>
            <li>Sur chaque appareil, saisissez ci-dessous le nom du dépôt, la clé et la même phrase secrète. La clé est gardée sur l'appareil.</li>
          </ol>
        </details>
        ${champ({ id: 'sy-depot', label: 'Dépôt (propriétaire/nom)', valeur: sync.depot || '', attrs: 'placeholder="votre-compte/veille-immo-sync" autocomplete="off" autocapitalize="off" spellcheck="false"' })}
        ${champ({ id: 'sy-token', label: 'Clé d\'accès GitHub', type: 'password', valeur: sync.token || '', attrs: 'autocomplete="off"' })}
        ${champ({ id: 'sy-phrase', label: 'Phrase secrète (la même sur tous vos appareils)', type: 'password', valeur: lirePhrase(), attrs: 'autocomplete="off"', aide: 'Si vous la perdez, les données déposées sont définitivement illisibles : gardez aussi une sauvegarde .json.' })}
        <div class="actions"><button type="button" class="btn primary" id="sy-envoi">${icon('upload')}Envoyer vers le dépôt</button>
          <button type="button" class="btn" id="sy-recup">${icon('download')}Récupérer depuis le dépôt</button></div>
        <p class="note" id="sy-etat">${sync.dernier ? `Dernière synchronisation sur cet appareil : ${esc(sync.dernier)}.` : 'Rien n\'a encore été synchronisé depuis cet appareil.'} « Envoyer » remplace le contenu du dépôt par cet appareil ; « Récupérer » remplace cet appareil par le dépôt (vous pouvez annuler). Pensez à envoyer avant de changer d'appareil.</p>`)
      + carte('Sauvegarde et remise à zéro', `
        <p class="muted">Tout reste sur cet appareil. Sauvegardez avant d'effacer ou de changer d'appareil.</p>
        <div class="actions"><button type="button" class="btn ghost" id="bk-json">${icon('download')}Tout sauvegarder (.json)</button>
          <label class="btn ghost file">${icon('upload')}Restaurer une sauvegarde<input type="file" id="bk-imp" accept="application/json,.json" hidden></label></div>
        <h3 class="sec">Remise à zéro</h3>
        <p class="muted" style="margin:0">Vous pourrez annuler pendant quelques secondes. Au-delà, il faudra restaurer une sauvegarde.</p>
        <div class="actions"><button type="button" class="btn danger" id="raz-veilles">${icon('trash')}Vider toutes mes veilles</button>
          <button type="button" class="btn danger" id="raz-tout">${icon('trash')}Tout remettre à zéro</button></div>
        <p class="note">« Vider » efface les annonces, les veilles et les recherches. « Tout remettre à zéro » efface aussi vos réglages, villes récentes, prix de référence, comparateur et annonces observées ; seul le thème clair ou sombre est conservé.</p>`);
    brancher();
  }

  function brancher() {
    root.querySelector('#nv-creer').addEventListener('click', () => {
      const nom = lire(root, 'nv-nom').trim();
      if (!nom) { toast('Donnez un nom à la veille'); return; }
      const v = veilles.add(nom);
      veilles.ouvrir(v.id);
      location.hash = '#veille';
    });
    root.querySelector('#nv-nom').addEventListener('keydown', (e) => { if (e.key === 'Enter') root.querySelector('#nv-creer').click(); });

    root.querySelector('.veilles').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const id = b.closest('[data-v]').dataset.v;
      const v = veilles.get(id);
      if (b.dataset.act === 'renommer') {
        const nom = window.prompt('Nouveau nom de la veille', v.nom);
        if (nom && nom.trim()) { veilles.renommer(id, nom); dessiner(); }
      }
      if (b.dataset.act === 'supprimer') {
        const n = veilles.compter(id);
        const msg = n.annonces || n.recherches
          ? `Supprimer la veille « ${v.nom} » ?\n\n${n.annonces} annonce(s) et ${n.recherches} recherche(s) seront supprimées, et retirées de vos futures sauvegardes.`
          : `Supprimer la veille « ${v.nom} » ?`;
        if (!window.confirm(msg)) return;
        const s = veilles.supprimer(id);
        dessiner();
        toastAction(`Veille « ${v.nom} » supprimée`, 'Annuler', () => { veilles.restaurer(s); dessiner(); }, 10000);
      }
    });

    root.querySelector('#bk-json').addEventListener('click', () => telecharger(`veille-immo-${todayISO()}.json`, exporter()));
    root.querySelector('#bk-imp').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { const n = importer(await f.text()); toast(`${n} annonce(s) restaurée(s)`); dessiner(); } catch (err) { toast(err.message); }
    });

    const reglagesSync = () => {
      const depot = lire(root, 'sy-depot').trim();
      const token = lire(root, 'sy-token').trim();
      const phrase = lire(root, 'sy-phrase');
      if (!depotValide(depot)) { toast('Indiquez le dépôt sous la forme compte/nom'); return null; }
      if (!token) { toast('Collez la clé d\'accès GitHub'); return null; }
      if (phrase.length < 8) { toast('Choisissez une phrase secrète d\'au moins 8 caractères'); return null; }
      ecrireSync({ ...lireSync(), depot, token });
      retenirPhrase(phrase);
      return { reg: { depot, token }, phrase };
    };
    const occupe = (b, oui) => { root.querySelectorAll('#sy-envoi, #sy-recup').forEach((x) => { x.disabled = oui; }); b.setAttribute('aria-busy', String(oui)); };
    const marquer = () => { const d = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }); ecrireSync({ ...lireSync(), dernier: d }); root.querySelector('#sy-etat').textContent = `Dernière synchronisation sur cet appareil : ${d}.`; };
    root.querySelector('#sy-envoi').addEventListener('click', async (e) => {
      const r = reglagesSync(); if (!r) return;
      const b = e.currentTarget; occupe(b, true);
      try { await envoyer(r.reg, r.phrase); marquer(); toast('Données envoyées vers le dépôt'); } catch (err) { toast(err.message); } finally { occupe(b, false); }
    });
    root.querySelector('#sy-recup').addEventListener('click', async (e) => {
      const r = reglagesSync(); if (!r) return;
      const b = e.currentTarget; occupe(b, true);
      try {
        const res = await recuperer(r.reg, r.phrase);
        if (!res) { toast('Rien dans le dépôt pour l\'instant : envoyez d\'abord depuis l\'appareil qui a vos données'); return; }
        const n = Object.keys(res.donnees).length;
        if (!window.confirm(`Remplacer les données de cet appareil par celles du dépôt (envoyées le ${res.maj ? new Date(res.maj).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'date inconnue'}) ?\n\nVous pourrez annuler pendant quelques secondes.`)) return;
        const avant = remplacerLocal(res.donnees);
        marquer(); dessiner();
        toastAction(`Données récupérées (${n} éléments)`, 'Annuler', () => { remplacerLocal(avant); toast('Données précédentes rétablies'); dessiner(); }, 12000);
      } catch (err) { toast(err.message); } finally { occupe(b, false); }
    });

    root.querySelector('#raz-veilles').addEventListener('click', () => {
      if (!window.confirm(`Vider toutes vos veilles ?\n\n${annonces.list().length} annonce(s), ${veilles.list().length} veille(s) et ${recherches.list().length} recherche(s) seront effacées de cet appareil.\n\nPensez à faire une sauvegarde avant.`)) return;
      const snap = remiseAZero('veilles');
      if (!Object.keys(snap).length) { toast('Rien à effacer'); return; }
      dessiner();
      toastAction('Veilles vidées', 'Annuler', () => { restaurerInstantane(snap); toast('Données restaurées'); dessiner(); }, 12000);
    });
    root.querySelector('#raz-tout').addEventListener('click', () => {
      if (window.confirm('Tout remettre à zéro ?\n\nAnnonces, veilles, recherches, réglages, villes récentes, prix de référence et annonces observées seront effacés de cet appareil (le thème clair ou sombre est conservé).\n\nPensez à faire une sauvegarde avant.')) toutRemettreAZero();
    });
  }

  dessiner();
}
