/* Outils partages : formats, stockage, texte. Aucune dependance au DOM a l'import (testable avec Node). */

const FMT = {
  0: new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }),
  1: new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  2: new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
};

export const $ = (id) => document.getElementById(id);
export const num = (v, d = 0) => (v == null || Number.isNaN(v) ? '--' : FMT[d].format(v).replace(/[  ]/g, ' '));
export const eur = (v, d = 0) => (v == null || Number.isNaN(v) ? '--' : `${num(v, d)} €`);
export const eurM2 = (v) => (v == null || Number.isNaN(v) ? '--' : `${num(v)} €/m²`);
export const pct = (v, d = 1) => (v == null || Number.isNaN(v) ? '--' : `${num(v, d)} %`);
export const signedPct = (v, d = 1) => (v == null || Number.isNaN(v) ? '--' : `${v > 0 ? '+' : ''}${num(v, d)} %`);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* Lit un nombre saisi par l'utilisateur ("250 000", "250000,5", "1.250,50 €"). Retourne null si vide ou invalide. */
export function toNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  let s = String(v).replace(/[\s  €%]/g, '');
  if (!s) return null;
  if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* Stockage local : tout reste sur l'appareil. Toutes les cles commencent par "immo.". */
export const store = {
  get(k, def = null) {
    try {
      const v = JSON.parse(localStorage.getItem('immo.' + k));
      return v == null ? def : v;
    } catch { return def; }
  },
  set(k, v) { try { localStorage.setItem('immo.' + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem('immo.' + k); } catch { /* stockage indisponible */ } },
};

/* Texte de recherche : minuscules, sans accents ni ponctuation ("Saint-Étienne" -> "saint etienne"). */
export function norm(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’'`-]/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export const frDate = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function distKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
