#!/usr/bin/env python3
"""Construit le dossier data/ a partir de sources ouvertes (aucune cle, aucune donnee personnelle).

Sources :
- DVF geolocalise (Etalab / DGFiP) : ventes reelles, 5 dernieres annees. files.data.gouv.fr/geo-dvf
- "Carte des loyers" (Ministere de la Transition ecologique) : loyers d'annonce par commune. data.gouv.fr
- geo.api.gouv.fr : communes, codes postaux, centres, population.

Alsace-Moselle (57, 67, 68) et Mayotte (976) ne figurent pas dans DVF : leurs communes n'ont que les loyers.

Sorties :
- data/meta.json            dates, annees, departements sans DVF
- data/communes.json        index de recherche : [insee, nom, dep, "cp cp", lat, lon, population, type]
- data/prix/<dep>.json      {"c": {insee: fiche}, "p": {code_postal: fiche}}
- data/ventes/<dep>.json    ventes recentes {insee: [[date, prix, surface, pieces, type, lat, lon, adresse, cp], ...]}

Fiche : {"a": appartements, "h": maisons, "l": loyers}. Pour a et h :
  n, q (p10 p25 p50 p75 p90 en euros/m2) sur 12 mois ; n3, q3 sur 36 mois ;
  y = {annee: [mediane, n]} ; r = {pieces: [mediane, n]} sur 36 mois (appartements) ; s = surface mediane (36 mois).
Loyers l : {"a": [loyer, bas, haut], "p": 1-2 pieces, "g": 3 pieces et plus, "h": maison, "n": nb d'annonces}, en euros/m2/mois charges comprises.

Usage : python3 pipeline/build_data.py [--deps 54,75] [--years 5] [--cache DIR] [--skip-ventes]
Python 3.9+, bibliotheque standard uniquement.
"""
import argparse
import csv
import datetime as dt
import gzip
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
DVF_URL = 'https://files.data.gouv.fr/geo-dvf/latest/csv/{year}/departements/{dep}.csv.gz'
LOYERS_BASE = 'https://static.data.gouv.fr/resources/carte-des-loyers-indicateurs-de-loyers-dannonce-par-commune-en-2025/'
LOYERS_FILES = {
    'a': '20251211-145010/pred-app-mef-dhup.csv',
    'p': '20251211-144934/pred-app12-mef-dhup.csv',
    'g': '20251211-144951/pred-app3-mef-dhup.csv',
    'h': '20251211-145039/pred-mai-mef-dhup.csv',
}
LOYERS_YEAR = 2025
GEO = 'https://geo.api.gouv.fr/communes?fields=nom,code,codesPostaux,centre,population,codeDepartement&format=json&geometry=centre'
NO_DVF = ['57', '67', '68', '976']

# Villes decoupees en arrondissements : DVF utilise le code de l'arrondissement, on agrege aussi sur la ville.
PARENTS = {'75056': range(75101, 75121), '69123': range(69381, 69390), '13055': range(13201, 13217)}
PARENT_OF = {str(c): p for p, rng in PARENTS.items() for c in rng}

# Bornes de coherence (surface en m2, prix au m2 en euros). Hors bornes = erreur de saisie ou bien atypique.
BOUNDS = {'Appartement': (8, 300, 400, 40000), 'Maison': (20, 600, 300, 20000)}
MAX_PRICE = 15_000_000
MIN_PRICE = 10_000
MAX_TERRAIN_HOUSE = 10_000
SALES_MONTHS = 12
SALES_CAP = 40  # ventes conservees par commune pour la liste de comparables


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def fetch(url, tries=6, timeout=120):
    """Telechargement avec reprises (le reseau de certains environnements coupe parfois la connexion)."""
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'immo-veille-pipeline'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            last = e
        except Exception as e:  # noqa: BLE001 - toute erreur reseau donne lieu a une nouvelle tentative
            last = e
        time.sleep(2 + 3 * i)
    raise RuntimeError(f'echec du telechargement {url}: {last}')


