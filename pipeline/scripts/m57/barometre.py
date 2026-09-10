"""Baromètre de publication des budgets communaux — chiffre défendable.

Trois catégories, du point de vue du citoyen qui cherche « où va l'argent » :
  A. donnée obtenue      : présentation par fonction lue sur le budget de LA commune
  B. publie, sans la maquette : des documents en ligne (PV, délibérations,
     présentations) mais pas la présentation par fonction
  C. rien d'exploitable  : rien trouvé, ou seulement le document d'une AUTRE
     entité (EPCI, commune voisine, département), ou site hors ligne

Le tirage aléatoire ne reproduit jamais exactement la structure du pays : on
REDRESSE par tranche de population (post-stratification) et on donne
l'intervalle de confiance à 95 %.  python3 barometre.py [fichiers…]
"""
import json,re,sys,os,math,unicodedata,urllib.request
from collections import defaultdict
SP=os.path.dirname(os.path.abspath(__file__))
BANDS=[("3,5-5k",3500,5000),("5-10k",5000,10000),("10-20k",10000,20000),("20-50k",20000,50000),("50k+",50000,10**9)]
def band(p):
    for n,a,b in BANDS:
        if a<=p<b: return n
    return BANDS[0][0]
def flat(t): return re.sub(r"\s+"," ",re.sub(r"[^a-z0-9 ]"," ",unicodedata.normalize("NFD",(t or "").lower()).encode("ascii","ignore").decode())).strip()
def autre_entite(nom,ent):
    fn=flat(nom); fh=flat(ent)
    for m in re.finditer(r"(?:commune|ville|mairie)\s+d[e'u]?\s*([a-z0-9 ]{3,40}?)(?=\s+-\s|\s+budget|\s+\d|\s*$|\s*\|)",fh):
        c=m.group(1).strip()
        return None if (fn in c or fn.replace(" ","") in c.replace(" ","") or c in fn) else c
    return None
def categorie(r):
    """Catégories citoyennes. Verdicts v7 (« CONCLU… », « documents trouvés… ») ET
    v8 (« LU », « PUBLIE SANS MAQUETTE », « AUTRE ENTITÉ », « RIEN TROUVÉ »,
    « NON CONCLUANT (…) »). Un NON CONCLUANT est sorti du dénominateur : ce n'est
    ni un oui ni un non, c'est une recherche qui a échoué."""
    c=str(r.get("conclusion","")); ent=((r.get("pdf") or {}).get("entite") or {}).get("entete","") or ""
    if c.startswith("NON CONCLUANT"): return "X"
    if c.startswith("LU") or c.startswith("PARTIEL"): return "A"
    if c.startswith("CONCLU"): return "C" if autre_entite(r["nom"],ent) else "A"
    if c.startswith("partiel"): return "A"
    if c.startswith("PUBLIE SANS MAQUETTE") or c.startswith("SCAN"): return "B"
    if "autre entité" in c.lower() or c.startswith("AUTRE ENTIT") or c.startswith("RIEN TROUV"): return "C"
    if c.startswith("documents trouvés") or c.startswith("scan"): return "B"
    return "C"
def univers():
    u=json.load(urllib.request.urlopen("https://geo.api.gouv.fr/communes?fields=nom,population,codeDepartement&format=json",timeout=120))
    e=[x for x in u if (x.get("population") or 0)>=3500 and not str(x["codeDepartement"]).startswith(("97","98"))]
    d=defaultdict(int)
    for x in e: d[band(x["population"])]+=1
    return d,len(e)
if __name__=="__main__":
    files=sys.argv[1:] or [f for f in os.listdir(SP) if re.match(r"probe_v7_.*\.json$",f)]
    rows=[]
    for f in files:
        p=os.path.join(SP,f)
        if os.path.exists(p):
            for r in json.load(open(p)):
                if r.get("conclusion"): r["_f"]=f; rows.append(r)
    if not rows: sys.exit("aucun résultat")
    U,NU=univers()
    nonc=[r for r in rows if categorie(r)=="X"]
    rows=[r for r in rows if categorie(r)!="X"]
    par=defaultdict(lambda: defaultdict(int))
    for r in rows: par[band(r.get("pop",0))][categorie(r)]+=1
    print(f"BAROMÈTRE — {len(rows)} communes CONCLUANTES sur {NU:,} de 3 500 hab et plus (hors DOM)"
          + (f" — {len(nonc)} non concluantes écartées ({', '.join(x['nom'] for x in nonc[:6])}{'…' if len(nonc)>6 else ''})" if nonc else "")+"\n")
    print(f"  {'tranche':10s} {'sondées':>8s} {'A lu':>6s} {'B sans':>7s} {'C rien':>7s}   {'part A':>7s}  {'poids pays':>10s}")
    brut=defaultdict(int)
    for n,_,_ in BANDS:
        c=par[n]; tot=sum(c.values())
        for k in "ABC": brut[k]+=c[k]
        if tot: print(f"  {n:10s} {tot:>8d} {c['A']:>6d} {c['B']:>7d} {c['C']:>7d}   {100*c['A']/tot:>6.0f} % {100*U[n]/NU:>9.0f} %")
    N=sum(brut.values())
    print(f"\n  BRUT           : A {100*brut['A']/N:.0f} %  |  B {100*brut['B']/N:.0f} %  |  C {100*brut['C']/N:.0f} %   (n={N})")
    # redressement : chaque tranche pèse sa part réelle du pays
    est={}; var=0.0
    for k in "ABC":
        s=0.0
        for n,_,_ in BANDS:
            c=par[n]; tot=sum(c.values())
            if not tot: continue
            w=U[n]/NU; p=c[k]/tot
            s+=w*p
            if k=="A": var+=(w**2)*p*(1-p)/tot
        est[k]=s
    ic=1.96*math.sqrt(var)
    print(f"  REDRESSÉ       : A {100*est['A']:.0f} %  |  B {100*est['B']:.0f} %  |  C {100*est['C']:.0f} %")
    print(f"\n  ⇒ « la présentation par fonction est récupérable pour {100*est['A']:.0f} % des communes de 3 500 hab et plus »")
    print(f"     intervalle de confiance à 95 % : {100*(est['A']-ic):.0f} % – {100*(est['A']+ic):.0f} %  (± {100*ic:.0f} points)")
    if any(sum(par[n].values())==0 for n,_,_ in BANDS):
        print("     ⚠ tranches sans aucune commune sondée : redressement incomplet")
    sub=[r for r in rows if (r.get("subventions") or {}).get("n")]
    if sub:
        print(f"\n  Subventions NOMINATIVES lues (B1.7 / B8) sur le meilleur document : {len(sub)}/{len(rows)} communes"
              f" — dont {sum(1 for r in sub if categorie(r)!='A')} SANS tableau par fonction")
        for r in sub[:8]:
            sv=r["subventions"]; t=sv.get("total"); t=t.get("fct") if isinstance(t,dict) else t
            print(f"     {r['nom']:24s} {sv.get('format','')[:8]:8s} {sv['n']:4d} lignes  {(t or 0):>14,.0f} €")
    epci=[r["nom"] for r in rows if categorie(r)=="C" and re.search(r"agglom|communaut|m[ée]tropole|d[ée]partement",((r.get("pdf") or {}).get("entite") or {}).get("entete","") or "",re.I)]
    print(f"\n  Dont {len(epci)} communes où le SEUL document lisible trouvé est celui de l'intercommunalité ou du département :")
    print("   ",", ".join(epci[:18]))
