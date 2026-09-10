"""Sonde M57 v4 — découverte + navigateur + choix du document + lecteur.

Pour chaque commune : site (annuaire), documents (API WordPress, plan du site,
crawl, recherche web, Calameo par navigateur, navigateur si urllib échoue),
puis jusqu'à 20 PDF testés avec le lecteur : entité vérifiée par l'en-tête
courant, nomenclature M14/M57, totaux par fonction lus sur les pages de
détail, OCR de secours. Une commune est « conclue » quand on lit ≥ 8 fonctions
avec un total, ou quand on a la preuve du contraire (aucun document budgétaire
sur le site ni par recherche, ou scan illisible même après OCR).

    python3 probe_m57_v4.py sample1|sample2 [--fast]
"""
import unicodedata, ssl, subprocess, json, re, sys, time, urllib.request, urllib.parse, html as H, os, gzip, subprocess
SP=os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0,SP)
import lecteur_m57 as L
WEB="/Users/daniel/code/open-public-data/.claude/worktrees/page-ville/website"
UA={"User-Agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36","Accept":"*/*","Accept-Language":"fr"}
which=sys.argv[1] if len(sys.argv)>1 else "sample1"
FAST="--fast" in sys.argv

_SSL_LAX=ssl.create_default_context(); _SSL_LAX.check_hostname=False; _SSL_LAX.verify_mode=ssl.CERT_NONE
def get(url,timeout=25,binary=False,maxb=80_000_000):
    req=urllib.request.Request(url,headers=UA)
    try: r=urllib.request.urlopen(req,timeout=timeout)
    except urllib.error.URLError as e:
        # chaîne de certificats incomplète côté mairie (clermont-ferrand.fr) : on lit quand même
        if "CERTIFICATE_VERIFY_FAILED" not in str(e): raise
        r=urllib.request.urlopen(req,timeout=timeout,context=_SSL_LAX)
    with r:
        data=r.read(maxb); ct=r.headers.get("Content-Type","")
        if not binary and data[:2]==b"\x1f\x8b": data=gzip.decompress(data)
        return (data if binary else data.decode(r.headers.get_content_charset() or "utf-8",errors="replace")), ct, r.geturl()

def browser(urls, headed=False):
    """Pages et PDF par Chromium (protections, JS, Calameo)."""
    if not urls: return {}
    outdir=os.path.join(SP,"bf"); os.makedirs(outdir,exist_ok=True)
    js=os.path.join(SP,"browser_fetch.mjs"); tmp=os.path.join(WEB,"_bf_v4.mjs")
    try:
        open(tmp,"w").write(open(js).read())
        r=subprocess.run(["node",tmp,"1" if headed else "0",outdir,*urls],capture_output=True,text=True,timeout=600,cwd=WEB)
        line=[l for l in r.stdout.strip().splitlines() if l.startswith("{")]
        return json.loads(line[-1]) if line else {}
    except Exception as e: return {}
    finally:
        try: os.unlink(tmp)
        except Exception: pass

HREF=re.compile(r'<a[^>]+href=["\']([^"\'#]+)["\'][^>]*>(.*?)</a>',re.I|re.S)
def links(page,base):
    out=[]
    for href,txt in HREF.findall(page):
        txt=H.unescape(re.sub(r"\s+"," ",re.sub(r"<[^>]+>"," ",txt))).strip()
        try: out.append((urllib.parse.urljoin(base,H.unescape(href)),txt))
        except Exception: pass
    return out
KW=re.compile(r"budget|financ|compte[- ]administratif|compte[- ]financier|documents?[- ]budg|\bca[- ]?20\d\d|\bbp[- ]?20\d\d|conseil[- ]municipal|publication|kiosque|d[ée]lib|t[ée]l[ée]charg|documents?\b",re.I)
PDFKW=re.compile(r"compte|budget|\bca\b|\bbp\b|financ|cfu|croisée|fonction|d[ée]lib|conseil|maquette",re.I)
EXT=re.compile(r"calameo|issuu|fliphtml|yumpu",re.I)