def fetch_cached(url, cache, name):
    path = os.path.join(cache, name) if cache else None
    if path and os.path.exists(path):
        with open(path, 'rb') as f:
            return f.read()
    raw = fetch(url)
    if raw is not None and path:
        os.makedirs(cache, exist_ok=True)
        with open(path, 'wb') as f:
            f.write(raw)
    return raw


# ---------------------------------------------------------------- statistiques

def pct(vals, p):
    """Percentile par interpolation lineaire sur une liste TRIEE."""
    n = len(vals)
    if n == 1:
        return vals[0]
    k = (n - 1) * p
    f = int(k)
    c = min(f + 1, n - 1)
    return vals[f] + (vals[c] - vals[f]) * (k - f)


def quantiles(vals):
    s = sorted(vals)
    return [round(pct(s, p)) for p in (0.10, 0.25, 0.50, 0.75, 0.90)]


def median(vals):
    return round(pct(sorted(vals), 0.5))


def bloc(rows, ref):
    """rows : liste de (date, prix_m2, pieces, surface). Retourne la fiche d'un type de bien ou None."""
    if not rows:
        return None
    d12 = (ref - dt.timedelta(days=365)).isoformat()
    d36 = (ref - dt.timedelta(days=3 * 365)).isoformat()
    r12 = [r for r in rows if r[0] > d12]
    r36 = [r for r in rows if r[0] > d36]
    out = {}
    if r12:
        out['n'] = len(r12)
        out['q'] = quantiles([r[1] for r in r12])
    if r36:
        out['n3'] = len(r36)
        out['q3'] = quantiles([r[1] for r in r36])
        out['s'] = median([r[3] for r in r36])
    years = defaultdict(list)
    for r in rows:
        years[r[0][:4]].append(r[1])
    y = {k: [median(v), len(v)] for k, v in sorted(years.items()) if len(v) >= 5}
    if y:
        out['y'] = y
    rooms = defaultdict(list)
    for r in r36:
        rooms[str(min(int(r[2] or 0), 5))].append(r[1])
    rr = {k: [median(v), len(v)] for k, v in sorted(rooms.items()) if k != '0' and len(v) >= 5}
    if rr:
        out['r'] = rr
    return out or None


# ---------------------------------------------------------------- lecture DVF

def f2(v):
    try:
        return float(v.replace(',', '.'))
    except (ValueError, AttributeError):
        return 0.0


def mutations(fileobj):
    """Lit un CSV geo-dvf et retourne les ventes d'un seul logement (appartement ou maison) exploitables.

    Une ligne du fichier = un local x une nature de culture : le meme logement apparait plusieurs fois.
    On ne garde que les mutations 'Vente' qui contiennent exactement UN logement distinct, sans local
    commercial, sur une seule disposition : le prix de la mutation est alors celui du logement.
    """
    groups = {}
    for row in csv.DictReader(io.TextIOWrapper(fileobj, encoding='utf-8', newline='')):
        if row['nature_mutation'] != 'Vente':
            continue
        g = groups.setdefault(row['id_mutation'], {'rows': [], 'locals': set(), 'disp': set(), 'bad': False})
        g['disp'].add(row['numero_disposition'])
        t = row['type_local']
        if t in BOUNDS:
            key = (row['id_parcelle'], t, row['surface_reelle_bati'], row['nombre_pieces_principales'],
                   row['lot1_numero'], row['lot2_numero'], row['lot3_numero'])
            g['locals'].add(key)
            g['rows'].append(row)
        elif t.startswith('Local industriel'):
            g['bad'] = True
    for g in groups.values():
        if g['bad'] or len(g['locals']) != 1 or len(g['disp']) != 1:
            continue
        first = g['rows'][0]
        t = first['type_local']
        price = f2(first['valeur_fonciere'])
        surf = f2(first['surface_reelle_bati'])
        smin, smax, pmin, pmax = BOUNDS[t]
        if not (MIN_PRICE <= price <= MAX_PRICE) or not (smin <= surf <= smax):
            continue
        ppm2 = price / surf
        if not (pmin <= ppm2 <= pmax):
            continue
        terrain = {(r['id_parcelle'], r['nature_culture']): f2(r['surface_terrain']) for r in g['rows']}
        terrain = sum(terrain.values())
        if t == 'Maison' and terrain > MAX_TERRAIN_HOUSE:
            continue
        try:
            lat, lon = round(float(first['latitude']), 4), round(float(first['longitude']), 4)
        except ValueError:
            lat = lon = None
        adr = ' '.join(x for x in (first['adresse_numero'], first['adresse_suffixe'], first['adresse_nom_voie'].title()) if x)
        yield {
            'date': first['date_mutation'], 'type': t, 'price': price, 'surf': surf, 'ppm2': ppm2,
            'rooms': int(first['nombre_pieces_principales'] or 0), 'insee': first['code_commune'],
            'cp': first['code_postal'], 'lat': lat, 'lon': lon, 'adr': adr, 'terrain': round(terrain),
        }


