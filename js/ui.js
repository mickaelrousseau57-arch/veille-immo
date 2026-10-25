/* Elements d'interface partages : badges, indicateurs, champs, selecteur de commune, messages. */

import { esc, num, store } from './util.js';
import { chercher } from './data.js';
import { icon } from './icons.js';
import { veilles } from './state.js';

export const badge = (tone, texte) => `<span class="badge ${tone}">${esc(texte)}</span>`;

export const kpi = (label, valeur, sous = '') => `<div class="fig"><p class="fig-v">${valeur}</p><p class="fig-l">${label}</p>${sous ? `<p class="fig-s">${sous}</p>` : ''}</div>`;

/* Ligne d'informations : des elements separes par un trait fin (pas de points medians). Les parties vides sont ignorees. */
export const meta = (...parts) => `<p class="meta">${parts.filter((x) => x !== '' && x != null && x !== false).map((x) => `<span>${x}</span>`).join('')}</p>`;

export const carte = (titre, corps, { classe = '', aide = '' } = {}) => `<section class="card ${classe}">${titre ? `<h2>${titre}${aide ? `<span class="sub">${aide}</span>` : ''}</h2>` : ''}${corps}</section>`;

export function champ({ id, label, type = 'text', valeur = '', attrs = '', aide = '', suffixe = '' }) {
  const mode = type === 'number' ? 'inputmode="decimal"' : '';
  const t = type === 'number' ? 'text' : type;
  return `<div class="field"><label for="${id}">${label}</label><div class="inp"><input id="${id}" type="${t}" ${mode} value="${esc(valeur ?? '')}" ${attrs}>${suffixe ? `<span class="suf">${suffixe}</span>` : ''}</div>${aide ? `<p class="hint">${aide}</p>` : ''}</div>`;
}

export function choix({ id, label, options, valeur }) {
  return `<div class="field"><label for="${id}">${label}</label><div class="inp"><select id="${id}">${options.map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(valeur) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div></div>`;
}

export function segments(id, options, valeur) {
  return `<div class="seg" id="${id}" role="tablist">${options.map(([v, l]) => `<button type="button" role="tab" data-v="${esc(v)}" aria-selected="${String(v) === String(valeur)}">${esc(l)}</button>`).join('')}</div>`;
}

/* Branche un groupe de segments : appelle onChange(valeur) et met a jour l'etat visuel. */
export function brancherSegments(root, id, onChange) {
  const el = root.querySelector('#' + id);
  if (!el) return;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    onChange(b.dataset.v);
  });
}

/* Lit un champ numerique par id (virgule ou point, espaces autorises). */
export function lire(root, id) {
  const el = root.querySelector('#' + id);
  return el ? el.value : '';
}

/* ---------- Message temporaire ---------- */
let toastTimer = null;
export function toast(texte) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.textContent = texte;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

export async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    toast('Copié');
  } catch {
    toast('Copie impossible : sélectionnez le texte à la main');
  }
}

export function telecharger(nom, contenu, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---------- Selecteur de commune (nom ou code postal) ---------- */
export function selecteurHTML(id, valeur = '', label = 'Ville ou code postal') {
  return `<div class="picker" id="${id}"><label for="${id}-q">${label}</label><div class="inp">${icon('search')}<input id="${id}-q" type="search" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Nancy, 54000, Lyon 3e..." value="${esc(valeur)}" role="combobox" aria-expanded="false" aria-controls="${id}-l"></div><ul class="sugg" id="${id}-l" role="listbox" hidden></ul></div>`;
}

export function brancherSelecteur(root, id, onPick) {
  const box = root.querySelector('#' + id);
  if (!box) return;
  const inp = box.querySelector('input');
  const ul = box.querySelector('ul');
  let res = [];
  let timer = null;
  let seq = 0;
  const fermer = () => { ul.hidden = true; inp.setAttribute('aria-expanded', 'false'); };
  const lancer = async () => {
    const q = inp.value;
    const mon = ++seq;
    let r;
    try { r = await chercher(q, 8); } catch { ul.innerHTML = '<li class="empty">Index des communes indisponible. Vérifiez la connexion.</li>'; ul.hidden = false; return; }
    if (mon !== seq) return;
    res = r;
    if (!r.length) { ul.innerHTML = q.trim().length >= 2 ? '<li class="empty">Aucune commune trouvée</li>' : ''; ul.hidden = q.trim().length < 2; return; }
    ul.innerHTML = r.map((c, i) => `<li role="option"><button type="button" data-i="${i}"><span>${esc(c.nom)}</span><small>${esc(c.cps.slice(0, 3).join(', '))}${c.cps.length > 3 ? '...' : ''}, ${esc(c.dep)}</small></button></li>`).join('');
    ul.hidden = false;
    inp.setAttribute('aria-expanded', 'true');
  };
  inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(lancer, 120); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (res[0] && !ul.hidden) choisir(0); else lancer(); }
    if (e.key === 'Escape') fermer();
  });
  const choisir = (i) => {
    const c = { ...res[i] };
    const typed = inp.value.replace(/\s/g, '');
    c.cp = /^\d{5}$/.test(typed) && c.cps.includes(typed) ? typed : null;
    fermer();
    inp.value = c.nom;
    onPick(c);
  };
  ul.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (b) choisir(Number(b.dataset.i));
  });
  const dehors = (e) => {
    if (!box.isConnected) { document.removeEventListener('click', dehors); return; }
    if (!box.contains(e.target)) fermer();
  };
  document.addEventListener('click', dehors);
}

