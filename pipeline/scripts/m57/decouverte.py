"""Sonde v8 — les trois correctifs issus de la vérification humaine :
  1. canal DÉLIBÉRATIONS / recueil des actes (obligatoire depuis 2022-07-01,
     L2131-1 CGCT) — c'est là que vivent les maquettes, en annexe du vote
  2. balayage par ANNÉES (la pratique varie d'une année à l'autre)
  3. aucun verdict « rien trouvé » sans PREUVE : chaque canal dit s'il a
     réussi ou échoué ; si un canal a échoué, la conclusion est « non concluant »

Usage : python3 decouverte.py <fichier.json>
"""
import json,re,os,sys,time,urllib.parse
SP=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,SP)
import decouverte_base as V, lecteur_m57 as L

ANNEES=[2026,2025,2024,2023,2022,2021,2020]
DELIB=["/deliberations","/deliberation","/recueil-des-actes","/recueil-des-actes-administratifs",
 "/actes-administratifs","/les-actes-administratifs","/conseil-municipal","/le-conseil-municipal",
 "/vie-municipale/deliberations","/la-mairie/deliberations","/mairie/deliberations",
 "/vie-municipale/conseil-municipal","/comptes-rendus","/proces-verbaux","/publications-legales"]
PLATEFORME=re.compile(r"calameo|huwise|issuu|s2low|adullact|docapost|cloudimg|scribd|yumpu|flipbook|ged\\.|documents?\\.",re.I)
DELIB_TXT=re.compile(r"d[ée]lib[ée]ration|actes? administratifs?|recueil des actes|conseil municipal|proc[èe]s.verba|compte.rendu|publications? l[ée]gales",re.I)
MAQ_KW=re.compile(r"maquette|annexe|budget|compte[- _]?administratif|compte[- _]?financier|\bCA\b|\bBP\b|\bCFU\b|documents?[- _]budg",re.I)