def dvf_for_dep(dep, years, cache):
    out = []
    for y in years:
        raw = fetch_cached(DVF_URL.format(year=y, dep=dep), cache, f'dvf_{y}_{dep}.csv.gz')
        if raw is None:
            continue
        with gzip.open(io.BytesIO(raw)) as f:
            out.extend(mutations(f))
    return out


def stats_for(items, ref):
    """items : ventes (dicts). Retourne la fiche {a, h}."""
    fiche = {}
    for key, t in (('a', 'Appartement'), ('h', 'Maison')):
        rows = [(i['date'], i['ppm2'], i['rooms'], i['surf']) for i in items if i['type'] == t]
        b = bloc(rows, ref)
        if b:
            fiche[key] = b
    return fiche


def build_dep(dep, years, ref, cache, rents, with_ventes):
    items = dvf_for_dep(dep, years, cache)
    by_c, by_p = defaultdict(list), defaultdict(list)
    for it in items:
        by_c[it['insee']].append(it)
        by_p[it['cp']].append(it)
        parent = PARENT_OF.get(it['insee'])
        if parent:
            by_c[parent].append(it)
    fiches = {}
    for insee, lst in by_c.items():
        f = stats_for(lst, ref)
        if f:
            fiches[insee] = f
    for insee, l in rents.items():
        if insee.startswith(dep) or (dep in ('2A', '2B') and insee[:2] == dep):
            fiches.setdefault(insee, {})['l'] = l
    pf = {}
    for cp, lst in by_p.items():
        f = stats_for(lst, ref)
        if f:
            pf[cp] = f
    ventes = {}
    if with_ventes:
        cut = (ref - dt.timedelta(days=30 * SALES_MONTHS)).isoformat()
        for insee, lst in by_c.items():
            if insee in PARENTS:
                continue
            recent = sorted((i for i in lst if i['date'] > cut and i['lat'] is not None), key=lambda i: i['date'], reverse=True)[:SALES_CAP]
            if recent:
                ventes[insee] = [[i['date'], round(i['price']), round(i['surf']), i['rooms'], 0 if i['type'] == 'Appartement' else 1,
                                  i['lat'], i['lon'], i['adr'], i['cp'], i['terrain']] for i in recent]
    return fiches, pf, ventes, len(items)


# ---------------------------------------------------------------- loyers et communes

def read_rents(cache):
    rents = {}
    for key, path in LOYERS_FILES.items():
        raw = fetch_cached(LOYERS_BASE + path, cache, f'loyers_{key}.csv')
        text = raw.decode('cp1252')
        for row in csv.DictReader(io.StringIO(text), delimiter=';'):
            insee = row['INSEE_C'].strip('"')
            try:
                val = [round(float(row['loypredm2'].replace(',', '.')), 1),
                       round(float(row['lwr.IPm2'].replace(',', '.')), 1),
                       round(float(row['upr.IPm2'].replace(',', '.')), 1)]
            except ValueError:
                continue
            e = rents.setdefault(insee, {})
            e[key] = val
            if key == 'a':
                e['n'] = int(row['nbobs_com'] or 0)
                e['t'] = 1 if row['TYPPRED'] == 'commune' else 0
    return rents


