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
  return out.slice(0, 300);
}

/* Code du marque-page : a glisser dans la barre de favoris, ou a coller comme adresse d'un favori. */
export function codeMarquePage() {
  const code = `(async()=>{var r=(${extraireAnnonces.toString()})(document);`
    + `var j='IMMOVEILLE:'+JSON.stringify({v:1,page:location.href,items:r});`
    + `if(!r.length){alert('Aucune annonce reconnue sur cette page. Faites defiler la page pour afficher les annonces, puis recommencez.');return}`
    + `try{await navigator.clipboard.writeText(j);alert(r.length+' annonces copiees. Ouvrez Veille immo, ecran Plusieurs annonces, puis collez.')}`
    + `catch(e){prompt('Copiez ce texte (Ctrl+C), puis collez-le dans Veille immo :',j)}})()`;
  return 'javascript:' + encodeURIComponent(code);
}
