/* Carte des ventes recentes (Leaflet charge a la demande). Couleur selon l'ecart au prix median. */

import { esc, num, frDate } from './util.js';

let loading = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'vendor/leaflet/leaflet.css';
      document.head.appendChild(css);
      const s = document.createElement('script');
      s.src = 'vendor/leaflet/leaflet.js';
      s.onload = () => resolve(window.L);
      s.onerror = () => { loading = null; reject(new Error('Carte indisponible')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

const couleur = (ecart) => (ecart <= -10 ? '#2f9e62' : ecart < 10 ? '#4a6fa5' : ecart < 25 ? '#e08a1e' : '#c9453a');

let map = null;
export async function afficherVentes(el, { centre, ventes, mediane, type }) {
  const L = await loadLeaflet();
  if (map) { map.remove(); map = null; }
  const t = type === 'Maison' ? 1 : 0;
  const rows = ventes.filter((v) => v[4] === t && v[5] != null);
  map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
  const pts = [];
  for (const v of rows) {
    const ppm2 = v[1] / v[2];
    const ecart = mediane ? (ppm2 / mediane - 1) * 100 : 0;
    L.circleMarker([v[5], v[6]], { radius: 7, color: '#fff', weight: 1.5, fillColor: couleur(ecart), fillOpacity: 0.9 })
      .bindPopup(`<strong>${esc(v[7] || 'Adresse non précisée')}</strong><br>${esc(frDate(v[0]))}<br>${num(v[1])} €, ${num(v[2])} m²${v[3] ? ', ' + v[3] + ' p.' : ''}<br><strong>${num(ppm2)} €/m²</strong>`)
      .addTo(map);
    pts.push([v[5], v[6]]);
  }
  if (pts.length) map.fitBounds(pts, { padding: [24, 24], maxZoom: 16 }); else map.setView(centre, 12);
  setTimeout(() => map && map.invalidateSize(), 50);
  return rows.length;
}

/* Carte pour poser le repere d'un bien : un toucher place le repere ; le cercle montre la zone des ventes voisines prises en compte. */
let carteChoix = null;
export async function choisirPoint(el, { centre, point = null, rayonKm = 1.5, onPick }) {
  const L = await loadLeaflet();
  if (carteChoix) { carteChoix.remove(); carteChoix = null; }
  const m = L.map(el, { scrollWheelZoom: false }).setView(point || centre, point ? 15 : 13);
  carteChoix = m;
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
  let marqueur = null, cercle = null;
  const poser = (lat, lon, notifier) => {
    if (marqueur) marqueur.setLatLng([lat, lon]); else marqueur = L.marker([lat, lon]).addTo(m);
    if (cercle) cercle.setLatLng([lat, lon]); else cercle = L.circle([lat, lon], { radius: rayonKm * 1000, weight: 1, color: '#0f6b5f', fillOpacity: 0.07 }).addTo(m);
    if (notifier) onPick(lat, lon);
  };
  m.on('click', (e) => poser(e.latlng.lat, e.latlng.lng, true));
  if (point) poser(point[0], point[1], false);
  setTimeout(() => m.invalidateSize(), 60);
  return { aller: (lat, lon) => { poser(lat, lon, true); m.setView([lat, lon], 15); } };
}