def add_parent_rents(rents, communes):
    """Loyer d'une ville a arrondissements = moyenne ponderee par la population des arrondissements."""
    pop = {c['code']: c.get('population') or 0 for c in communes}
    for parent, rng in PARENTS.items():
        kids = [str(c) for c in rng if str(c) in rents]
        if not kids:
            continue
        agg = {}
        for key in ('a', 'p', 'g', 'h'):
            tot = sum(pop.get(k, 0) for k in kids if key in rents[k])
            if not tot:
                continue
            agg[key] = [round(sum(rents[k][key][i] * pop.get(k, 0) for k in kids if key in rents[k]) / tot, 1) for i in range(3)]
        agg['n'] = sum(rents[k].get('n', 0) for k in kids)
        agg['t'] = 1
        rents[parent] = agg


def read_communes():
    raw = fetch(GEO)
    communes = json.loads(raw)
    arr = json.loads(fetch(GEO + '&type=arrondissement-municipal'))
    for c in arr:
        c['_arr'] = True
    return communes, arr


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


def latest_year(cache):
    y = dt.date.today().year
    while y > 2019:
        if fetch_cached(DVF_URL.format(year=y, dep='75'), cache, f'dvf_{y}_75.csv.gz') is not None:
            return y
        y -= 1
    raise RuntimeError('aucune annee DVF disponible')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--deps', help='liste de departements separes par des virgules (defaut : tous)')
    ap.add_argument('--years', type=int, default=5)
    ap.add_argument('--cache', default=None, help='dossier de cache des telechargements (non versionne)')
    ap.add_argument('--skip-ventes', action='store_true')
    args = ap.parse_args()

    log('communes...')
    communes, arr = read_communes()
    all_deps = sorted({c['codeDepartement'] for c in communes if c.get('codeDepartement')})
    deps = args.deps.split(',') if args.deps else all_deps

    last = latest_year(args.cache)
    years = list(range(last - args.years + 1, last + 1))
    log('annees DVF', years)

    # Date de reference : derniere vente connue de Paris (sert de fin de periode pour toutes les fenetres).
    with gzip.open(io.BytesIO(fetch_cached(DVF_URL.format(year=last, dep='75'), args.cache, f'dvf_{last}_75.csv.gz'))) as f:
        ref = max(dt.date.fromisoformat(r['date_mutation']) for r in csv.DictReader(io.TextIOWrapper(f, encoding='utf-8')))
    log('date de reference', ref)

    log('loyers...')
    rents = read_rents(args.cache)
    add_parent_rents(rents, communes + arr)

    total = 0
    for dep in deps:
        if dep in NO_DVF:
            fiches = {i: {'l': l} for i, l in rents.items() if i.startswith(dep)}
            write_json(os.path.join(DATA, 'prix', f'{dep}.json'), {'c': fiches, 'p': {}})
            log(dep, 'sans DVF, loyers seuls :', len(fiches), 'communes')
            continue
        fiches, pf, ventes, n = build_dep(dep, years, ref, args.cache, rents, not args.skip_ventes)
        write_json(os.path.join(DATA, 'prix', f'{dep}.json'), {'c': fiches, 'p': pf})
        if not args.skip_ventes:
            write_json(os.path.join(DATA, 'ventes', f'{dep}.json'), ventes)
        total += n
        log(dep, n, 'ventes retenues,', len(fiches), 'communes')

    # Index de recherche : villes a arrondissements = ville + chaque arrondissement.
    index = []
    for c in communes + arr:
        if not c.get('centre'):
            continue
        lon, lat = c['centre']['coordinates']
        index.append([c['code'], c['nom'], c['codeDepartement'], ' '.join(c.get('codesPostaux') or []), round(lat, 4), round(lon, 4),
                      c.get('population') or 0, 2 if c.get('_arr') else (1 if c['code'] in PARENTS else 0)])
    index.sort(key=lambda r: r[0])
    write_json(os.path.join(DATA, 'communes.json'), index)
    write_json(os.path.join(DATA, 'meta.json'), {
        'generated': dt.date.today().isoformat(), 'dvfYears': years, 'dvfRef': ref.isoformat(), 'loyersYear': LOYERS_YEAR,
        'sansDvf': NO_DVF, 'ventes': total, 'communes': len(index),
    })
    log('termine :', total, 'ventes,', len(index), 'communes')


if __name__ == '__main__':
    main()
