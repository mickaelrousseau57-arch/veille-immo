/* Ecran "Mes veilles" : creer, ouvrir, renommer, supprimer des veilles ; sauvegarde et remise a zero. */

import { esc, todayISO, frDate } from '../util.js';
import { carte, champ, toast, toastAction, telecharger, lire } from '../ui.js';
import { annonces, recherches, veilles, exporter, importer, remiseAZero, restaurerInstantane, toutRemettreAZero } from '../state.js';
import { icon } from '../icons.js';

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
    root.innerHTML = carte('Mes veilles', `
      <p class="lead">Une veille par ville ou par projet : vous rangez vos annonces où vous voulez et vous ouvrez chaque veille quand vous le souhaitez. Supprimer une veille supprime aussi ses annonces et ses recherches, et les retire de vos futures sauvegardes.</p>
      <ul class="veilles">${l.map(ligne).join('')}</ul>
      <div class="actions"><a class="btn" href="#veille?v=toutes">Voir toutes les annonces (${total})</a></div>`)
      + carte('Nouvelle veille', `${champ({ id: 'nv-nom', label: 'Nom (une ville, un projet...)', valeur: '', attrs: 'placeholder="Metz, Thionville, investissement..." maxlength="60"' })}
        <div class="actions"><button type="button" class="btn primary" id="nv-creer">${icon('plus')}Créer la veille</button></div>`)
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
