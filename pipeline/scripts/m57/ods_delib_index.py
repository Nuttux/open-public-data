"""Index des jeux « délibérations » Opendatasoft, construit UNE FOIS.

Pourquoi un index : le catalogue fédéré ne permet pas de filtrer par éditeur
(`search(publisher,…)` renvoie 0), et les noms de champs changent d'un portail
à l'autre (`delib_objet` à Évry, `nom_du_document`/`lien_annexe` au Roumois).
On moissonne donc tout une fois, on garde portail + champs + éditeur, et la
sonde n'a plus qu'à chercher sa commune dedans.
"""
import json,re,os,time,unicodedata,urllib.request,urllib.parse
UA={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"}
SP=os.path.dirname(os.path.abspath(__file__))
FED="https://data.opendatasoft.com/api/explore/v2.1/catalog/datasets"
def j(u,t=90):
    try: return json.load(urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=t))
    except Exception: return None
def flat(s):
    s=unicodedata.normalize("NFD",(s or "").lower()).encode("ascii","ignore").decode()
    return re.sub(r"[^a-z0-9]+"," ",s).strip()
REQ=['search(title,"délibération")','search(title,"deliberation")','search(dataset_id,"delib")',
     'search(title,"actes administratifs")','search(title,"conseil municipal")','search(title,"recueil des actes")']
if __name__=="__main__":
    vus={}
    for q in REQ:
        for off in (0,100,200,300):
            d=j(f"{FED}?limit=100&offset={off}&where="+urllib.parse.quote(q))
            if not d or not d.get("results"): break
            for x in d["results"]: vus[x["dataset_id"]]=x
            if len(d["results"])<100: break
            time.sleep(0.3)
    print(f"{len(vus)} jeux moissonnés")
    idx=[]
    for did,x in vus.items():
        base,_,portail=did.partition("@")
        if not portail: continue
        m=x.get("metas",{}).get("default",{})
        champs=[(f.get("name"),f.get("type")) for f in (x.get("fields") or [])]
        txt=[n for n,t in champs if t=="text" and re.search(r"objet|titre|libell|intitul|nom|sujet|descript",n or "",re.I)]
        fic=[n for n,t in champs if t in ("file","attachment") or re.search(r"lien|url|fichier|pdf|document",n or "",re.I)]
        # l'hôte réel est dans metas.default.source_domain_address (domaine
        # personnalisé, ex. opendata.roubaix.fr) ; le suffixe « @portail » n'est
        # qu'un secours
        sda=(m.get("source_domain_address") or "").replace("https://","").replace("http://","").strip("/")
        idx.append({"id":did,"base":base,"portail":portail,"hote":sda or f"{portail}.opendatasoft.com","hote_secours":f"{portail}.opendatasoft.com",
                    "titre":(m.get("title") or "")[:80],"editeur":(m.get("publisher") or "")[:60],
                    "n":m.get("records_count"),"champs_texte":txt[:4],"champs_fichier":fic[:4],
                    "cle":flat((m.get("publisher") or "")+" "+(m.get("title") or "")+" "+portail)})
    json.dump(idx,open(os.path.join(SP,"ods_delib_index.json"),"w"),ensure_ascii=False,indent=1)
    avec=[x for x in idx if x["champs_fichier"]]
    print(f"{len(idx)} jeux indexés, dont {len(avec)} avec un champ fichier")
    for x in sorted(avec,key=lambda v:-(v['n'] or 0))[:18]:
        print(f"   {str(x['n']):>7} {x['editeur'][:34]:34s} {x['portail'][:26]:26s} txt={x['champs_texte'][:2]} fic={x['champs_fichier'][:2]}")