def site_for(insee):
    u=("https://api-lannuaire.service-public.fr/api/explore/v2.1/catalog/datasets/api-lannuaire-administration/records?where="
       +urllib.parse.quote(f'code_insee_commune="{insee}" and pivot like "mairie"')+"&limit=3&select=nom,site_internet")
    d=json.loads(get(u)[0])
    for r in d.get("results",[]):
        si=r.get("site_internet")
        if isinstance(si,str):
            try: si=json.loads(si)
            except Exception: si=[{"valeur":si}]
        for x in si or []:
            v=(x.get("valeur") if isinstance(x,dict) else x) or ""
            if v.startswith("http"): return v
    return None
def wp_media(base):
    out={}
    try: probe,ct,_=get(urllib.parse.urljoin(base,"/wp-json/"),timeout=15)
    except Exception: return out
    if "wp/v2" not in probe: return out
    for kw in ["compte administratif","budget","CA 20","BP 20","CFU","compte financier","maquette","finances"]:
        try:
            d,_,_=get(urllib.parse.urljoin(base,f"/wp-json/wp/v2/media?search={urllib.parse.quote(kw)}&per_page=100&media_type=application"),timeout=25)
            for m in json.loads(d):
                u=m.get("source_url") or ""; t=(m.get("title") or {}).get("rendered") or ""
                if u.lower().endswith(".pdf"): out[u]=H.unescape(t)+" "+(m.get("date") or "")[:10]
        except Exception: pass
        time.sleep(0.3)
    return out
def ddg(domain):
    out={}
    for q in [f"site:{domain} compte administratif", f"site:{domain} budget primitif pdf", f"site:{domain} maquette budgétaire"]:
        try:
            h,_,_=get("https://html.duckduckgo.com/html/?q="+urllib.parse.quote(q),timeout=25)
            for m in re.findall(r"uddg=([^\"&]*)",h):
                u=urllib.parse.unquote(m)
                if u.lower().endswith(".pdf") or PDFKW.search(u): out[u]="ddg"
        except Exception: pass
        time.sleep(2.5)
    return out
_GPROFILE=os.environ.get("GPROFILE") or os.path.join(os.path.dirname(os.path.abspath(__file__)),"chrome_profile")
def google(host, nom=None, headed=True):
    """Recherche Google dans un Chromium visible (les moteurs bloquent urllib) :
    trois requêtes par commune, liens résolus, filtrés sur le domaine de la
    mairie + PDF hors domaine dont le nom parle de budget. ~10 s par requête."""
    qs=[f"site:{host} compte administratif", f"site:{host} budget primitif", f"site:{host} maquette budgétaire pdf"]
    if nom: qs.append(f"\"{nom}\" \"compte administratif\" présentation croisée par fonction pdf")
    try:
        p=subprocess.run(["node",os.path.join(os.path.dirname(os.path.abspath(__file__)),"google_search.mjs"),_GPROFILE,*qs],capture_output=True,text=True,timeout=60+40*len(qs))
        d=json.loads(p.stdout.strip().splitlines()[-1])
    except Exception: return {}
    out={}
    for q,v in d.items():
        for u,t in zip(v.get("urls",[]),v.get("titles",[])):
            h=urllib.parse.urlparse(u).netloc.replace("www.","")
            # HORS DOMAINE : source majeure de pollution (le CA de Houilles est
            # remonté pour Sartrouville, Annay-sous-Lens pour Clermont). On ne
            # garde un PDF d'un autre domaine QUE s'il porte le nom de la commune.
            if not h.endswith(host):
                if re.search(r"collectivites-locales\.gouv\.fr|ccomptes\.fr|legifrance|senat\.fr|assemblee-nationale|economie\.gouv|impots\.gouv|amf\.asso|vie-publique|banatic|data\.gouv\.fr",h+u): continue
                if not nom: continue
                fn=re.sub(r"[^a-z0-9]+","",unicodedata.normalize("NFD",nom.lower()).encode("ascii","ignore").decode())
                cible=re.sub(r"[^a-z0-9]+","",unicodedata.normalize("NFD",(u+" "+t).lower()).encode("ascii","ignore").decode())
                if len(fn)<4 or fn not in cible: continue
            if h.endswith(host) or (u.lower().endswith(".pdf") and PDFKW.search(u+" "+t)): out[u]="google: "+t[:60]
    return out
