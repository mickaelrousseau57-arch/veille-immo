# Veille immo

Application web installable sur smartphone (PWA), sans compte ni clé d'accès. Elle aide à repérer une bonne affaire immobilière en comparant une annonce aux prix réels du secteur, et à simuler un crédit.

## Ce qu'elle fait
- **Marché** : par ville ou code postal (arrondissements de Paris, Lyon, Marseille inclus), prix médian au m² des appartements et des maisons d'après les ventes réelles, fourchette courante, évolution sur 1 et 3 ans, prix selon le nombre de pièces, loyers au m², rendement brut estimé, dernières ventes (liste et carte), liens vers les sites d'annonces.
- **Plusieurs annonces** (écran Analyser, onglet « Plusieurs annonces ») : fonction centrale. On colle le contenu d'une page de résultats d'un site (via un marque-page qui lit la page affichée dans le navigateur, ou par simple copier-coller). L'application en tire les annonces, fusionne les doublons publiés sur plusieurs sites, les compare aux prix réels et les classe de la meilleure affaire à la plus chère. On répète l'opération site par site : les annonces s'additionnent dans « Ma veille ». Une annonce déjà suivie est reconnue et reçoit seulement ses nouvelles sources.
- **Remplissage automatique** : le marque-page fonctionne aussi sur la page d'une seule annonce (il lit le titre, la description, les données structurées et le début du texte). Au retour dans l'application, le contenu copié est lu tout seul (avec l'autorisation de lire le presse-papiers, demandée une fois) : une annonce seule remplit l'écran Analyser et lance l'analyse, une page de résultats ouvre « Plusieurs annonces ». Le partage d'un lien depuis un site ne transmet que l'adresse et le titre : l'application en tire le code postal, le type et les pièces quand ils figurent dans le lien, mais ne peut pas ouvrir la page de l'annonce elle-même.
- **Analyser** : on colle le texte d'une annonce (ou son lien), l'application lit prix, surface, pièces, DPE et code postal, puis donne un score sur 100, l'écart au marché, le prix attendu pour cette surface, une offre à viser, le rendement brut estimé et les ventes comparables. Pour une location, elle compare le loyer au loyer du secteur.
- **Ma veille** : annonces suivies avec leur statut (à voir, contacté, visité, offre, écarté), notes, historique des prix et baisses, rappel au bout de 7 jours, recherches enregistrées avec les liens vers tous les sites, export JSON et CSV.
- **Crédit** : mensualité, coût du crédit, frais de notaire, taux d'endettement, comparaison 10 à 25 ans, tableau d'amortissement, capacité d'emprunt et surface achetable dans la commune consultée.
- **Plus** : comparateur de 4 villes, calculateur d'investissement locatif (rendement net, trésorerie), checklist de visite, sauvegarde et restauration.
- Sur Android (Chrome, application installée), le menu Partager d'une annonce peut ouvrir directement l'écran Analyser.

## Limites à connaître
- **L'application ne collecte pas les sites à votre place.** Leboncoin, SeLoger et les autres interdisent la collecte automatique dans leurs conditions d'utilisation et la bloquent techniquement ; aucun contournement n'est prévu. Le marque-page fonctionne dans votre navigateur, sur la page que vous avez ouverte vous-même, et copie ce qui est affiché dans votre presse-papiers. Il se base sur la présence d'un prix et d'une surface, pas sur la structure propre à un site : il a été testé sur des pages types, mais pas sur les sites réels (bloqués depuis l'environnement de développement). Si un site n'est pas reconnu, le copier-coller de la page sert de solution de repli.
- Il faut faire défiler la page de résultats pour que toutes les annonces s'affichent avant d'utiliser le marque-page, et recommencer pour chaque page de résultats.
- **Pas de taux par code postal.** Aucun organisme ne publie de taux de crédit à cette échelle. L'application utilise les taux moyens par durée (Observatoire Crédit Logement / CSA) et un champ « écart » pour reproduire l'offre de votre banque ou courtier. Les taux sont dans `data/taux.json`, à mettre à jour à la main.
- **Alsace-Moselle (57, 67, 68) et Mayotte** : aucune base publique de ventes réelles n'existe (les actes sont au Livre foncier, non ouvert, et absents de DVF). L'application utilise à la place, dans cet ordre : un prix de référence saisi par vous, les prix médians publiés par les notaires (dossier de presse de mars 2025, ventes 2024, une vingtaine de communes dont Metz et ses quartiers, Thionville, Yutz, Forbach, Strasbourg, Mulhouse, Colmar ; `data/refs-notaires.json`), puis la médiane des annonces que vous importez (au moins 8 annonces d'un même type dans la commune). Pour une commune non détaillée, elle indique la commune de référence la plus proche (30 km au plus). Les prix d'annonces sont des prix demandés, en général supérieurs aux prix de vente. Les chiffres des notaires ont été relevés dans les graphiques du PDF : à vérifier à la source pour une décision importante. Les loyers sont disponibles partout.
- Les prix médians viennent de ventes passées (jusqu'à fin de la dernière année publiée) : ils ne tiennent pas compte de l'état du bien, de l'étage, de la vue ni des travaux. Le score est un repère, pas une expertise.
- Les loyers sont des loyers d'annonce estimés par commune, charges comprises. Dans les villes à encadrement des loyers, le plafond légal peut être plus bas.

## Sources de données
- Ventes : Demandes de valeurs foncières géolocalisées (DGFiP, Etalab), `files.data.gouv.fr/geo-dvf`.
- Loyers : « Carte des loyers 2025 », Ministère de la Transition écologique, data.gouv.fr.
- Communes, codes postaux, population : `geo.api.gouv.fr`.
- Taux : Observatoire Crédit Logement / CSA.
- Fond de carte : OpenStreetMap (Leaflet, licence BSD-2, inclus dans `vendor/leaflet`).

## Mise en ligne (GitHub Pages)
Publier ce dossier à la racine d'un dépôt public, puis Settings, Pages, branche `main`, dossier racine. La géolocalisation n'est pas utilisée, mais l'installation sur téléphone et le mode hors ligne exigent `https`.

Aucune donnée personnelle n'est publiée : les annonces, notes et réglages restent dans le navigateur de chaque utilisateur.

## Mise à jour des données
`pipeline/build_data.py` télécharge les sources et écrit `data/`. Le workflow `.github/workflows/donnees.yml` le lance chaque mois (les ventes sont republiées deux fois par an) et publie les changements. En local : `python3 pipeline/build_data.py --cache /tmp/dvf` (Python 3.9 ou plus récent, aucune installation).

## Test sur ordinateur
`python3 -m http.server 8765` puis `http://localhost:8765`. Tests : `npm test` (Node 20 ou plus récent) et `python3 -m unittest discover -s pipeline`.

## Organisation du code
- `index.html`, `style.css`, `js/main.js` : page, navigation, thème.
- `js/views/` : un fichier par écran. `js/analysis.js`, `js/credit.js`, `js/parse.js`, `js/search.js`, `js/portals.js` : calculs sans interface, testés dans `tests/`.
- `js/multi.js`, `js/extract.js`, `js/presse.js` : lecture de plusieurs annonces, fusion des doublons, marque-page, lecture du presse-papiers.
- `js/data.js`, `js/state.js` : accès aux données et stockage local. `js/charts.js`, `js/map.js`, `js/ui.js`, `js/icons.js` : affichage.
- `data/` : fichiers générés (`prix/<dep>.json`, `ventes/<dep>.json`, `communes.json`, `taux.json`, `meta.json`).
- `sw.js`, `manifest.webmanifest` : installation et mode hors ligne.
