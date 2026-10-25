/* Alertes e-mail : les sites envoient deja des e-mails d'alerte. Ce module prepare la consigne a donner a un assistant
   (tache planifiee de Claude) qui lit ces e-mails, fusionne les doublons, compare aux prix reels et prepare un resume.
   Le resume contient un bloc "IMMOVEILLE:" a coller dans l'ecran "Plusieurs annonces". Fonctions pures, sans DOM. */

import { PREFIXE } from './multi.js';

export const EXEMPLE_BLOC = PREFIXE + JSON.stringify({
  v: 1,
  page: '',
  items: [
    { url: 'https://exemple.fr/annonce/1', text: 'Appartement 3 pièces\n64 m² · 3 pièces\nNancy 54000\n139 000 €' },
    { url: 'https://exemple.fr/annonce/2', text: 'Maison avec jardin\n110 m² · 5 pièces\nLaxou 54520\n285 000 €' },
  ],
});

const MODES = { achat: 'achat', location: 'location' };

/* recherches : [{ nom, cps, insee, dep, mode, type }] ; base : adresse publique de l'application (se termine par "/"). */
export function consigneAlerte({ base, recherches, portails = [], heure = 8, budgetMax = null, surfaceMin = null }) {
  const lignes = recherches.map((r) => `- ${r.nom} (code postal ${(r.cps || []).join(', ') || 'à préciser'}, INSEE ${r.insee}, département ${r.dep}) : ${MODES[r.mode] === 'location' ? 'location' : 'achat'}${r.type ? ', ' + String(r.type).toLowerCase() : ', appartement ou maison'}`);
  const criteres = [budgetMax ? `budget ou loyer maximum ${budgetMax} €` : null, surfaceMin ? `surface minimale ${surfaceMin} m²` : null].filter(Boolean);
  return `Tu es mon assistant de veille immobilière. Tous les jours à ${heure} h, fais ceci.

1. Lis dans ma boîte Gmail les e-mails d'alerte immobilière reçus depuis la dernière exécution (ou depuis 24 h la première fois)${portails.length ? ` des sites suivants : ${portails.join(', ')}` : ''}. Cherche par nom de site et par mots comme "alerte", "nouvelles annonces", "annonce". Mode lecture seule : ne supprime, n'archive et ne modifie aucun e-mail, ne réponds à aucun e-mail.

2. Extrais chaque annonce : type de bien, prix, surface, nombre de pièces, commune et code postal, DPE si indiqué, lien, site d'origine. Ignore une annonce sans prix ou sans surface (mentionne-les à part). Garde uniquement les communes de mes recherches :
${lignes.join('\n') || '- (aucune recherche enregistrée : utilise toutes les annonces reçues)'}${criteres.length ? `\nCritères communs : ${criteres.join(', ')}.` : ''}

3. Fusionne les doublons publiés sur plusieurs sites : même type, même code postal, surface à 3 % près, prix à 3 % près, même nombre de pièces. Garde le prix le plus bas et liste tous les liens.

4. Compare chaque annonce de vente au marché réel. Les données sont publiques : ${base}data/prix/<département>.json (par exemple ${base}data/prix/54.json). Dans ce fichier, "c" contient une fiche par code INSEE de commune et "p" une fiche par code postal. Dans une fiche, "a" = appartements, "h" = maisons, chacun avec "q" = [p10, p25, médiane, p75, p90] en euros par m² sur 12 mois si "n" vaut au moins 30, sinon "q3" sur 36 mois. Écart au marché = (prix au m² de l'annonce ÷ médiane) moins 1. Pour une location, compare le loyer au m² à "l" (loyer d'annonce de la commune : "a" appartement, "h" maison, valeur [loyer, bas, haut] en euros par m² et par mois). Si le fichier d'un département est introuvable, indique-le et ne compare pas.

5. Prépare un brouillon Gmail pour moi (ne l'envoie jamais) avec :
   - un classement des annonces de la plus avantageuse (écart le plus négatif) à la plus chère : titre, commune, prix, surface, prix au m², écart au marché en %, DPE, liens ;
   - en dernière ligne, un bloc de collage pour mon application, sur UNE seule ligne, exactement de ce format (une entrée par annonce ; le texte de chaque entrée contient titre, surface, pièces, commune avec code postal et prix, séparés par des retours à la ligne écrits \\n) :
${EXEMPLE_BLOC}

Si aucune nouvelle annonce n'est trouvée, ne crée aucun brouillon. Ne partage mes e-mails nulle part et ne fais aucune autre action.`;
}
