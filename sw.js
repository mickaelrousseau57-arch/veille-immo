/* Mise en cache de l'application pour un lancement rapide et hors ligne.
   Reseau d'abord (une mise a jour publiee est visible des l'ouverture suivante), cache en secours.
   Les fonds de carte (autre domaine) ne passent pas par ici. */
const CACHE = 'immo-shell-v8';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  'js/main.js', 'js/util.js', 'js/icons.js', 'js/data.js', 'js/state.js', 'js/search.js', 'js/analysis.js', 'js/credit.js', 'js/parse.js', 'js/portals.js',
  'js/charts.js', 'js/map.js', 'js/ui.js', 'js/evaluer.js', 'js/multi.js', 'js/extract.js', 'js/alertes.js', 'js/presse.js', 'js/caracteristiques.js', 'js/filtres.js', 'js/estimation.js', 'js/sync.js',
  'js/views/marche.js', 'js/views/analyser.js', 'js/views/veille.js', 'js/views/credit.js', 'js/views/outils.js', 'js/views/resultat.js', 'js/views/importer.js', 'js/views/alertes.js', 'js/views/marquepage.js', 'js/views/estimer.js', 'js/views/veilles.js',
  'fonts/archivo-latin-wdth-normal.woff2', 'fonts/ibm-plex-sans-latin-wght-normal.woff2',
  'data/meta.json', 'data/taux.json', 'data/refs-notaires.json', 'data/communes.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok && !url.search) {
          const copy = r.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
