"""Sonde v9 — on ne cherche plus la ventilation par FONCTION (la DGFiP la publie
déjà pour 3 384 communes : voir export_communes_fonctions.py), mais la LISTE
NOMINATIVE DES SUBVENTIONS, qui n'existe dans aucun jeu national :
    M14 → annexe B1.7 « concours attribués à des tiers en nature ou en subventions »
    M57 → annexe B8  « subventions versées »
Chaque extraction arrive avec son CONTRÔLE :
    M57 B8 : totaux imprimés dans le document (écart attendu 0 %)
    M14 B1.7 : comparaison au compte 6574/65748 de la balance DGFiP
Découverte inchangée (5 canaux de v8), mais le classement des candidats et le
verdict portent sur les subventions.
    python3 sonde_subventions.py <fichier.json>
"""
import json,re,os,sys,time,urllib.parse,urllib.request
SP=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,SP)
import decouverte_base as V, lecteur_m57 as L, decouverte as P8
import fitz

UA={"User-Agent":"Mozilla/5.0"}
DS="balances-comptables-des-collectivites-et-des-etablissements-publics-locaux-avec-la-presentation-croisee-nature-fonction-2024"

def dgfip_6574(insee):
    """Le compte 6574/65748 « subventions aux associations et personnes privées »
    de la balance DGFiP : c'est lui qui valide un B1.7 lu dans un PDF.
    Clé de recherche : ndept (3 caractères, zéro devant) + insee (3 derniers) —
    le champ `siren` n'est pas interrogeable par préfixe et `like` ne marche pas
    sur cette API ; `compte in (…)` fonctionne, `(compte='a' or compte='b')` non."""
    if not insee or len(insee)!=5: return None
    w=f"ndept='0{insee[:2]}' and insee='{insee[2:]}' and compte in ('6574','65748')"
    try:
        u=(f"https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/{DS}/records"
           "?select=sum(obnetdeb)%20as%20s&limit=1&where="+urllib.parse.quote(w))
        d=json.load(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60))
        return (d.get("results") or [{}])[0].get("s")
    except Exception: return None

def lire_subventions(data, nom):
    """Renvoie (n_lignes, total, format, controle_pct, lignes) pour un PDF."""
    try: doc=fitz.open(stream=data,filetype="pdf")
    except Exception: return None
    ent=L.analyse(data,nom,ocr=False,filename="")["entite"]
    try:
        m57=L.read_subventions_m57(doc)
        if m57["n"]>=5:
            ec=m57["ecart_pct"].get("fct")
            return {"n":m57["n"],"total":m57["totaux_lus"].get("fct"),"format":"M57 B8",
                    "controle":ec,"controle_src":"totaux imprimés","entite":ent,
                    "lignes":m57["lignes"][:400],"pages":m57["pages"][:4]}
    except Exception: pass
    try:
        m14=L.read_subventions(doc)
        if m14["n"]>=5:
            return {"n":m14["n"],"total":m14["total"],"format":"M14 B1.7","controle":None,
                    "controle_src":"compte 6574 DGFiP","entite":ent,
                    "lignes":m14["lignes"][:400],"pages":m14["pages"][:4]}
    except Exception: pass
    return None

def score_subv(item):
    """Classement des candidats : ce qui ressemble à une maquette COMPLÈTE
    (avec ses annexes) d'abord ; les notes de synthèse en dernier."""
    u,t=item; low=(u+" "+str(t)).lower(); s=0
    if re.search(r"maquette|annexe|complet|integral",low): s+=6
    if re.search(r"compte[- _]?administratif|\bca\b|cfu|compte[- _]?financier",low): s+=4
    if re.search(r"budget[- _]?primitif|\bbp\b",low): s+=3
    if re.search(r"subvention|concours",low): s+=5
    for y,w in (("2025",4),("2024",4),("2023",3),("2022",2)):
        if y in low: s+=w; break
    if re.search(r"synth|br[èe]ve|note|pr[ée]sentation|orientation|\brob\b|d[ée]lib(?!.*annexe)",low): s-=4
    return -s

if __name__=="__main__":
    src=sys.argv[1]; profil=os.environ.get("GPROFILE") or os.path.join(SP,"chrome_profile")
    out=[]
    for c in json.load(open(os.path.join(SP,src))):
        t0=time.time()
        site=c.get("site") or (V.site_for(c["insee"]) if c.get("insee") else None)
        if not site:
            out.append({**c,"conclusion":"NON CONCLUANT : pas de site"}); print(f"{c['nom']:24s} pas de site",flush=True); continue
        pdfs,pr,final=P8.discover_v8(site,c["nom"],profil)
        best=None; testes=0
        for u,t in sorted(pdfs.items(),key=score_subv)[:14]:
            d=V.fetch_pdf(u,t if isinstance(t,tuple) else None)
            if not d: continue
            testes+=1; time.sleep(0.6)
            r=lire_subventions(d,c["nom"])
            if r and r["entite"].get("nom_ok") and (best is None or r["n"]>best["n"]):
                best=dict(r,url=u)
                if best["n"]>=20: break
        ref=dgfip_6574(c.get("insee")) if best and best["format"].startswith("M14") else None
        if best and ref: best["controle"]=round(100*(best["total"]-ref)/ref,1); best["ref_6574"]=ref
        canaux_ko=[k for k,v in pr["canaux"].items() if not v.get("ok")]
        if best: verdict=f"SUBVENTIONS LUES ({best['format']}, {best['n']} bénéficiaires)"
        elif canaux_ko: verdict="NON CONCLUANT ("+", ".join(canaux_ko)+" en échec)"
        else: verdict="PAS DE LISTE NOMINATIVE (tous canaux ok)"
        r={**c,"site_final":final,"pdfs":len(pdfs),"testes":testes,"preuve":pr,"conclusion":verdict,
           "subventions":({k:best[k] for k in ("n","total","format","controle","controle_src","url","pages","ref_6574") if k in best} if best else None),
           "beneficiaires":(best or {}).get("lignes"),"secs":round(time.time()-t0)}
        out.append(r)
        ctl=f" contrôle {best['controle']:+.1f} %" if best and best.get("controle") is not None else ""
        print(f"{c['nom']:24s} pdfs={len(pdfs):3d} lus={testes:2d} | {verdict[:46]:46s}{ctl} | {r['secs']}s",flush=True)
        json.dump(out,open(os.path.join(SP,"probe_v9_"+os.path.basename(src)),"w"),ensure_ascii=False,indent=1,default=str)
    from collections import Counter
    print("\nRÉCAP v9 :",dict(Counter(x["conclusion"].split("(")[0].strip() for x in out)))
