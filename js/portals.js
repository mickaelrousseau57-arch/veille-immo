/* Liens vers les sites d'annonces. Aucun site n'est interroge par l'application : ces liens ouvrent la recherche
   du site dans un nouvel onglet. Seuls Bien'ici et Leboncoin acceptent une recherche prereglee par adresse ;
   pour les autres, on ouvre l'accueil et l'application fournit les criteres a recopier. */

import { norm } from './util.js';

const slug = (s) => norm(s).replace(/ /g, '-');

export const PORTAILS = [
  { id: 'leboncoin', nom: 'Leboncoin', accueil: 'https://www.leboncoin.fr/' },
  { id: 'bienici', nom: "Bien'ici", accueil: 'https://www.bienici.com/' },
  { id: 'seloger', nom: 'SeLoger', accueil: 'https://www.seloger.com/' },
  { id: 'logicimmo', nom: 'Logic-Immo', accueil: 'https://www.logic-immo.com/' },
  { id: 'pap', nom: 'PAP (particuliers)', accueil: 'https://www.pap.fr/' },
  { id: 'ouestfrance', nom: 'Ouest-France Immo', accueil: 'https://www.ouestfrance-immo.com/' },
  { id: 'figaro', nom: 'Figaro Immobilier', accueil: 'https://immobilier.lefigaro.fr/' },
  { id: 'notaires', nom: 'Notaires de France', accueil: 'https://www.immobilier.notaires.fr/' },
  { id: 'orpi', nom: 'Orpi', accueil: 'https://www.orpi.com/' },
  { id: 'paruvendu', nom: 'ParuVendu', accueil: 'https://www.paruvendu.fr/' },
  { id: 'avendrealouer', nom: 'AVendreALouer', accueil: 'https://www.avendrealouer.fr/' },
];

/* commune : { nom, cps, lat, lon } ; mode : 'achat' | 'location'. Retourne [{ id, nom, url, direct }]. */
export function liensRecherche(commune, mode = 'achat') {
  const cp = (commune.cps && commune.cps[0]) || '';
  return PORTAILS.map((p) => {
    let url = p.accueil;
    let direct = false;
    if (p.id === 'bienici' && cp) {
      url = `https://www.bienici.com/recherche/${mode === 'location' ? 'location' : 'achat'}/${slug(commune.nom)}-${cp}`;
      direct = true;
    } else if (p.id === 'leboncoin' && cp && commune.lat != null) {
      const loc = `${commune.nom}_${cp}__${commune.lat}_${commune.lon}_5000_5000`;
      url = `https://www.leboncoin.fr/recherche?category=${mode === 'location' ? 10 : 9}&locations=${encodeURIComponent(loc)}`;
      direct = true;
    }
    return { id: p.id, nom: p.nom, url, direct };
  });
}

/* Texte des criteres a recopier sur un site qui n'accepte pas de recherche prereglee. */
export function criteres({ commune, mode, type, budgetMax, surfaceMin, pieces }) {
  const l = [`${mode === 'location' ? 'Location' : 'Achat'} : ${type || 'appartement ou maison'}`, `Lieu : ${commune.nom}${commune.cps && commune.cps.length ? ' (' + commune.cps.join(', ') + ')' : ''}`];
  if (budgetMax) l.push(`${mode === 'location' ? 'Loyer' : 'Budget'} max : ${budgetMax} €`);
  if (surfaceMin) l.push(`Surface min : ${surfaceMin} m²`);
  if (pieces) l.push(`Pièces : ${pieces}`);
  return l.join('\n');
}