/* ---------- Communes recentes ---------- */
export const recents = {
  list: () => store.get('recents', []),
  add(c) {
    const l = recents.list().filter((x) => x.insee !== c.insee);
    l.unshift({ insee: c.insee, nom: c.nom, dep: c.dep, cps: c.cps, lat: c.lat, lon: c.lon, pop: c.pop, type: c.type });
    store.set('recents', l.slice(0, 6));
  },
};

export const variationTexte = (v) => (v == null ? '--' : `${v > 0 ? '+' : ''}${num(v, 1)} %`);

/* Bascule entre l'analyse d'une annonce et l'import de plusieurs annonces (liens, pas de boutons : l'adresse change). */
export const basculeAnalyse = (actif) => `<div class="seg nav" role="tablist"><a href="#analyser" role="tab" aria-selected="${actif === 'une'}">Une annonce</a><a href="#importer" role="tab" aria-selected="${actif === 'plusieurs'}">Plusieurs</a><a href="#estimer" role="tab" aria-selected="${actif === 'estimer'}">Estimer un bien</a></div>`;

/* Message avec une action (annuler une suppression, par exemple). */
let toastActionTimer = null;
export function toastAction(texte, libelle, action, duree = 8000) {
  let t = document.getElementById('toast-action');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast-action';
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
  }
  t.innerHTML = '<span></span><button type="button"></button>';
  t.firstChild.textContent = texte;
  const b = t.querySelector('button');
  b.textContent = libelle;
  b.onclick = () => { clearTimeout(toastActionTimer); t.classList.remove('show'); action(); };
  t.classList.add('show');
  clearTimeout(toastActionTimer);
  toastActionTimer = setTimeout(() => t.classList.remove('show'), duree);
}

/* ---------- Choix de la veille ---------- */
const nbAnn = (id) => veilles.compter(id).annonces;

export function optionsVeilles(valeur, { toutes = false, nouvelle = true, vide = '' } = {}) {
  return `${vide ? `<option value="">${esc(vide)}</option>` : ''}${toutes ? `<option value="toutes"${valeur === 'toutes' ? ' selected' : ''}>Toutes les annonces</option>` : ''}${veilles.list().map((v) => `<option value="${esc(v.id)}"${v.id === valeur ? ' selected' : ''}>${esc(v.nom)} (${nbAnn(v.id)})</option>`).join('')}${nouvelle ? '<option value="__nouvelle">Nouvelle veille...</option>' : ''}`;
}

export function veilleSelectHTML(id, valeur, { label = 'Veille', toutes = false } = {}) {
  return `<div class="field"><label for="${id}">${label}</label><div class="inp"><select id="${id}" data-prev="${esc(valeur)}">${optionsVeilles(valeur, { toutes })}</select></div></div>`;
}

/* Demande le nom d'une nouvelle veille ; retourne la veille creee ou null. */
export function creerVeille(nomParDefaut = '') {
  const nom = window.prompt('Nom de la nouvelle veille (par exemple une ville ou un projet)', nomParDefaut);
  if (nom == null || !nom.trim()) return null;
  return veilles.add(nom);
}

/* Branche un selecteur de veille : onChange(idVeille) ; "Nouvelle veille..." cree la veille puis la selectionne. */
export function brancherVeilleSelect(select, onChange, nomParDefaut = '') {
  if (!select) return;
  select.addEventListener('change', () => {
    if (select.value !== '__nouvelle') { select.dataset.prev = select.value; onChange(select.value); return; }
    const v = creerVeille(typeof nomParDefaut === 'function' ? nomParDefaut() : nomParDefaut);
    if (!v) { select.value = select.dataset.prev; return; }
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `${v.nom} (0)`;
    select.insertBefore(opt, select.querySelector('option[value="__nouvelle"]'));
    select.value = v.id;
    select.dataset.prev = v.id;
    onChange(v.id);
  });
}
