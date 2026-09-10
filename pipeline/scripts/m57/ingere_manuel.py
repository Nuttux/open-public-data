"""Ingestion des PDF déposés à la main dans ~/Desktop/qipu-maquettes-manuelles/.
Pour chaque PDF : commune reconnue à l'EN-TÊTE COURANT (« VILLE DE X - … - CA - 2023 »)
comparé au répertoire des communes ; lecture de la présentation par fonction ;
lecture de la liste nominative des subventions (B1.7 M14 / B8 M57).
Sortie : manuel_results.json (à côté des PDF) + une ligne par fichier.
    python3 ingere_manuel.py            # tout le dossier
    python3 ingere_manuel.py fichier.pdf
"""
import json,os,re,sys,time,unicodedata,urllib.request,fitz
SP=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,SP)
import lecteur_m57 as L
DOSSIER=os.path.expanduser("~/Desktop/qipu-maquettes-manuelles")
def flat(s): return re.sub(r"[^a-z0-9]+"," ",unicodedata.normalize("NFD",(s or "").lower()).encode("ascii","ignore").decode()).strip()
def communes():
    c=os.path.join(SP,"communes_geo.json")
    if not os.path.exists(c):
        d=json.load(urllib.request.urlopen(urllib.request.Request("https://geo.api.gouv.fr/communes?fields=nom,code,population&format=json",headers={"User-Agent":"qipu"}),timeout=120))
        json.dump(d,open(c,"w"))
    return json.load(open(c))
def reconnaitre(doc,nom_fichier,com):
    """Commune du document : en-tête courant des pages 2-60, sinon nom de fichier."""
    txt=" ".join(doc[i].get_text()[:300] for i in range(1,min(len(doc),60)))
    cands=re.findall(r"(?:commune|ville|mairie)\s+d[e'u]?\s*([A-ZÉÈÀ][A-ZÉÈÀÙÇ'’\- ]{2,40}?)\s+(?:-|–|BUDGET|CA\b|BP\b)",txt)
    for cand in cands+[nom_fichier]:
        f=flat(cand)
        best=[c for c in com if flat(c["nom"])==f]
        if not best:  # « Noues de Sienne » vs « NOUES-DE-SIENNE » etc.
            best=[c for c in com if f and (flat(c["nom"]) in f or f in flat(c["nom"])) and len(f)>=6]
        if best: return max(best,key=lambda c:c.get("population") or 0),cand
    return None,None
if __name__=="__main__":
    com=[c for c in communes() if (c.get("population") or 0)>=3000]
    fichiers=[a for a in sys.argv[1:]] or sorted(f for f in os.listdir(DOSSIER) if f.lower().endswith(".pdf"))
    outp=os.path.join(DOSSIER,"manuel_results.json")
    res=json.load(open(outp)) if os.path.exists(outp) else {}
    for f in fichiers:
        p=f if os.path.isabs(f) else os.path.join(DOSSIER,f)
        if os.path.basename(p) in res and res[os.path.basename(p)].get("ok"): continue
        t0=time.time()
        try: doc=fitz.open(p)
        except Exception as e: print(f"{f}: illisible ({e})"); continue
        c,ent=reconnaitre(doc,os.path.splitext(os.path.basename(p))[0],com)
        nom=c["nom"] if c else os.path.splitext(os.path.basename(p))[0]
        a=L.analyse(open(p,"rb").read(),nom,ocr=True,filename=os.path.basename(p))
        d=a["detail"]
        s57=L.read_subventions_m57(doc); s14=L.read_subventions(doc) if s57["n"]<5 else {"n":0,"total":0,"pages":[]}
        subv={"format":"M57 B8","n":s57["n"],"total":s57["totaux_lus"],"ecart_pct":s57["ecart_pct"]} if s57["n"]>=5 else ({"format":"M14 B1.7","n":s14["n"],"total":s14["total"]} if s14["n"]>=5 else None)
        r={"fichier":os.path.basename(p),"commune":nom,"insee":c["code"] if c else None,"pop":c.get("population") if c else None,"source":"manuel",
           "pages":a["pages"],"scan":a["scan"],"annee":a.get("annee"),"nomenclature":a.get("nomenclature"),"entite":a["entite"],
           "n_fct":d["n_fct"],"n_inv":d["n_inv"],"total_fct":d.get("total_fct"),"fonctions":d["detail"],"subventions":subv,
           "verdict":"LU" if d["n_fct"]>=8 else ("PARTIEL" if d["n_fct"]>=5 else "PAS DE PRÉSENTATION PAR FONCTION"),"ok":True,"secs":round(time.time()-t0)}
        res[os.path.basename(p)]=r
        json.dump(res,open(outp,"w"),ensure_ascii=False,indent=1,default=str)
        sv=f" · subventions {subv['format']} {subv['n']} lignes" if subv else " · pas de liste de subventions lisible"
        print(f"{os.path.basename(p)[:44]:44s} → {nom} ({a.get('annee')}, {a['pages']} p{', scan' if a['scan'] else ''}) : {r['verdict']} {d['n_fct']} fct{sv} [{r['secs']} s]",flush=True)
