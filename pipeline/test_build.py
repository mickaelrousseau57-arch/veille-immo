"""Tests du pipeline : python3 -m unittest discover -s pipeline"""
import datetime as dt
import io
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_data as b  # noqa: E402

HEAD = ('id_mutation,date_mutation,numero_disposition,nature_mutation,valeur_fonciere,adresse_numero,adresse_suffixe,adresse_nom_voie,'
        'adresse_code_voie,code_postal,code_commune,nom_commune,code_departement,ancien_code_commune,ancien_nom_commune,id_parcelle,'
        'ancien_id_parcelle,numero_volume,lot1_numero,lot1_surface_carrez,lot2_numero,lot2_surface_carrez,lot3_numero,lot3_surface_carrez,'
        'lot4_numero,lot4_surface_carrez,lot5_numero,lot5_surface_carrez,nombre_lots,code_type_local,type_local,surface_reelle_bati,'
        'nombre_pieces_principales,code_nature_culture,nature_culture,code_nature_culture_speciale,nature_culture_speciale,surface_terrain,'
        'longitude,latitude')


def ligne(mut, nature='Vente', val='200000', parcelle='P1', typ='Appartement', surf='50', pieces='2', culture='sols', terrain='100', disp='000001', lot=''):
    cols = HEAD.split(',')
    d = {c: '' for c in cols}
    d.update(id_mutation=mut, date_mutation='2025-06-01', numero_disposition=disp, nature_mutation=nature, valeur_fonciere=val,
             adresse_numero='3', adresse_nom_voie='RUE DU TEST', code_postal='54000', code_commune='54395', code_departement='54',
             id_parcelle=parcelle, type_local=typ, surface_reelle_bati=surf, nombre_pieces_principales=pieces, nature_culture=culture,
             surface_terrain=terrain, longitude='6.17', latitude='48.69', lot1_numero=lot)
    return ','.join(d[c] for c in cols)


def lire(*lignes):
    data = (HEAD + '\n' + '\n'.join(lignes) + '\n').encode()
    return list(b.mutations(io.BytesIO(data)))


class MutationsTest(unittest.TestCase):
    def test_vente_simple(self):
        r = lire(ligne('M1'))
        self.assertEqual(len(r), 1)
        self.assertEqual(r[0]['ppm2'], 4000)
        self.assertEqual(r[0]['adr'], '3 Rue Du Test')

    def test_un_logement_sur_plusieurs_natures_de_culture_compte_une_fois(self):
        r = lire(ligne('M1', typ='Maison', surf='100', culture='sols', terrain='200'), ligne('M1', typ='Maison', surf='100', culture='jardins', terrain='300'))
        self.assertEqual(len(r), 1)
        self.assertEqual(r[0]['terrain'], 500)

    def test_deux_logements_dans_la_meme_vente_sont_ignores(self):
        self.assertEqual(lire(ligne('M1', lot='1'), ligne('M1', lot='2', surf='30')), [])

    def test_hors_vente_ou_local_commercial_ou_plusieurs_dispositions(self):
        self.assertEqual(lire(ligne('M1', nature="Vente en l'état futur d'achèvement")), [])
        self.assertEqual(lire(ligne('M1'), ligne('M1', typ='Local industriel. commercial ou assimilé', surf='20')), [])
        self.assertEqual(lire(ligne('M1'), ligne('M1', disp='000002', lot='9')), [])

    def test_valeurs_aberrantes(self):
        self.assertEqual(lire(ligne('M1', val='1000')), [])
        self.assertEqual(lire(ligne('M1', val='900000', surf='20')), [])  # 45 000 euros/m2
        self.assertEqual(lire(ligne('M1', surf='5')), [])
        self.assertEqual(lire(ligne('M1', typ='Maison', surf='100', terrain='50000')), [])


class StatsTest(unittest.TestCase):
    def test_percentiles(self):
        self.assertEqual(b.quantiles([100, 200, 300, 400, 500]), [140, 200, 300, 400, 460])
        self.assertEqual(b.median([10]), 10)

    def test_bloc_fenetres_et_annees(self):
        ref = dt.date(2025, 12, 31)
        rows = [('2025-06-01', 2000 + i * 10, 2, 50) for i in range(10)] + [('2022-06-01', 1500 + i * 10, 3, 60) for i in range(6)]
        out = b.bloc(rows, ref)
        self.assertEqual(out['n'], 10)
        self.assertEqual(out['n3'], 10)  # 2022-06 est a plus de 3 ans de la reference
        self.assertEqual(out['y']['2025'][1], 10)
        self.assertEqual(out['y']['2022'][1], 6)
        self.assertEqual(out['r']['2'][1], 10)


if __name__ == '__main__':
    unittest.main()