def wayback_pdfs(host, limit=400):
    """Internet Archive : tous les PDF jamais capturés sur le domaine (API CDX),
    filtrés sur les mots du budget. On garde l'URL d'origine et l'horodatage
    de la capture la plus récente ; le fichier se lit via
    web.archive.org/web/<ts>id_/<url> même si le site l'a retiré ou bloque."""
    out={}
    try:
        u=("https://web.archive.org/cdx/search/cdx?url="+urllib.parse.quote(host)+"&matchType=domain&output=json&filter=mimetype:application/pdf"
           "&filter=statuscode:200&fl=original,timestamp&collapse=urlkey&limit="+str(limit))
        d,_,_=get(u,timeout=60)
        rows=json.loads(d)[1:] if d.strip().startswith("[") else []
        for orig,ts in rows:
            if re.search(r"budget|compte[-_ ]?administratif|\bca[-_ ]?20\d\d|\bbp[-_ ]?20\d\d|\bcfu\b|maquette|financ|compte[-_ ]?financier",orig,re.I) and not re.search(r"d[ée]lib|compte[-_ ]?rendu|\bcr[-_]|arr[êe]t[ée]|permis|menu|bulletin|magazine|journal|gazette|participatif",orig,re.I):
                out[orig]=("wayback",ts)
    except Exception: pass
    return out
def wayback_fetch(url, ts):
    try:
        data,ct,fu=get(f"https://web.archive.org/web/{ts}id_/{url}",timeout=90,binary=True)
        return data if data.startswith(b"%PDF") else None
    except Exception: return None

def sitemap_urls(base):
    for path in ["/sitemap.xml","/sitemap_index.xml","/wp-sitemap.xml","/sitemap-index.xml"]:
        try: txt,_,_=get(urllib.parse.urljoin(base,path),timeout=20)
        except Exception: continue
        locs=re.findall(r"<loc>\s*([^<\s]+)\s*</loc>",txt)
        if not locs: continue
        for s2 in [l for l in locs if l.endswith(".xml")][:15]:
            try: locs+=re.findall(r"<loc>\s*([^<\s]+)\s*</loc>",get(s2,timeout=20)[0])
            except Exception: pass
            time.sleep(0.3)
        return locs
    return []
