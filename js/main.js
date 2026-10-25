/* Orchestration : navigation par onglets (adresse "#ecran?parametres"), theme, partage d'annonce depuis le telephone. */

import { $, store } from './util.js';
import { icon } from './icons.js';

const ECRANS = {
  marche: { titre: 'Marché', icone: 'chart', charger: () => import('./views/marche.js') },
  analyser: { titre: 'Analyser', icone: 'scan', charger: () => import('./views/analyser.js') },
  alertes: { titre: 'Alertes e-mail', icone: 'eye', onglet: 'veille', masque: true, charger: () => import('./views/alertes.js') },
  importer: { titre: 'Plusieurs annonces', icone: 'scan', onglet: 'analyser', masque: true, charger: () => import('./views/importer.js') },
  veille: { titre: 'Ma veille', icone: 'eye', charger: () => import('./views/veille.js') },
  credit: { titre: 'Crédit', icone: 'calc', charger: () => import('./views/credit.js') },
  outils: { titre: 'Plus', icone: 'grid', charger: () => import('./views/outils.js') },
};

/* ---------- Theme ---------- */
const THEMES = ['auto', 'light', 'dark'];
const THEME_LABEL = { auto: 'automatique', light: 'clair', dark: 'sombre' };
function appliquerTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const b = $('theme-btn');
  b.title = `Thème : ${THEME_LABEL[t]}`;
  b.setAttribute('aria-label', `Changer de thème (actuel : ${THEME_LABEL[t]})`);
}
function initTheme() {
  let t = store.get('theme');
  if (!THEMES.includes(t)) t = 'auto';
  appliquerTheme(t);
  $('theme-btn').addEventListener('click', () => {
    t = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
    store.set('theme', t);
    appliquerTheme(t);
  });
}

/* ---------- Navigation ---------- */
function lireAdresse() {
  const h = location.hash.replace(/^#/, '');
  const [nom, qs = ''] = h.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs));
  return { ecran: ECRANS[nom] ? nom : null, params };
}

let seq = 0;
async function afficher() {
  const { ecran, params } = lireAdresse();
  const nom = ecran || 'marche';
  const mon = ++seq;
  document.querySelectorAll('#tabs a').forEach((a) => a.setAttribute('aria-current', a.dataset.e === (ECRANS[nom].onglet || nom) ? 'page' : 'false'));
  const vue = $('view');
  const conteneur = document.createElement('div');
  conteneur.className = 'view-inner';
  vue.replaceChildren(conteneur);
  document.title = `${ECRANS[nom].titre} · Veille immo`;
  try {
    const mod = await ECRANS[nom].charger();
    if (mon !== seq) return;
    await mod.render(conteneur, params);
  } catch (e) {
    if (mon !== seq) return;
    conteneur.innerHTML = `<section class="card"><div class="notice warn"><p>Cet écran n'a pas pu se charger (${String(e.message).replace(/[<>&]/g, '')}). Vérifiez la connexion et rechargez la page.</p></div></section>`;
  }
  if (mon === seq) window.scrollTo(0, 0);
}

function initTabs() {
  $('tabs').innerHTML = Object.entries(ECRANS).filter(([, e]) => !e.masque).map(([k, e]) => `<a href="#${k}" data-e="${k}" aria-current="false">${icon(e.icone)}<span>${e.titre}</span></a>`).join('');
}

/* Partage depuis le telephone (manifest share_target) : ?text=...&url=... devient #analyser?text=...&url=... */
function traiterPartage() {
  const q = new URLSearchParams(location.search);
  const text = q.get('text') || '', url = q.get('url') || '', title = q.get('title') || '';
  if (!text && !url) return;
  const p = new URLSearchParams({ text: `${title}\n${text}`.trim(), url });
  history.replaceState(null, '', location.pathname + '#analyser?' + p.toString());
}

function initSW() {
  if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register('sw.js').catch(() => { /* hors ligne indisponible, sans gravite */ });
}

initTheme();
initTabs();
traiterPartage();
window.addEventListener('hashchange', afficher);
afficher();
initSW();
