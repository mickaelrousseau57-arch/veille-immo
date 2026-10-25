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
      .bindPopup(`<strong>${esc(v[7] || 'Adresse non précisée')}</strong><br>${esc(frDate(v[0]))}<br>${num(v[1])} € · ${num(v[2])} m²${v[3] ? ' · ' + v[3] + ' p.' : ''}<br><strong>${num(ppm2)} €/m²</strong>`)
      .addTo(map);
    pts.push([v[5], v[6]]);
  }
  if (pts.length) map.fitBounds(pts, { padding: [24, 24], maxZoom: 16 }); else map.setView(centre, 12);
  setTimeout(() => map && map.invalidateSize(), 50);
  return rows.length;
}