def discover(site):
    home=None; via_browser=False
    try: home,ct,final=get(site)
    except Exception:
        b=browser([site])
        v=b.get(site,{})
        if v.get("kind")=="html":
            home=open(v["file"],encoding="utf-8",errors="replace").read(); final=v.get("final") or site; via_browser=True
        else: return None,{},set(),"injoignable (urllib et navigateur)"
    def fetch_page(u):
        """Une page HTML : urllib, ou le navigateur si le site ne l'accepte pas."""
        if not via_browser:
            page,ct,fu=get(u,timeout=20); return page,ct,fu
        b=browser([u]); v=b.get(u,{})
        if v.get("kind")=="pdf": return "", "application/pdf", v.get("final") or u
        if v.get("kind")!="html": raise RuntimeError("navigateur : échec")
        return open(v["file"],encoding="utf-8",errors="replace").read(), "text/html", v.get("final") or u
    host=urllib.parse.urlparse(final).netloc.replace("www.","")
    same=lambda u: urllib.parse.urlparse(u).netloc.replace("www.","").endswith(host)
    pdfs={}; ext=set(); seen=set()
    if via_browser:
        b=browser([urllib.parse.urljoin(final,"/wp-json/wp/v2/media?search=budget&per_page=100&media_type=application"),
                   urllib.parse.urljoin(final,"/wp-json/wp/v2/media?search=compte&per_page=100&media_type=application")])
        for u,v in b.items():
            if v.get("kind")=="html":
                try:
                    raw=open(v["file"],encoding="utf-8",errors="replace").read()
                    raw=re.sub(r"^.*?(\[.*\]).*$",r"\1",raw,flags=re.S)
                    for m in json.loads(raw):
                        su=m.get("source_url") or ""
                        if su.lower().endswith(".pdf"): pdfs[su]=H.unescape(((m.get("title") or {}).get("rendered") or ""))
                except Exception: pass
    else:
        pdfs.update(wp_media(final))
    sm=sitemap_urls(final)
    for u in sm:
        if u.lower().endswith(".pdf") and PDFKW.search(u): pdfs[u]="sitemap"
    cand=[u for u in sm if KW.search(u)]
    hl=links(home,final)
    for u,t in hl:
        if same(u) and KW.search(t+" "+u): cand.append(u)
        if EXT.search(u): ext.add(u)
    # page-portail (cagnes.fr : deux liens, « Tourisme » / « La Ville ») : le
    # vrai site est un sous-domaine, on le suit comme une page d'accueil
    if len(hl)<=6:
        for u,t in hl:
            if same(u) and urllib.parse.urlparse(u).netloc!=urllib.parse.urlparse(final).netloc:
                try:
                    h2,_,f2=fetch_page(u)
                    for u2,t2 in links(h2,f2):
                        if same(u2) and KW.search(t2+" "+u2): cand.append(u2)
                        if EXT.search(u2): ext.add(u2)
                    pdfs.update(wp_media(f2)); cand.append(f2)
                except Exception: pass
    for path in ["/budget","/finances","/la-mairie/budget","/ma-mairie/budget","/vie-municipale/budget","/mairie/finances","/documents-budgetaires","/budget-et-finances","/publications","/kiosque","/conseil-municipal","/la-mairie/les-finances","/ma-ville/budget","/telechargements","/documents","/vie-municipale/finances","/la-commune/budget"]:
        cand.append(urllib.parse.urljoin(final,path))
    cand=list(dict.fromkeys(sorted(cand,key=lambda u:(0 if re.search(r"budget|financ|compte",u,re.I) else 1))))
    n=0; budget=22 if FAST else 34
    if via_browser:
        # un seul lancement de Chromium pour toutes les pages candidates
        grp=[u for u in cand if same(u)][:budget]
        b=browser(grp); pages_cache={u:v for u,v in b.items()}
        def fetch_page(u):
            v=pages_cache.get(u,{})
            if v.get("kind")=="pdf": return "", "application/pdf", v.get("final") or u
            if v.get("kind")!="html": raise RuntimeError("navigateur : échec")
            return open(v["file"],encoding="utf-8",errors="replace").read(), "text/html", v.get("final") or u
    for u in cand:
        if n>=budget: break
        if u in seen or not same(u): continue
        seen.add(u); n+=1
        try: page,ct,fu=fetch_page(u)
        except Exception: continue
        time.sleep(0.7 if not via_browser else 1.5)
        if "pdf" in ct.lower(): pdfs[fu]="direct"; continue
        for lu,lt in links(page,fu):
            low=lu.lower()
            if low.endswith(".pdf") or ".pdf?" in low or "/download" in low or "telecharger" in low or "/fichier" in low or "/file/" in low:
                if PDFKW.search(lt+" "+lu): pdfs[lu]=lt
            elif EXT.search(lu): ext.add(lu)
            elif same(lu) and re.search(r"budget|financ|compte[- ]administratif|compte[- ]financier|documents?[- ]budg",lt+" "+lu,re.I) and lu not in seen and len(cand)<110: cand.append(lu)
    strong=[u for u in pdfs if re.search(r"compte|budget|\bca\b|\bbp\b|cfu|maquette",u+" "+str(pdfs[u]),re.I)]
    if len(strong)<3:
        g=google(host, nom=None)
        # une page HTML trouvée par Google (« Les finances ») : on la crawle aussi
        for u,t in list(g.items()):
            if u.lower().endswith(".pdf") or ".pdf" in u.lower(): pdfs[u]=t
            elif same(u) and u not in seen:
                try:
                    page,ct,fu=fetch_page(u); seen.add(u)
                    if "pdf" in ct.lower(): pdfs[fu]=t; continue
                    for lu,lt in links(page,fu):
                        low=lu.lower()
                        if (low.endswith(".pdf") or ".pdf?" in low or "/download" in low or "/fichier" in low or "/file/" in low) and PDFKW.search(lt+" "+lu): pdfs[lu]=lt
                        elif EXT.search(lu): ext.add(lu)
                except Exception: pass
    strong=[u for u in pdfs if re.search(r"compte|budget|\bca\b|\bbp\b|cfu|maquette",u+" "+str(pdfs[u]),re.I)]
    if len(strong)<3:
        for u,v in wayback_pdfs(host).items():
            if u not in pdfs: pdfs[u]=v
    return final,pdfs,ext,None