FED="https://data.opendatasoft.com/api/explore/v2.1/catalog/datasets"
def _ods(u,t=60):
    try:
        import urllib.request as R
        return json.load(R.urlopen(R.Request(u,headers={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"}),timeout=t))
    except Exception: return None

_ODS_IDX=None
def _ods_index():
    global _ODS_IDX
    if _ODS_IDX is None:
        try: _ODS_IDX=json.load(open(os.path.join(SP,"ods_delib_index.json")))
        except Exception: _ODS_IDX=[]
    return _ODS_IDX

def canal_ods_deliberations(nom,host):
    """Délibérations publiées comme JEU DE DONNÉES Opendatasoft, PDF en pièce
    jointe — découvert via Évry-Courcouronnes (budget primitif 2023 : 139 p.,
    10 fonctions, introuvable autrement). On passe par un index moissonné une
    fois (`ods_delib_index.py`) : le catalogue fédéré ne sait pas filtrer par
    éditeur, et les noms de champs changent d'un portail à l'autre."""
    import unicodedata
    def flat(x):
        x=unicodedata.normalize("NFD",(x or "").lower()).encode("ascii","ignore").decode()
        return re.sub(r"[^a-z0-9]+"," ",x).strip()
    cible=flat(nom); mots=[m for m in cible.split() if len(m)>3] or [cible]
    out={}; interroges=0; jeux=0
    for x in _ods_index():
        if not x.get("champs_fichier"): continue
        if not all(m in x["cle"] for m in mots): continue
        jeux+=1
        txt=x["champs_texte"] or ["objet"]
        ou=" or ".join(f'search({c},"compte administratif") or search({c},"budget primitif") or search({c},"budget principal")' for c in txt[:3])
        r=_ods(f"https://{x['hote']}/api/explore/v2.1/catalog/datasets/{x['base']}/records?limit=60&where="+urllib.parse.quote(ou))
        if r is None or "results" not in r:
            r=_ods(f"https://{x['hote']}/api/explore/v2.1/catalog/datasets/{x['base']}/records?limit=100")
            if r is None or "results" not in r: continue
        interroges+=1
        for rec in r["results"]:
            # ne JAMAIS tronquer avant de chercher : « Ville de Cannes Finances
            # locales. Decisions budgetaires Budget primitif… » coupé à 70 → « Budget primiti »
            titre_plein=" ".join(str(rec.get(c) or "") for c in txt)
            if not re.search(r"compte administratif|budget primitif|budget principal|compte financier",titre_plein,re.I): continue
            titre=titre_plein[-70:] if len(titre_plein)>70 else titre_plein
            for k,v in rec.items():
                u=None
                if isinstance(v,dict) and (v.get("url") or v.get("id")):
                    u=v.get("url") or f"https://{x['hote']}/api/explore/v2.1/catalog/datasets/{x['base']}/files/{v['id']}"
                elif isinstance(v,str) and v.startswith("http") and (".pdf" in v.lower() or "/files/" in v):
                    u=v
                if u: out[u]="ods-delib: "+titre
    return out,{"ok":(jeux==0) or interroges>0,"n":len(out),"jeux":jeux,"interroges":interroges}

def google_sur(host,nom,profil):
    """Google avec DÉTECTION D'ÉCHEC : zéro résultat sur un site: d'une mairie
    est presque toujours un blocage. On réessaie sur un autre profil ; si c'est
    encore zéro, on le dit au lieu de conclure à une absence."""
    qs=[f"site:{host} maquette budget",
        f'site:{host} "compte administratif" annexe',
        f'site:{host} "présentation croisée par fonction"',
        f'site:{host} délibération budget primitif annexe']
    prof=[profil, os.path.join(SP,"gp1"), os.path.join(SP,"gp2"), os.path.join(SP,"gp3")]
    for k,pr in enumerate(prof[:3]):
        old=V._GPROFILE; V._GPROFILE=pr
        try: r=V.google(host,nom=nom)
        finally: V._GPROFILE=old
        if r: return r,{"ok":True,"profil":k,"n":len(r)}
        time.sleep(3)
    return {},{"ok":False,"raison":"zéro résultat sur 3 profils → blocage probable"}

def discover_v8(site,nom,profil):
    """Renvoie (pdfs, preuve). `preuve` dit ce qui a été fait et ce qui a raté."""
    pr={"canaux":{}, "pages_parcourues":0}
    pdfs={}
    # canal 1 : la découverte existante (accueil, sitemap, wp-media, chemins budget)
    try:
        final,p1,ext,err=V.discover(site)
        if err: pr["canaux"]["crawl"]={"ok":False,"raison":err}
        else: pdfs.update(p1); pr["canaux"]["crawl"]={"ok":True,"n":len(p1)}
        pr["lecteurs_externes"]=len(ext or [])
    except Exception as e:
        final=site; pr["canaux"]["crawl"]={"ok":False,"raison":str(e)[:60]}
    host=urllib.parse.urlparse(final or site).netloc.replace("www.","")
    same=lambda u: urllib.parse.urlparse(u).netloc.replace("www.","").endswith(host)
    # canal 2 : délibérations, avec les années
    n2=0; ok2=False
    cand=[urllib.parse.urljoin(final or site,p) for p in DELIB]
    cand+=[urllib.parse.urljoin(final or site,f"{p}/{y}") for p in DELIB[:6] for y in ANNEES[:4]]
    # Les arborescences réelles ne suivent pas nos chemins devinés
    # (Nanterre : /vie-citoyenne/vie-municipale/les-actes-administratifs).
    # On suit donc les LIENS de l'accueil dont le libellé parle d'actes.
    try:
        home,_,fu=V.get(final or site,timeout=25)
        for lu,lt in V.links(home,fu):
            if same(lu) and DELIB_TXT.search(lt+" "+lu) and lu not in cand: cand.insert(0,lu)
    except Exception: pass
    for u in cand[:24]:                       # 24 pages max par site (était 34)
        try: page,ct,fu=V.get(u,timeout=18)
        except Exception: continue
        pr["pages_parcourues"]+=1; ok2=True
        time.sleep(1.2)                        # ménager les serveurs : blocage IP vu sur Gentilly/Avrillé
        if "pdf" in ct.lower(): pdfs[fu]="delib direct"; n2+=1; continue
        for lu,lt in V.links(page,fu):
            if lu.lower().endswith(".pdf") and same(lu) and MAQ_KW.search(lt+" "+lu):
                if lu not in pdfs: pdfs[lu]="delib: "+lt[:50]; n2+=1
        time.sleep(0.3)
    pr["canaux"]["deliberations"]={"ok":ok2,"n":n2,"pages":pr["pages_parcourues"]}
    # canal 3 : Google, avec détection d'échec
    g,pg=google_sur(host,nom,profil)
    # Un résultat hors domaine n'est admis que s'il vient d'une PLATEFORME de
    # documents (Calameo, Huwise, Issuu, S²LOW…). Sinon c'est presque toujours
    # la commune voisine : Sartrouville s'était vu attribuer le compte
    # administratif de Houilles, qui a gagné au classement.
    for u,t in g.items():
        if not u.lower().endswith(".pdf") or u in pdfs: continue
        h=urllib.parse.urlparse(u).netloc.replace("www.","")
        if h.endswith(host) or PLATEFORME.search(h): pdfs[u]="google: "+str(t)[:50]
        else: pr.setdefault("ecartes",[]).append(u[:90])
    pr["canaux"]["google"]=pg
    # canal 5 : délibérations publiées comme JEU DE DONNÉES Opendatasoft
    try:
        o,po=canal_ods_deliberations(nom,host)
        for u,t in o.items():
            if u not in pdfs: pdfs[u]=t
        pr["canaux"]["ods_delib"]=po
    except Exception as e: pr["canaux"]["ods_delib"]={"ok":False,"raison":str(e)[:50]}
    # canal 4 : Wayback si on n'a rien de solide
    fort=[u for u in pdfs if re.search(r"maquette|annexe|compte[- _]?administratif|budget[- _]?primitif",u,re.I)]
    if len(fort)<2:
        try:
            w=V.wayback_pdfs(host); pdfs.update({u:v for u,v in w.items() if u not in pdfs})
            pr["canaux"]["wayback"]={"ok":True,"n":len(w)}
        except Exception as e: pr["canaux"]["wayback"]={"ok":False,"raison":str(e)[:50]}
    return pdfs,pr,final

def lire_les_meilleurs(pdfs,nom,budget=16):   # 16 PDF max par commune (était 22) : moins de charge, mêmes verdicts
    best=None; essais=[]; testes=0
    for u,t in sorted(pdfs.items(),key=V.score)[:budget]:
        d=V.fetch_pdf(u,t if isinstance(t,tuple) else None)
        if not d: continue
        testes+=1; time.sleep(0.8)
        a=L.analyse(d,nom,ocr=False,filename=u.rsplit("/",1)[-1]); a.update({"url":u,"lien":str(t)[:50]})
        essais.append({"url":u[-64:],"n_fct":a["detail"]["n_fct"],"pages":a.get("pages"),"scan":a.get("scan"),
                       "entete":(a.get("entite") or {}).get("entete","")[:44],"annee":a.get("annee")})
        if best is None or V.quality(a)>V.quality(best): best=a
        if V.quality(best)[0]==1: break
    # OCR de secours sur le plus gros scan d'entité correcte
    if (best is None or V.quality(best)[0]!=1):
        for e in sorted([x for x in essais if x["scan"] and (x["pages"] or 0)>=20],key=lambda x:-(x["pages"] or 0))[:2]:
            u=next((k for k in pdfs if k.endswith(e["url"][-40:])),None)
            if not u: continue
            d=V.fetch_pdf(u)
            if not d: continue
            a=L.analyse(d,nom,ocr=True,filename=u.rsplit("/",1)[-1]); a.update({"url":u,"lien":"ocr"})
            if best is None or V.quality(a)>V.quality(best): best=a
            if V.quality(best)[0]==1: break
    return best,essais,testes

def verdict(best,pr):
    """Un « rien trouvé » — ou un « publie sans maquette » — n'est valable QUE si
    tous les canaux ont fonctionné : un canal en échec peut cacher LA maquette."""
    canaux_ko=[k for k,v in pr["canaux"].items() if not v.get("ok")]
    v=_verdict_brut(best,pr)
    if canaux_ko and not v.startswith("LU"): v="NON CONCLUANT ("+", ".join(canaux_ko)+" en échec) — sinon : "+v
    return v

def _verdict_brut(best,pr):
    if best is not None:
        q=V.quality(best); d=best["detail"]; ok=q[2]==1
        if ok and d["n_fct"]>=8: return "LU : fonction lue"
        if ok and d["n_fct"]>=5: return "PARTIEL : fonction lue en partie"
        if not ok and d["n_fct"]>=8: return "AUTRE ENTITÉ : lisible mais ce n'est pas cette commune"
        # Châteauneuf : le meilleur document retenu était un scan, alors qu'un
        # document TEXTE de la bonne commune (« Annexe_CA_2021_Commune », 116 p.)
        # avait été lu et ne contient simplement pas la présentation croisée
        # (sommaire menteur, annexe A1 absente). Ce cas est « publie sans la
        # maquette », pas « scan illisible ».
        if ok and not best.get("scan"): return "PUBLIE SANS MAQUETTE : document de la commune lu, présentation croisée absente"
        if best.get("scan"): return "SCAN illisible"
    return "PUBLIE SANS MAQUETTE" if best is not None else "RIEN TROUVÉ (tous canaux ok)"

if __name__=="__main__":
    src=sys.argv[1]; profil=os.environ.get("GPROFILE") or os.path.join(SP,"chrome_profile")
    out=[]
    for c in json.load(open(os.path.join(SP,src))):
        t0=time.time()
        site=c.get("site") or (V.site_for(c["insee"]) if c.get("insee") else None)
        if not site:
            out.append({**c,"conclusion":"NON CONCLUANT : pas de site dans l'annuaire"}); print(f"{c['nom']:26s} pas de site"); continue
        pdfs,pr,final=discover_v8(site,c["nom"],profil)
        best,essais,testes=lire_les_meilleurs(pdfs,c["nom"])
        v=verdict(best,pr)
        subv=None
        if best is not None and best.get("url"):
            try:
                import fitz
                dd=V.fetch_pdf(best["url"])
                if dd:
                    doc=fitz.open(stream=dd,filetype="pdf")
                    s57=L.read_subventions_m57(doc)
                    if s57["n"]>=5: subv={"format":"M57 B8","n":s57["n"],"total":s57["totaux_lus"],"ecart_pct":s57["ecart_pct"],"pages":s57["pages"][:4]}
                    else:
                        s14=L.read_subventions(doc)
                        if s14["n"]>=5: subv={"format":"M14 B1.7","n":s14["n"],"total":s14["total"],"pages":s14["pages"][:4]}
            except Exception as e: subv={"erreur":str(e)[:60]}
        # subventions publiées À PART de la maquette ?
        subv_sep=None
        try:
            seps=[(u,t) for u,t in pdfs.items() if re.search(r"subvention|associations? subventionn|concours attribu",u+" "+str(t),re.I)]
            for u,t in seps[:3]:
                dd=V.fetch_pdf(u)
                if not dd: continue
                import fitz
                doc=fitz.open(stream=dd,filetype="pdf")
                s14=L.read_subventions(doc)
                if s14["n"]>=5: subv_sep={"format":"PDF séparé","n":s14["n"],"total":s14["total"],"url":u[:120]}; break
            if subv_sep is None:
                g=V.get("https://www.data.gouv.fr/api/1/datasets/?schema=scdl%2Fsubventions&q="+urllib.parse.quote(c["nom"])+"&page_size=5",timeout=30)[0]
                for x in json.loads(g).get("data",[]):
                    org=((x.get("organization") or {}).get("name") or "")
                    if re.sub(r"[^a-z]","",c["nom"].lower()) in re.sub(r"[^a-z]","",org.lower()):
                        subv_sep={"format":"SCDL data.gouv","jeu":x.get("title","")[:70],"url":"https://www.data.gouv.fr/datasets/"+x.get("slug","")}; break
        except Exception: pass
        if subv and subv.get("n"): subv["source"]="maquette"
        elif subv_sep: subv=dict(subv_sep,source="separe")
        else: subv={"source":"aucune"}
        r={**c,"site_final":final,"pdfs":len(pdfs),"testes":testes,"preuve":pr,"conclusion":v,"subventions":subv,
           "pdf":{k:(best or {}).get(k) for k in ("url","pages","scan","ocr","annee","nomenclature","entite")} if best else None,
           "fonctions":best["detail"]["detail"] if best else None,"essais":essais[:8],"secs":round(time.time()-t0)}
        out.append(r)
        ch=" ".join(f"{k}={'ok' if v2.get('ok') else 'KO'}" for k,v2 in pr["canaux"].items())
        sv=f" subv={subv.get('n','?')}/{subv.get('source')}" if subv and subv.get("source")!="aucune" else ""
        print(f"{c['nom']:24s} pdfs={len(pdfs):3d} lus={testes:2d} | {v[:44]:44s} | {ch}{sv} | {r['secs']}s",flush=True)
        json.dump(out,open(os.path.join(SP,"probe_v8_"+os.path.basename(src)),"w"),ensure_ascii=False,indent=1,default=str)
    from collections import Counter
    print("\nRÉCAP v8 :",dict(Counter(x["conclusion"].split(":")[0] for x in out)))
