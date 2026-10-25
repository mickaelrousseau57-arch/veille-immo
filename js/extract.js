/* Extraction des annonces affichees dans une page de resultats (Leboncoin, SeLoger, Bien'ici, PAP...).
   La fonction est AUTONOME (aucune dependance externe) : son code est copie tel quel dans un marque-page
   a executer sur la page de resultats ouverte par l'utilisateur dans son navigateur.
   Elle ne depend d'aucune structure propre a un site : elle cherche, pour chaque lien, le plus petit bloc qui
   contient a la fois un prix et une surface. Rien n'est envoye : le resultat est copie dans le presse-papiers. */

export function extraireAnnonces(doc) {
  const PRIX = /\d[\d\s  .]*\s?€/g;
  const SURF = /\d+(?:[.,]\d+)?\s?(?:m\s?[²2]|m[èe]tres?\s+carr)/i;
  const cartes = new Map();
  const liens = Array.from(doc.querySelectorAll('a[href]'));
  for (const a of liens) {
    const href = a.href;
    if (!/^https?:/.test(href) || href.split('#')[0] === doc.location.href.split('#')[0]) continue;
    let el = a;
    let carte = null;
    for (let i = 0; el && el !== doc.body && i < 7; i++, el = el.parentElement) {
      const t = el.innerText || '';
      if (t.length > 1000) break;
      if (t.indexOf('€') >= 0 && SURF.test(t)) { carte = el; break; }
    }
    if (!carte) continue;
    const texte = carte.innerText.replace(/[ \t  ]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
    // Un bloc qui contient plusieurs annonces (plusieurs prix tres differents et plusieurs liens distincts) est ignore.
    const prix = (texte.match(PRIX) || []).map((x) => Number(x.replace(/[^\d]/g, ''))).filter((v) => v >= 100);
    const distincts = Array.from(new Set(prix));
    if (!distincts.length || distincts.length > 3) continue;
    if (!cartes.has(carte)) cartes.set(carte, { url: href, text: texte.slice(0, 800) });
  }
  const vus = new Set();
  const out = [];
  cartes.forEach((v) => {
    if (vus.has(v.url)) return;
    vus.add(v.url);
    out.push(v);
  });
  if (out.length >= 2) return out.slice(0, 300);
  // Une seule annonce (ou page de detail) : titre, description, donnees structurees de la page et debut du texte.
  const meta = (n) => {
    const e = doc.querySelector('meta[property="' + n + '"],meta[name="' + n + '"]');
    return e && e.content ? e.content : '';
  };
  let ld = '';
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((s) => { ld += ' ' + s.textContent; });
  const g = (re) => { const m = re.exec(ld); return m ? m[1] : ''; };
  const prixLd = Math.round(Number(g(/"price"\s*:\s*"?(\d[\d.]*)/)));
  const lignes = [meta('og:title') || doc.title, meta('og:description') || meta('description')];
  if (prixLd >= 100) lignes.push(prixLd + ' €');
  if (g(/"floorSize"[^}]*?"value"\s*:\s*"?(\d+(?:[.,]\d+)?)/)) lignes.push(g(/"floorSize"[^}]*?"value"\s*:\s*"?(\d+(?:[.,]\d+)?)/) + ' m²');
  if (g(/"numberOfRooms"\s*:\s*"?(\d+)/)) lignes.push(g(/"numberOfRooms"\s*:\s*"?(\d+)/) + ' pièces');
  if (g(/"postalCode"\s*:\s*"?(\d{5})/)) lignes.push(g(/"postalCode"\s*:\s*"?(\d{5})/));
  if (g(/"numberOfBedrooms"\s*:\s*"?(\d+)/)) lignes.push(g(/"numberOfBedrooms"\s*:\s*"?(\d+)/) + ' chambres');
  if (g(/"yearBuilt"\s*:\s*"?(\d{4})/)) lignes.push('construit en ' + g(/"yearBuilt"\s*:\s*"?(\d{4})/));
  // Texte principal de la page (les caracteristiques sont souvent en bas), coupe avant les annonces similaires.
  let corps = ((doc.querySelector('main') || doc.body || {}).innerText || '').replace(/[ \t\u00a0\u202f]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  const coupe = corps.slice(300).search(/annonces?\s+similaires|biens?\s+similaires|vous\s+aimerez\s+aussi|autres\s+annonces|ces\s+annonces\s+peuvent/i);
  if (coupe >= 0) corps = corps.slice(0, 300 + coupe);
  lignes.push(corps.slice(0, 6000));
  const texte = lignes.filter(Boolean).join('\n').slice(0, 8000);
  return /€/.test(texte) || SURF.test(texte) ? [{ url: doc.location.href, text: texte }] : [];
}

/* Cumul d'une page de resultats a l'autre. Fonction AUTONOME, copiee dans le marque-page.
   `ancien` est le cumul memorise dans l'onglet (sessionStorage du site, donc propre a cet onglet et efface a sa fermeture) :
   { t: heure, items: [...] }. Il est ignore au bout de 30 minutes. Une annonce deja vue (meme lien) est mise a jour, pas doublee. */
export function cumuler(ancien, items, maintenant) {
  const MAX = 600;
  const frais = ancien && ancien.items && maintenant - ancien.t < 30 * 60 * 1000 ? ancien.items : [];
  const index = new Map();
  frais.forEach((x) => index.set(x.url, x));
  let nouvelles = 0;
  items.forEach((x) => { if (!index.has(x.url)) nouvelles++; index.set(x.url, x); });
  const tous = Array.from(index.values()).slice(-MAX);
  return { items: tous, nouvelles, dejaVues: items.length - nouvelles, avant: frais.length };
}

/* Code du marque-page : a glisser dans la barre de favoris, ou a coller comme adresse d'un favori.
   Sur une page de resultats, chaque clic ajoute les annonces affichees a celles deja captees dans cet onglet
   (page suivante, puis nouveau clic) et copie le tout. Sur une annonce seule, rien n'est cumule. */
export function codeMarquePage() {
  const code = `(async()=>{var r=(${extraireAnnonces.toString()})(document);`
    + `if(!r.length){alert('Aucune annonce reconnue sur cette page. Faites defiler la page pour afficher les annonces, puis recommencez.');return}`
    + `var items=r,msg='',K='immoveille.cumul';`
    + `if(r.length>1){var prev=null;try{prev=JSON.parse(sessionStorage.getItem(K)||'null')}catch(e){}`
    + `var c=(${cumuler.toString()})(prev,r,Date.now());items=c.items;`
    + `try{sessionStorage.setItem(K,JSON.stringify({t:Date.now(),items:items}))}catch(e){}`
    + `msg=c.nouvelles+' nouvelles annonces ajoutees ('+c.dejaVues+' deja captees). Total : '+items.length+'. Passez a la page suivante puis recliquez, ou ouvrez Veille immo.'}`
    + `else msg='1 annonce copiee. Ouvrez Veille immo : elle se remplit toute seule.';`
    + `var j='IMMOVEILLE:'+JSON.stringify({v:1,page:location.href,items:items});`
    + `try{await navigator.clipboard.writeText(j);alert(msg+(r.length>1?' (Le cumul est efface apres 30 minutes.)':''))}`
    + `catch(e){prompt('Copiez ce texte (Ctrl+C), puis collez-le dans Veille immo :',j)}})()`;
  return 'javascript:' + encodeURIComponent(code);
}
