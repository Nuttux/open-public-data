#!/usr/bin/env python3
"""Vérités de terrain du lecteur — chiffres relevés à la main dans les PDF.

Ces cas couvrent les trois mises en page et les deux formats d'annexe. Ils
tournent sur des documents distants : `python3 test_lecteur.py` (réseau requis).
Un échec ici veut dire qu'on publierait des chiffres faux.
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fitz
import decouverte_base as V
import lecteur_m57 as L

CAS = [
    # (url, commune, fonctions attendues, total fonctionnement, tolérance %)
    ("https://www.nanterre.fr/fileadmin/mediatheque/Vie_citoyenne/Vie_municipale/"
     "budget_et_fiscalite/La_maquette_du_rapport_compte_administratif_2022.pdf",
     "Nanterre", 10, 282_809_040.07, 0.01, "M14 croisée"),
    ("https://www.nanterre.fr/fileadmin/mediatheque/Vie_citoyenne/Vie_municipale/"
     "budget_et_fiscalite/La_maquette_du_budget_primitif_2024.pdf",
     "Nanterre", 9, 198_582_951.00, 0.01, "M57 détaillée (paysage)"),
    ("https://www.nemours.fr/wp-content/uploads/2025/05/"
     "25-23-FINANCES-PJ-1-Compte-financier-Unique-2024-Maquette.pdf",
     "Nemours", 13, 17_775_015.06, 0.01, "CFU vue d'ensemble"),
]

def main():
    ok = True
    for url, nom, n_att, tot_att, tol, quoi in CAS:
        data = V.fetch_pdf(url)
        if not data:
            print(f"  ⚠ {quoi}: document injoignable, cas ignoré"); continue
        d = L.analyse(data, nom, ocr=False, filename=url.rsplit("/", 1)[-1])["detail"]
        ecart = abs(d["total_fct"] - tot_att) / tot_att * 100 if tot_att else 0
        bon = d["n_fct"] == n_att and ecart <= tol
        ok &= bon
        print(f"  {'✓' if bon else '✗'} {quoi:26s} {d['n_fct']}/{n_att} fonctions, "
              f"{d['total_fct']:,.2f} € (attendu {tot_att:,.2f}, écart {ecart:.3f} %)")
    # annexe des subventions : le contrôle se fait sur la balance DGFiP
    import sonde_subventions as S
    for url, nom, insee, tol in [
        ("https://www.chateauneuflesmartigues.fr/fileadmin/ARBORESCENCE/Vie_municipale/"
         "BUDGET_-_FINANCES/2022/Annexe_CA_2021_Commune.pdf", "Châteauneuf-les-Martigues", "13026", 8.0),
    ]:
        data = V.fetch_pdf(url)
        if not data:
            print(f"  ⚠ subventions {nom}: injoignable"); continue
        r = L.read_subventions(fitz.open(stream=data, filetype="pdf"))
        ref = S.dgfip_6574(insee)
        ec = abs(r["total_prive"] - ref) / ref * 100 if ref else 999
        bon = ec <= tol
        ok &= bon
        print(f"  {'✓' if bon else '✗'} subventions {nom[:18]:18s} {r['n_prive']} bénéficiaires privés, "
              f"{r['total_prive']:,.0f} € vs compte 65748 {ref:,.0f} € (écart {ec:.1f} %)")
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