def score(item):
    u,t=item
    # Les séparateurs « _ », « . » et « %20 » empêchaient les frontières de mots
    # de se déclencher : « Annexe_CA_2021 » ne matchait pas \bCA\b et tombait
    # hors de la fenêtre des candidats testés.
    low=re.sub(r"[_.%]+|%20"," ",(u+" "+str(t)).lower()); s=0
    if re.search(r"compte[- ]administratif|\bca\b|cfu|compte[- ]financier",low): s+=5
    if re.search(r"budget[- ]primitif|\bbp\b|maquette",low): s+=3
    for y,w in (("2025",4),("2024",4),("2023",3),("2022",2),("2021",1)):
        if y in low: s+=w; break
    if re.search(r"synth|br[èe]ve|note|pr[ée]sentation|orientation|\brob\b|\bdob\b|d[ée]lib|rapport|proc[èe]s[- ]?verbal|\bpv\b|compte[- ]rendu|ordre du jour|\bodj\b|convocation|r[èe]glement",low): s-=3
    # « annexes du compte administratif » (ce qu'on cherche) ≠ « budget annexe »
    # de l'eau ou de l'assainissement (ce qu'on écarte).
    if L.ANNEXE.search(low) and not re.search(r"principal|g[ée]n[ée]ral|commune\b|ville\b",low): s-=4
    elif re.search(r"annexes?\b",low) and re.search(r"compte|budget|\bca\b|\bbp\b|maquette",low): s+=4
    return -s

def fetch_pdf(u, meta=None):
    if isinstance(meta,tuple) and meta and meta[0]=="wayback":
        data=wayback_fetch(u,meta[1])
        if data: return data
    try:
        data,ct,fu=get(u,timeout=60,binary=True)
        if data.startswith(b"%PDF"): return data
    except Exception: pass
    b=browser([u]); v=b.get(u,{})
    if v.get("kind")=="pdf":
        try: return open(v["file"],"rb").read()
        except Exception: pass
    return None
def calameo_pdf(url):
    m=re.search(r"calameo\.com/(?:read|books)/(\d+)",url)
    if not m: return None
    b=browser([f"https://www.calameo.com/download/{m.group(1)}"]); v=list(b.values())[0] if b else {}
    if v.get("kind")=="pdf": return open(v["file"],"rb").read()
    return None

def quality(a):
    """Ce qui compte d'abord : des fonctions lues SUR le bon document. Un
    compte-rendu au bon nom mais sans fonction ne doit jamais battre une
    maquette qui en lit dix."""
    e=a.get("entite",{}); d=a.get("detail",{})
    ok_ent=bool(e.get("nom_ok",False) and not e.get("epci",False) and not e.get("annexe",False))
    n=d.get("n_fct",0)
    return (1 if (ok_ent and n>=8) else 0, n, 1 if ok_ent else 0, a.get("n_fonctions",0), 0 if a.get("scan") else 1, int(a.get("annee") or 0))

if __name__ == "__main__":
    sample=[ {k:r[k] for k in ("nom","insee","pop","reg","slug")} for r in json.load(open(os.path.join(SP,"probe_results_v2.json")))] if which=="sample1" else json.load(open(os.path.join(SP,f"{which}.json")))
    for c in sample: c.setdefault("reg",c.get("reg_name")); c.setdefault("reg_name",c.get("reg"))
    out=[]
    for c in sample:
        t0=time.time(); r={k:c.get(k) for k in ("nom","insee","pop","slug")}; r["reg"]=c.get("reg") or c.get("reg_name")
        try: site=site_for(c["insee"])
        except Exception: site=None
        r["site"]=site
        if not site: r["conclusion"]="pas de site dans l'annuaire"; out.append(r); print(f"{r['nom']:26s} {r['conclusion']}",flush=True); continue
        final,pdfs,ext,err=discover(site)
        r.update({"site_final":final,"pdfs_trouves":len(pdfs),"lecteurs_externes":len(ext)})
        if err: r["conclusion"]=err; out.append(r); print(f"{r['nom']:26s} {err}",flush=True); continue
        best=None; tested=0; tries=[]
        for u,t in sorted(pdfs.items(),key=score)[:(12 if FAST else 20)]:
            data=fetch_pdf(u)
            if not data: continue
            tested+=1
            a=L.analyse(data,c["nom"],ocr=False,filename=u.rsplit("/",1)[-1]); a.update({"url":u,"lien":str(t)[:70],"ko":len(data)//1024})
            tries.append({"url":u[-70:],"entete":a.get("entite",{}).get("entete",""),"n_fct":a["detail"]["n_fct"],"n_rows":a.get("n_fonctions"),"scan":a.get("scan"),"annee":a.get("annee")})
            if best is None or quality(a)>quality(best): best=a
            if quality(best)[0]==1: break
            time.sleep(0.5)
        if (best is None or best["detail"]["n_fct"]<8) and ext:
            for eu in sorted(ext)[:5]:
                data=calameo_pdf(eu)
                if data:
                    a=L.analyse(data,c["nom"],ocr=False,filename="calameo.pdf"); a.update({"url":eu,"lien":"calameo","ko":len(data)//1024})
                    tries.append({"url":eu[-50:],"entete":a.get("entite",{}).get("entete",""),"n_fct":a["detail"]["n_fct"],"scan":a.get("scan"),"annee":a.get("annee")})
                    if best is None or quality(a)>quality(best): best=a
                    if quality(best)[0]==1: break
        # OCR de secours sur le meilleur candidat d'entité correcte, ou sur le scan le plus gros
        if best is not None and best["detail"]["n_fct"]<8 and not FAST:
            try:
                data=fetch_pdf(best["url"])
                if data:
                    a=L.analyse(data,c["nom"],ocr=True,filename=best["url"].rsplit("/",1)[-1]); a.update({"url":best["url"],"lien":best["lien"],"ko":best["ko"]})
                    if quality(a)>quality(best): best=a
            except Exception: pass
        r["pdf"]={k:best.get(k) for k in ("url","lien","ko","pages","scan","ocr","annee","nomenclature","entite","annexes")} if best else None
        r["fonctions"]=best["detail"]["detail"] if best else None
        r["essais"]=tries[:8]; r["pdfs_testes"]=tested
        if best is None: r["conclusion"]="aucun PDF budgétaire"+(f" ({len(ext)} lecteurs externes)" if ext else "")
        else:
            q=quality(best); d=best["detail"]
            if q[0]==1 and d["n_fct"]>=8: r["conclusion"]="CONCLU : fonction lue"
            elif q[0]==1 and d["n_fct"]>=5: r["conclusion"]="partiel : fonction lue en partie"
            elif q[0]==0 and d["n_fct"]>=8: r["conclusion"]="document d'une autre entité (EPCI/annexe) lisible"
            elif best.get("scan"): r["conclusion"]="scan illisible même après OCR"
            else: r["conclusion"]="documents trouvés, présentation par fonction non lue"
        r["secs"]=round(time.time()-t0); out.append(r)
        b=r["pdf"] or {}
        print(f"{r['nom']:26s} {r['pop']:>7} pdfs={len(pdfs):3d} testés={tested:2d} {r['conclusion']:52s} fct={best['detail']['n_fct'] if best else '-'} an={b.get('annee')} ent={b.get('entite',{}).get('entete','')[:38] if b else ''} {r['secs']}s",flush=True)
        json.dump(out,open(os.path.join(SP,f"probe_v6_{which}.json" if which not in ("sample1","sample2") else f"probe_v4_{which}.json"),"w"),ensure_ascii=False,indent=1,default=str)
    from collections import Counter
    print("\nRÉCAP v4",which,":",dict(Counter(r.get("conclusion") for r in out)))
