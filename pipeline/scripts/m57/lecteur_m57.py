"""Lecteur de la présentation croisée par fonction d'un document budgétaire.

- Vérifie l'entité en couverture : la commune, pas l'agglomération, le CCAS ou
  un budget annexe (lotissements, assainissement, eau, régies).
- Connaît les deux nomenclatures : M14 (0-9, jusqu'en 2023 pour la plupart) et
  M57 (0-8, obligatoire depuis 2024, adoptée plus tôt par certaines).
- Repère les pages « vue d'ensemble » de la présentation croisée et y lit, pour
  chaque fonction, le libellé et les montants qui suivent.
- Détecte un texte d'OCR pourri et refait l'OCR avec tesseract si demandé.
Rien n'est inventé : on garde les libellés et montants tels qu'ils sont lus.
"""
import re, subprocess, tempfile, os, hashlib, pickle, unicodedata
import fitz


# Libellés en clair des codes de fonction (M57 ; « 01 » et les sous-rubriques
# n'existent que dans la présentation croisée du CFU)
LIB_FONCTION={"01":"Opérations non ventilables","0":"Services généraux","0-5":"Gestion des fonds européens",
 "1":"Sécurité","2":"Enseignement, formation, apprentissage","3":"Culture, vie sociale, jeunesse, sports",
 "4":"Santé et action sociale","4-3":"APA","4-4":"RSA","5":"Aménagement des territoires et habitat",
 "6":"Action économique","7":"Environnement","8":"Transports","9":"Fonction en réserve"}
M14={"0":r"services g[ée]n[ée]raux","1":r"s[ée]curit[ée]","2":r"enseignement","3":r"culture","4":r"sport","5":r"interventions sociales|action sociale|sant[ée]","6":r"famille","7":r"logement","8":r"am[ée]nagement","9":r"action [ée]conomique"}
M57={"0":r"services g[ée]n[ée]raux","1":r"s[ée]curit[ée]","2":r"enseignement","3":r"culture","4":r"sant[ée]|action sociale","5":r"am[ée]nagement","6":r"action [ée]conomique","7":r"environnement","8":r"transports?"}
ANNEXE=re.compile(r"\b(lotissements?|assainissement|eau|r[ée]gies?|ccas|caisse des [ée]coles|camping|zac|cimeti[èe]re|pompes fun[èe]bres|parkings?|stationnement|port|abattoirs?|for[êe]t|chauffage|transports?|budget annexe)\b",re.I)
EPCI=re.compile(r"communaut[ée]|agglom|m[ée]tropole|\bcc\b|\bca\b\s+(du|de|des)|sivom|sivu|syndicat|\bepci\b|pays\b|com agglo|\bcu\b",re.I)
AMT=re.compile(r"-?\d{1,3}(?:[   .]\d{3})+(?:,\d{2})?|-?\d{4,}(?:,\d{2})?|\b0,00\b")

FR=set("de la le les des et du en un une à au aux pour par sur dans total dépenses recettes budget commune ville section fonction chapitre article libellé montant réalisations résultat compte administratif".split())
def french_rate(t):
    toks=re.findall(r"\S{2,}",t.lower())
    if len(toks)<40: return 0.0
    return sum(1 for w in toks if w.strip(".,;:()") in FR)/len(toks)

def garbage_ratio(t):
    toks=re.findall(r"[A-Za-zÀ-ÿ]{3,}",t)
    if len(toks)<30: return 1.0
    bad=sum(1 for w in toks if re.search(r"[|{}\[\]]|[A-ZÀ-Ý][a-zà-ÿ]+[A-ZÀ-Ý]|[a-z][A-Z]{2}",w) or re.search(r"(.)\1\1",w))
    return bad/len(toks)

def ocr_pages(doc, idx):
    """Texte OCR d'un lot de pages, par le même moteur que ocr_words (orientation
    choisie sur le vocabulaire, psm 4, cache) ; les lignes viennent de tesseract."""
    out={}
    for i in idx:
        try:
            words=ocr_words(doc,i)
            out[i]="\n".join(t for _,_,t in _lines(doc[i],words=words)) if words else ""
        except Exception: out[i]=""
    return out

def entity_check(pages, commune, filename=""):
    heads=[]
    for p in pages[1:5]:
        ls=[l.strip() for l in p.split("\n") if l.strip()]
        h=next((l for l in ls[:3] if len(l)>=15),ls[0] if ls else "")
        if h: heads.append(h)
    # Maquette en annexe d'une délibération (Clermont-Ferrand : 681 p., 30 pages
    # de délibération avant) : son en-tête courant « … - CA - 2018 » n'apparaît
    # qu'après. On le cherche sur les 60 premières pages et il PRIME.
    MAQ=re.compile(r"-\s*(CA|BP|BS|DM|CFU)\s*-\s*20\d\d|budget principal|budget primitif|compte administratif",re.I)
    for p in pages[1:60]:
        ls=[l.strip() for l in p.split("\n") if l.strip()]
        for l in ls[:3]:
            if len(l)>=15 and MAQ.search(l) and re.search(r"(commune|ville|mairie|collectivit)",l,re.I):
                heads.insert(0,l); break
        if heads and MAQ.search(heads[0]) and re.search(r"(commune|ville|mairie|collectivit)",heads[0],re.I): break
    cover=("\n".join(pages[:3])+"\n"+" | ".join(heads)+"\n"+filename).lower()
    head=(" | ".join(heads)+" "+filename).lower()
    def flat(t): return re.sub(r"[^a-z0-9 ]"," ",unicodedata.normalize("NFD",t.lower()).encode("ascii","ignore").decode())
    nom=commune.lower(); fn=re.sub(r"\s+"," ",flat(nom)).strip(); fc=re.sub(r"\s+"," ",flat(cover))
    nom_ok=fn in fc or fn.replace(" ","") in fc.replace(" ","")
    # l'en-tête courant des maquettes dit « COMMUNE DE X - BUDGET PRINCIPAL - CA - 2023 »
    fh=re.sub(r"\s+"," ",flat(head))
    epci=bool(EPCI.search(head)) and not re.search(rf"(commune|ville|mairie)\s+d[e ]\s*{re.escape(fn)}",fh)
    annexe=bool(ANNEXE.search(head)) and not re.search(r"budget principal",head)
    principal=bool(re.search(r"budget principal|budget general|budget g[ée]n[ée]ral",head))
    # L'en-tête courant nomme l'entité (« VILLE DE VENCE - … ») : si c'est une
    # autre commune que la nôtre, le document est rejeté même si notre nom
    # apparaît dans les premières pages (une voisine citée, une adresse).
    autre=None
    for m in re.finditer(r"(?:commune|ville|mairie)\s+d[e'u]?\s*([a-z0-9 ]{3,40}?)(?=\s+-\s|\s+budget|\s+\d|\s*$|\s*\|)",fh):
        cand=m.group(1).strip()
        if fn in cand or fn.replace(" ","") in cand.replace(" ","") or cand in fn: autre=None; break
        autre=cand
    if autre: nom_ok=False
    return {"nom_ok":nom_ok,"epci":epci,"annexe":annexe,"principal":principal,"autre":autre,"entete":heads[0][:80] if heads else ""}

def is_sommaire(text):
    lines=[l for l in text.split("\n") if l.strip()]
    if not lines: return False
    end_num=sum(1 for l in lines if re.fullmatch(r"\s*\d{1,4}\s*",l))
    return bool(re.search(r"^\s*sommaire\s*$",text,re.I|re.M)) or end_num>len(lines)*0.3

def real_amounts(f):
    """Nombre de fonctions dont un montant lu est un vrai montant (≥ 1 000)."""
    n=0
    for v in f.values():
        for a in v["montants"]:
            try:
                x=float(a.replace(" ","").replace(" ","").replace(".","").replace(",","."))
                if abs(x)>=1000: n+=1; break
            except ValueError: pass
    return n

def read_fonctions(text):
    """Pour chaque nomenclature, les fonctions dont le code+libellé sont lus,
    avec le premier montant qui suit sur la ligne ou les 3 suivantes."""
    t=re.sub(r"[ \t  ]+"," ",text); lines=t.split("\n")
    res={}
    for nomen,labels in (("M57",M57),("M14",M14)):
        found={}
        for code,lab in labels.items():
            pat=re.compile(rf"^\s*(?:fonction\s*)?{code}\s*[-–:.]?\s*({lab})",re.I)
            pat2=re.compile(rf"^\s*(?:A[12]\.9[03]{code}|9[03]{code})\b.*?(?:fonction\s*{code}\s*[-–]\s*)?({lab})",re.I)
            for j,l in enumerate(lines):
                m=pat.match(l) or pat2.match(l)
                if not m:
                    # code seul sur une ligne, libellé sur la suivante
                    if re.match(rf"^\s*(?:fonction\s*)?{code}\s*[-–:.]?\s*$",l,re.I) and j+1<len(lines) and re.match(rf"^\s*({lab})",lines[j+1],re.I): m=True
                    else: continue
                window=" ".join(lines[j:j+4])
                amts=[a for a in AMT.findall(window) if a not in ("0,00",)]
                found[code]={"ligne":l.strip()[:60],"montants":amts[:4]}
                break
        res[nomen]=found
    best=max(res.items(),key=lambda kv:len(kv[1]))
    return {"nomenclature":best[0],"fonctions":best[1],"n":len(best[1])}

def read_fonctions_xy(page):
    """Lecture par coordonnées : les maquettes M57 mettent le libellé et les
    montants dans des colonnes séparées, que le texte linéaire éloigne. On
    regroupe les mots par ligne (même ordonnée) et on prend les nombres à droite
    du libellé."""
    words=page.get_text("words")  # x0,y0,x1,y1,text,block,line,word
    rows={}
    for w in words:
        y=round((w[1]+w[3])/2/3)*3
        rows.setdefault(y,[]).append(w)
    res={}
    for nomen,labels in (("M57",M57),("M14",M14)):
        found={}
        for y in sorted(rows):
            ws=sorted(rows[y],key=lambda w:w[0]); txt=" ".join(w[4] for w in ws)
            for code,lab in labels.items():
                if code in found: continue
                m=re.search(rf"(?:^|\s)(?:fonction\s*)?{code}\s*[-–:.]?\s*({lab})",txt,re.I) or re.search(rf"(?:A[12]\.)?9[03]{code}\b[^0-9]{{0,40}}({lab})",txt,re.I)
                if not m: continue
                lx=ws[0][0]+txt.find(m.group(0))*4.5  # position approximative du libellé
                nums=[]
                for w in ws:
                    t=w[4].replace("\u202f"," ").replace("\xa0"," ")
                    if re.fullmatch(r"-?\d{1,3}(?:[ .]\d{3})*(?:,\d{2})?|-?\d{4,}(?:,\d{2})?|0,00",t): nums.append(t)
                # les nombres d'une ligne de tableau sont souvent des mots séparés : recoller « 1 234 567,00 »
                joined=" ".join(w[4] for w in ws if w[0]>ws[0][0])
                nums2=re.findall(r"-?\d{1,3}(?:[  ]\d{3})+(?:,\d{2})?|-?\d{4,}(?:,\d{2})?",joined)
                amts=nums2 if len(nums2)>=len(nums) else nums
                found[code]={"ligne":txt[:70],"montants":amts[:6]}
        res[nomen]=found
    best=max(res.items(),key=lambda kv:len(kv[1]))
    return {"nomenclature":best[0],"fonctions":best[1],"n":len(best[1])}

NUM=re.compile(r"^-?\d{1,3}(?:[  \u202f\xa0]\d{3})*(?:[.,]\d{2})?$|^-?\d{4,}(?:[.,]\d{2})?$")
def _dir_page(page):
    """Direction d'écriture dominante. Les maquettes M57 « présentation détaillée »
    sont en PAYSAGE (/Rotate 90) : le texte court verticalement dans le repère,
    une ligne visuelle partage donc le même x, pas le même y."""
    try:
        d=page.get_text("dict"); from collections import Counter
        c=Counter()
        for b in d.get("blocks",[]):
            for l in b.get("lines",[]):
                dx,dy=l.get("dir",(1,0)); c[(round(dx),round(dy))]+=len(l.get("spans",[]))
        return c.most_common(1)[0][0] if c else (1,0)
    except Exception: return (1,0)

def _lines(page, tol=2.8, words=None):
    """Regroupe les mots en lignes par tolérance verticale : un nombre décalé
    d'un pixel restait séparé de son libellé avec un arrondi."""
    src=words if words is not None else page.get_text("words")
    # Sur une page tournée, « même ligne » veut dire même x ; l'ordre de lecture
    # suit y décroissant (dir (0,-1)) ou croissant (dir (0,1)).
    dirv=(1,0) if words is not None else _dir_page(page)
    if dirv in ((0,-1),(0,1)):
        sgn=-1 if dirv==(0,-1) else 1
        key=lambda w:((w[0]+w[2])/2, sgn*(w[1]+w[3])/2)
        pos=lambda w:(w[0]+w[2])/2
        along=lambda w:sgn*(w[1]+w[3])/2
    else:
        key=lambda w:((w[1]+w[3])/2, w[0])
        pos=lambda w:(w[1]+w[3])/2
        along=lambda w:w[0]
    ws=sorted(src,key=key)
    lines=[]
    if words is not None and any(w[5:8]!=(0,0,0) for w in ws):
        # Mots OCR : tesseract a déjà regroupé les lignes en tolérant l'inclinaison
        # du scan (une ligne penchée de 7 pt sur la largeur cassait la tolérance).
        by={}
        for w in ws: by.setdefault(w[5:8],[]).append(w)
        lines=sorted(by.values(),key=lambda ln:sum((w[1]+w[3])/2 for w in ln)/len(ln))
    else:
        cur=[]; cy=None
        for w in ws:
            y=pos(w)
            if cy is None or abs(y-cy)<=tol: cur.append(w); cy=y if cy is None else (cy*len(cur)+y)/(len(cur)+1)
            else: lines.append(cur); cur=[w]; cy=y
        if cur: lines.append(cur)
    out=[]
    for ln in lines:
        ln=sorted(ln,key=along); toks=[]
        for w in ln:
            t=w[4].replace("\u202f"," ").replace("\xa0"," ")
            # « 77 187 270.04 » arrive en trois mots OCR : on recolle les groupes
            # de trois chiffres, décimale à la virgule ou au point
            a0,a1=(along(w),along(w)+ (w[2]-w[0] if dirv==(1,0) else w[3]-w[1]))
            if toks and re.fullmatch(r"\d{3}(?:[,.]\d{2})?",t) and re.fullmatch(r"-?\d{1,3}(?:[ ]\d{3})*",toks[-1][0]) and a0-toks[-1][2]<6:
                toks[-1]=(toks[-1][0]+" "+t,toks[-1][1],a1)
            else: toks.append((t,a0,a1))
        y=sum(pos(w) for w in ln)/len(ln)
        out.append((y,toks," ".join(t for t,_,_ in toks)))
    return out
def _to_float(a):
    t=a.replace(" ","").replace("\u202f","").replace("\xa0","")
    m=re.fullmatch(r"(-?)(\d[\d.]*?)(?:[.,](\d{2}))?",t)
    if not m: return None
    sign,ent,dec=m.groups(); ent=ent.replace(".","")
    if not ent.isdigit(): return None
    try: return float(f"{sign}{ent}.{dec or '00'}")
    except ValueError: return None
def _tess_lang():
    try:
        langs=subprocess.run(["tesseract","--list-langs"],capture_output=True,text=True,timeout=20).stdout
        return "fra" if re.search(r"^fra$",langs,re.M) else "eng"
    except Exception: return "eng"
_LANG=_tess_lang()
_OCR_DIR=os.path.join(os.path.dirname(os.path.abspath(__file__)),"ocr_cache"); os.makedirs(_OCR_DIR,exist_ok=True)
def ocr_words(doc, i, dpi=200):
    key=hashlib.md5(("r7"+doc[i].get_text()[:300]+str(doc[i].rect)+str(len(doc))+str(i)).encode()).hexdigest()
    cp=os.path.join(_OCR_DIR,key+".pkl")
    if os.path.exists(cp):
        try: return pickle.load(open(cp,"rb"))
        except Exception: pass
    words=_ocr_words(doc,i,dpi)
    if words:   # jamais mettre en cache un échec
        try: pickle.dump(words,open(cp,"wb"))
        except Exception: pass
    return words
_VOCAB=re.compile(r"\b(fonction|total|d[ée]penses|recettes|libell[ée]|budget|exercice|commune|ville|services|g[ée]n[ée]ral\w*|administration|section|investissement|fonctionnement|op[ée]rations|chapitre|article|montant|vote|pr[ée]sentation|crois[ée]e|annexes|solde|restes|r[ée]aliser)\b",re.I)
def _ocr_words(doc, i, dpi=200):
    """OCR tesseract d'une page → liste de mots (x0,y0,x1,y1,texte) dans le
    repère de la page, en essayant 0°, 180°, 90° et 270° et en gardant l'orientation
    qui donne le plus de mots français."""
    import csv, io
    best=None
    for rot in (0,90,270,180):   # 180 : scans recto-verso, une page sur deux à l'envers
        try:
            mat=fitz.Matrix(dpi/72,dpi/72).prerotate(rot)
            pix=doc[i].get_pixmap(matrix=mat)
            with tempfile.NamedTemporaryFile(suffix=".png",delete=False) as f: pix.save(f.name); png=f.name
            tsv=subprocess.run(["tesseract",png,"-","-l",_LANG,"--psm","4","tsv"],capture_output=True,text=True,timeout=120).stdout
            os.unlink(png)
        except Exception: continue
        words=[]; score=0
        for row in csv.DictReader(io.StringIO(tsv),delimiter="\t"):
            t=(row.get("text") or "").strip().strip("|[]‘’'`")
            if not t or row.get("conf") in (None,"-1"): continue
            try: x,y,w,h=int(row["left"]),int(row["top"]),int(row["width"]),int(row["height"])
            except Exception: continue
            sc=72/dpi
            try: lid=(int(row["block_num"]),int(row["par_num"]),int(row["line_num"]))
            except Exception: lid=(0,0,0)
            words.append((x*sc,y*sc,(x+w)*sc,(y+h)*sc,t)+lid)
        # Une page à l'envers produit plein de faux mots (« S34NLONELSVEANIA »)
        # mais aucun montant ni aucun mot du vocabulaire budgétaire : c'est
        # sur ces deux signaux que l'on choisit l'orientation.
        txt=" ".join(w[4] for w in words)
        score=len(_VOCAB.findall(txt))+2*len(re.findall(r"\d{1,3}(?: \d{3})+[,.]\d\d",txt))
        if best is None or score>best[0]: best=(score,words)
        if score>=40: break
    return best[1] if best else []

def read_detail_pages(doc, max_pages=1200, ocr=False):
    """Maquette M57/M14 : chaque fonction a une page « FONCTION N – libellé » dans
    la présentation croisée, section fonctionnement puis investissement. On lit
    le nombre de la ligne DEPENSES (et RECETTES) situé sous la colonne « Total »
    de l'en-tête ; une fonction qui s'étale sur plusieurs pages n'a ce total que
    sur la dernière, les autres pages sont ignorées."""
    res={"fct":{},"inv":{}}
    n=min(len(doc),max_pages); cur_sec=None
    ocr_cache={}
    if ocr:
        # Sur un scan, le texte embarqué est trop pourri pour désigner les
        # pages : on OCRise d'abord celles qui parlent de fonction, puis toutes
        # les autres en partant de la fin (les annexes, donc la présentation
        # croisée, sont en fin de document), dans la limite de 80 pages (120 sans texte embarqué).
        strict=[i for i in range(n) if re.search(r"fonction\s*\d|A[12]\.9\d\d|41\.9\d\d|pr[ée]sentation crois",doc[i].get_text(),re.I)]
        rest=[i for i in range(n-1,-1,-1) if i not in strict]
        todo=set((strict+rest)[:(120 if not strict else 80)])
    for i in range(n):
        txt=doc[i].get_text()
        if ocr:
            if i not in todo: continue
            words=ocr_words(doc,i); ocr_cache[i]=words; txt=" ".join(w[4] for w in words)
        if re.search(r"d[ée]tail\s+fonctionnement|section de fonctionnement",txt[:600],re.I): cur_sec="fct"
        if re.search(r"d[ée]tail\s+investissement|section d.investissement",txt[:600],re.I): cur_sec="inv"
        if not re.search(r"fonction\s*[\dOo]\b",txt,re.I): continue
        lines=_lines(doc[i],words=ocr_cache.get(i))
        top=" ".join(l[2] for l in lines[:12])
        m=re.search(r"\bfonction\s*([\dOo])\b\s*[–—\-:.]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ,'’\-]{2,60})?",top,re.I)
        if not m: continue
        code=m.group(1).replace("O","0").replace("o","0")
        label=re.sub(r"\s+"," ",m.group(2)).strip() if m.group(2) else ("fonction "+code)
        sec="inv" if re.search(r"investissement",top,re.I) else "fct" if re.search(r"fonctionnement",top,re.I) else (cur_sec or "?")
        # Le total d'une fonction est la somme de ses colonnes : c'est donc le
        # plus grand nombre de la ligne DEPENSES, même sur une page de suite où
        # l'en-tête « Total » n'est pas répété.
        # Colonne TOTAL : si l'en-tête la nomme, on prend le nombre sous elle
        # (l'OCR peut lire « 45 754 066 » pour « 15 754 066 » dans une autre
        # colonne et fausser le max) ; sinon le plus grand nombre de la ligne.
        tx=None
        for y,toks,t in lines[:16]:
            for a,x0,x1 in toks:
                if re.fullmatch(r"TOTAL|Total",a): tx=(x0+x1)/2
        # Deux mises en page coexistent. (a) « présentation croisée » M14 : une
        # colonne Total qui répète le total de la fonction sur chaque page → on
        # la lit et on garde le MAX entre pages. (b) « présentation détaillée »
        # M57 : pas de colonne Total, les colonnes sont les sous-fonctions →
        # le total est la SOMME de la ligne, et il faut ADDITIONNER les pages
        # de suite (elles portent d'autres sous-fonctions).
        def pick(toks):
            nums=[(_to_float(a),(x0+x1)/2) for a,x0,x1 in toks if NUM.match(a)]
            nums=[(v,x) for v,x in nums if v is not None]
            if not nums: return None
            if tx is not None:
                v,x=min(nums,key=lambda q:abs(q[1]-tx))
                if abs(x-tx)<60: return v
            return round(sum(v for v,_ in nums),2)
        dep=rec=None
        for y,toks,t in lines:
            if dep is None and re.match(r"^[^A-Za-z0-9]{0,3}\s*(?:[il]\s+)?(DEPENSES|D[ÉEée]PENSES|D[ée]penses)\b",t): dep=pick(toks)
            elif rec is None and re.match(r"^[^A-Za-z0-9]{0,3}\s*(?:[il]\s+)?(RECETTES|Recettes)\b",t): rec=pick(toks)
            if dep is not None and rec is not None: break
        # Secours (scans) : la ligne DEPENSES est sur fond grisé et l'OCR la rend
        # illisible, mais les lignes d'articles au-dessus se lisent. Le total de
        # la fonction est la somme de ses articles : on additionne, ligne par
        # ligne, jusqu'à la ligne RECETTES (ou la fin), en prenant la colonne
        # Total si l'en-tête en a une, sinon toutes les colonnes.
        rows_sum=None
        if dep is None:
            tx=None
            for y,toks,t in lines[:16]:
                for a,x0,x1 in toks:
                    if re.fullmatch(r"TOTAL|Total",a): tx=(x0+x1)/2
            acc=0.0; seen_rows=0
            for y,toks,t in lines:
                if re.match(r"^[^A-Za-z0-9]{0,3}\s*(?:[il]\s+)?(RECETTES|Recettes)\b",t): break
                if not re.match(r"^[|\[\s]*\d{2,7}\b",t): continue
                body=toks[1:] if re.fullmatch(r"[|\[]*\d{2,7}",toks[0][0]) else toks
                nums=[(_to_float(a),(x0+x1)/2) for a,x0,x1 in body if NUM.match(a)]
                nums=[(v,x) for v,x in nums if v is not None]
                if not nums: continue
                if tx is not None:
                    v,x=min(nums,key=lambda q:abs(q[1]-tx)); val=v if abs(x-tx)<60 else None
                else: val=sum(v for v,_ in nums)
                if val is not None: acc+=val; seen_rows+=1
            if seen_rows>=1: rows_sum=round(acc,2)
        if dep is None and rec is None and rows_sum is None: continue
        res.setdefault(sec,{})
        prev=res[sec].get(code)
        cumul = tx is None   # pas de colonne Total → les pages s'additionnent
        if prev is None: res[sec][code]={"libelle":label[:60],"dep":dep,"rec":rec,"page":i,"cumul":cumul,"somme_articles":rows_sum or 0.0,"pages_sommees":1 if rows_sum is not None else 0}
        else:
            if dep is not None:
                if prev.get("dep") is None: prev["dep"]=dep; prev["page"]=i
                elif cumul and prev.get("cumul"): prev["dep"]=round(prev["dep"]+dep,2)
                elif dep>prev["dep"]: prev["dep"]=dep; prev["page"]=i
            if rec is not None:
                if prev.get("rec") is None: prev["rec"]=rec
                elif cumul and prev.get("cumul"): prev["rec"]=round(prev["rec"]+rec,2)
                elif rec>prev["rec"]: prev["rec"]=rec
            if rows_sum is not None: prev["somme_articles"]=round(prev.get("somme_articles",0.0)+rows_sum,2); prev["pages_sommees"]=prev.get("pages_sommees",0)+1
    # là où la ligne DEPENSES manque, la somme des articles fait foi (marquée)
    for sec in res:
        for code,v in res[sec].items():
            if v.get("dep") is None and v.get("pages_sommees",0)>0 and v.get("somme_articles",0)>0:
                v["dep"]=v["somme_articles"]; v["dep_source"]="somme des articles"
    n_fct=sum(1 for v in res.get("fct",{}).values() if v.get("dep") is not None)
    n_inv=sum(1 for v in res.get("inv",{}).values() if v.get("dep") is not None)
    return {"detail":res,"n_fct":n_fct,"n_inv":n_inv,"total_fct":round(sum(v["dep"] for v in res.get("fct",{}).values() if v.get("dep")),2)}

def analyse(data, commune, ocr=True, filename=""):
    try: doc=fitz.open(stream=data,filetype="pdf")
    except Exception as e: return {"err":str(e)[:60]}
    n=len(doc); pages=[doc[i].get_text() for i in range(n)]
    chars=sum(len(p) for p in pages); scan=chars<150*max(1,n)
    ent=entity_check(pages,commune,filename)
    # pages candidates : présentation croisée / vue d'ensemble / fonction
    key=re.compile(r"pr[ée]sentation crois[ée]e|vue d.ensemble|par fonction|fonction\s*[0-9]\b|^\s*[0-9]\s*[-–]\s*(services g[ée]n[ée]raux|s[ée]curit[ée])",re.I|re.M)
    cand=[i for i,p in enumerate(pages) if key.search(p)]
    gr=sum(garbage_ratio(pages[i]) for i in cand[:5])/max(1,len(cand[:5])) if cand else 1.0
    fr=sum(french_rate(pages[i]) for i in range(1,min(n,12)))/max(1,min(n,12)-1)
    if fr<0.04: gr=max(gr,0.6)   # presque aucun mot français lisible : OCR embarqué pourri
    used_ocr=False
    if ocr and (scan or gr>0.35):
        idx=cand[:12] if cand else list(range(min(n,30)))
        for i,t in ocr_pages(doc,idx).items():
            if len(t)>len(pages[i])*0.8 or scan: pages[i]=t
        used_ocr=True
        cand=[i for i,p in enumerate(pages) if key.search(p)]
        if not ent.get("nom_ok"): ent=entity_check(pages,commune,filename)   # scan : l'en-tête courant vient de l'OCR
    best={"n":0,"reels":0}; best_page=None
    for i in cand[:40]:
        if is_sommaire(pages[i]): continue
        r=read_fonctions(pages[i]); r["reels"]=real_amounts(r["fonctions"])
        try:
            rx=read_fonctions_xy(doc[i]); rx["reels"]=real_amounts(rx["fonctions"])
            if (rx["reels"],rx["n"])>(r["reels"],r["n"]): r=rx
        except Exception: pass
        if r["reels"]<5:
            try:
                for tb in doc[i].find_tables().tables:
                    txt="\n".join(" ".join(str(c) for c in row if c) for row in tb.extract())
                    r2=read_fonctions(txt); r2["reels"]=real_amounts(r2["fonctions"])
                    if (r2["reels"],r2["n"])>(r["reels"],r["n"]): r=r2
            except Exception: pass
        if (r["reels"],r["n"])>(best["reels"],best["n"]): best,best_page=r,i
        if best["reels"]>=7: break
    det=read_detail_pages(doc)
    # CFU : la présentation croisée est un tableau « vue d'ensemble » (colonnes =
    # fonctions) et non des pages par fonction → troisième lecteur
    if det["n_fct"]<5:
        try:
            cfu=read_croisee_ensemble(doc)
            if cfu["n_fct"]>=5 or cfu["n_inv"]>=5:
                det={"detail":{"fct":{k:{"libelle":LIB_FONCTION.get(k,"fonction "+k),"dep":v["total"],"rec":v.get("recettes"),"nature":v.get("nature"),"page":cfu["pages"][0] if cfu["pages"] else None} for k,v in cfu["fct"].items() if v.get("total") is not None},
                                "inv":{k:{"libelle":LIB_FONCTION.get(k,"fonction "+k),"dep":v["total"],"rec":v.get("recettes"),"nature":v.get("nature")} for k,v in cfu["inv"].items() if v.get("total") is not None}},
                     "n_fct":cfu["n_fct"],"n_inv":cfu["n_inv"],
                     "total_fct":cfu["totaux_lus"]["fct"],"format":"CFU vue d'ensemble","controle_pct":cfu["controle_pct"]}
        except Exception: pass
    # OCR de secours : si le détail par fonction n'est pas lu alors que le
    # document ressemble à une maquette (le texte embarqué, même pourri, garde
    # des fragments « FONCTION », « A1.9xx », « IV »), on refait l'OCR des pages
    # qui en parlent — au plus 80 pages.
    maquette=sum(1 for p in pages if re.search(r"fonction|A[12]\.9|41\.9|pr[ée]sentation crois",p,re.I))>=3
    if ocr and det["n_fct"]<5 and n<=400 and (scan or gr>0.3 or maquette):
        det2=read_detail_pages(doc,ocr=True,max_pages=n)   # jamais tronquer : les annexes sont en fin de document
        if det2["n_fct"]>det["n_fct"]: det=det2; used_ocr=True
    year=None
    m=re.search(r"(?:exercice|compte administratif|budget primitif|compte financier unique|\bCA\b|\bBP\b|\bCFU\b)\s*[:\-]?\s*(20[12]\d)","\n".join(pages[:4]),re.I)
    year=m.group(1) if m else (max(re.findall(r"\b(20[12]\d)\b","\n".join(pages[:4]))) if re.findall(r"\b(20[12]\d)\b","\n".join(pages[:4])) else None)
    ann={k:any(re.search(rx,p,re.I) for p in pages) for k,rx in {"subventions":r"subventions? vers[ée]es|concours attribu[ée]s|liste des (?:concours|subventions)","dette":r"[ée]tat de la dette|encours de (?:la )?dette|r[ée]partition.*emprunts","ap_cp":r"autorisations? de programme|AP/CP"}.items()}
    return {"pages":n,"scan":scan,"garbage":round(gr,2),"ocr":used_ocr,"entite":ent,"annee":year,"nomenclature":best.get("nomenclature"),"n_fonctions":best["n"],"montants_reels":best.get("reels",0),"page":best_page,"fonctions":best.get("fonctions",{}),"annexes":ann,"cand_pages":cand[:8],"detail":det}


# ---------------------------------------------------------------------------
# B1.7 — « Liste des concours attribués à des tiers en nature ou en subventions »
# (art. L2313-1 CGCT). C'est la liste NOMINATIVE des subventions : bénéficiaire,
# montant, objet. Présente même dans des maquettes qui n'ont pas la présentation
# par fonction (Châteauneuf-les-Martigues 2021 : 76 lignes, 1,13 M€, sur une
# couche texte de scanner). Lue sur texte embarqué ou sur OCR selon la page.
# M14 : « B1.7 – Liste des concours attribués à des tiers en nature ou en
# subventions ». M57 : la même annexe s'appelle « B8 – Subventions versées »
# et « B1.7 » y désigne… « État de la dette – Autres dettes ». On reconnaît
# donc l'annexe à son TITRE, jamais à son code.
B17_PAGE=re.compile(r"concours attr|attribu[ée]s? [àa] des tiers|liste des concours|subventions? vers[ée]es?",re.I)
# (pas « engagements donnés » : c'est le titre de la SECTION qui coiffe B1.7)
# Intertitres de l'annexe : « Personnes de droit privé » (Associations,
# Entreprises, Personnes physiques, Autres) puis « Personnes de droit public »
# (Régions, Départements, Communes, Établissements publics…). Ils portent la
# distinction qui compte pour le lecteur ET pour le contrôle DGFiP : seule la
# partie PRIVÉE se compare au compte 65748 ; le CCAS et les EPCI sont ailleurs.
# Tolérants à l'OCR : « Pe6onnes Dhvsioues », « Réoions », « Communæ ».
B17_PRIVE=re.compile(r"personnes? de droit priv|associations?$|entrepr[il]ses?$|pe.?.?onnes?\s+.h[vy]s|autres$",re.I)
B17_PUBLIC=re.compile(r"personnes? de droit public|r[ée].?ions?$|d[ée].?.?rtements?$|communa?[eu]?s?$|etabli.?.?ements?\s+.ubli",re.I)
B17_COLS=re.compile(r"nom des b[ée]n[ée]ficiaires|b[ée]n[ée]ficiaire.{0,30}montant|montant du fonds de concours|prestations? en nature",re.I)
B17_NOT=re.compile(r"autres dettes|[ée]tat de la dette|emprunts garantis|[ée]tat du personnel|autorisations? de programme|liste des organismes",re.I)
B17_SKIP=re.compile(r"^\s*(montant|total|b1\.7|article|cgct|nom des b|b[ée]n[ée]ficiaires?|personnes? de droit|associations?|prestations? en nature|la subvention|autres organismes|entreprises?|\(\d\))",re.I)
_MONT=re.compile(r"(-?\d{1,3}(?: \d{3})*[,.]\d{2})")
def read_subventions(doc, ocr_pages=True, max_pages=None):
    """Renvoie {"lignes":[{"beneficiaire","montant","objet","page"}], "total", "pages"}.
    On lit chaque page dont l'en-tête (6 premières lignes) parle de B1.7, puis les
    pages qui SUIVENT tant qu'elles gardent ce titre courant. Une ligne = un
    libellé de 4-70 caractères suivi d'un montant ; le reste de la ligne est l'objet."""
    n=len(doc) if max_pages is None else min(len(doc),max_pages)
    lignes=[]; pages=[]; en_cours=False; secteur="prive"
    # On n'OCRise que si le DOCUMENT est dégradé (scan, ou couche texte de
    # scanner : > 25 % des pages avec < 10 % de mots français). Sinon les pages
    # de tableaux, pleines de chiffres et pauvres en mots, passeraient toutes à
    # l'OCR pour rien (Nanterre : 332 s).
    txts=[doc[i].get_text() for i in range(n)]
    # Document dégradé (scan, ou couche texte de scanner : > 25 % des pages avec
    # < 10 % de mots français) → on OCRise TOUTES ses pages (cache), sinon une
    # page de suite au texte à moitié lisible passe entre les mailles. Document
    # sain → jamais d'OCR (les pages de chiffres ont peu de mots, ce n'est pas
    # un défaut).
    degrade = ocr_pages and (sum(1 for t in txts if len(t)<150 or french_rate(t)<0.10) > 0.25*max(1,n))
    for i in range(n):
        txt=txts[i]; words=None
        if degrade:
            words=ocr_words(doc,i); txt=" ".join(w[4] for w in words)
        # Les pages de SUITE ne répètent pas le titre de l'annexe, seulement
        # l'en-tête de colonnes (« Nom des bénéficiaires … Montant … ») : on
        # continue tant qu'on voit cet en-tête, et on s'arrête dès qu'une AUTRE
        # annexe s'ouvre. Sans ça on ne lisait que la 1re page (Nanterre :
        # 568 k€ au lieu de 5,18 M€ au compte 6574 de la DGFiP).
        lines=_lines(doc[i],words=words)
        head=" ".join(l[2] for l in lines[:8])
        ouvre = bool(B17_PAGE.search(head)) and not B17_NOT.search(head)
        suite = en_cours and bool(B17_COLS.search(head)) and not B17_NOT.search(head)
        if not (ouvre or suite): en_cours=False; continue
        en_cours=True
        pages.append(i+1)
        # Le montant est dans une COLONNE : on repère sa position (médiane des
        # premiers nombres de la page) et on prend le nombre le plus proche.
        # Une règle de texte se fait piéger par un nom qui finit par un chiffre :
        # « NANTERRE 92 » + « 270 000,00 » devenait 92 270 000,00 €.
        cands=[]
        for y,toks,l in lines[6:]:
            if B17_SKIP.search(l): continue
            for a,x0,x1 in toks:
                if _MONT.fullmatch(a): cands.append((x0+x1)/2); break
        if not cands: continue
        cands.sort(); xm=cands[len(cands)//2]
        for y,toks,l in lines[6:]:
            t=l.strip()
            if not _MONT.search(t) and 4<len(t)<52:
                if B17_PUBLIC.search(t) and not B17_PRIVE.search(t): secteur="public"
                elif B17_PRIVE.search(t): secteur="prive"
            if B17_SKIP.search(l): continue
            nums=[(a,(x0+x1)/2,x0) for a,x0,x1 in toks if _MONT.fullmatch(a)]
            if not nums: continue
            a,xc,x0m=min(nums,key=lambda q:abs(q[1]-xm))
            if abs(xc-xm)>60: continue
            v=_to_float(a)
            if v is None or v<0: continue
            benef=" ".join(tk for tk,tx0,_ in toks if tx0<x0m-1).strip(" -–:")
            benef=re.sub(r"\s+"," ",benef)
            if len(re.sub(r"[^A-Za-zÀ-ÿ]","",benef))<3: continue
            objet=" ".join(tk for tk,tx0,_ in toks if tx0>xc+1)
            objet=_MONT.sub("",re.sub(r"\s+"," ",objet)).strip(" -–:")
            lignes.append({"beneficiaire":benef[:90],"montant":v,"objet":objet[:80],"page":i+1,"secteur":secteur})
    tot=lambda sec: round(sum(x["montant"] for x in lignes if x.get("secteur")==sec),2)
    return {"lignes":lignes,"total":round(sum(x["montant"] for x in lignes),2),"pages":pages,"n":len(lignes),
            "total_prive":tot("prive"),"total_public":tot("public"),
            "n_prive":sum(1 for x in lignes if x.get("secteur")=="prive"),
            "n_public":sum(1 for x in lignes if x.get("secteur")=="public")}


# ---------------------------------------------------------------------------
# M57 « B8 – Subventions versées dans le cadre du vote du budget » : un tableau
# à colonnes — article | type | objet (avec le CODE FONCTION) | organisme |
# nature juridique | montant — séparé en INVESTISSEMENT (total) et
# FONCTIONNEMENT (total). Les totaux imprimés servent de contrôle interne.
_NAT=r"(Association|Entreprise|Etablissement de droit public|[ÉE]tablissement public|Autre personne de droit priv[ée]e?|Personne physique|Collectivit[ée] territoriale|GIP|Syndicat|[ÉE]tat|Commune|D[ée]partement|R[ée]gion|EPCI|Autre organisme public|Autre)"
_B8_TOT=re.compile(r"^(INVESTISSEMENT|FONCTIONNEMENT)\s*\(total\)\s+(-?\d{1,3}(?: \d{3})*[,.]\d{2})",re.I)
_B8_COLS=[("article",r"^Article$"),("type",r"^Subventions?$"),("objet",r"^Objet$"),("organisme",r"^Nom$"),("nature",r"^Nature$"),("montant",r"^Montant$")]
def _b8_colonnes(lines):
    """Centres x des titres de colonnes. L'en-tête du tableau est réparti sur
    DEUX lignes et chaque titre est coupé en mots : on prend le PREMIER mot de
    chaque titre. Les titres sont CENTRÉS au-dessus de leur colonne alors que
    les données sont alignées à gauche : la frontière entre deux colonnes est
    donc à mi-chemin entre deux centres de titres, pas au début du titre."""
    cols={}
    for y,toks,t in lines[:14]:
        # seules les deux lignes d'en-tête du TABLEAU comptent ; le titre de la
        # page « SUBVENTIONS VERSEES DANS LE CADRE DU VOTE DU BUDGET » (tout en
        # capitales) fournirait un faux « Subventions » et inverserait deux colonnes
        if not re.search(r"Article|Nature juridique|Montant de la|Nom de l",t): continue
        if t.upper()==t: continue
        for a,x0,x1 in toks:
            for nom,rx in _B8_COLS:
                if nom not in cols and re.match(rx,a,re.I): cols[nom]=(x0+x1)/2
        if len(cols)>=5: break
    return sorted(cols.items(),key=lambda c:c[1]) if len(cols)>=4 else None
def _b8_fronts(cols,rows):
    """Frontières de colonnes en DEUX passes : d'abord à mi-chemin entre les
    centres des titres (approximatif : un objet long déborde sur l'organisme),
    puis on prend, pour chaque colonne, le bord gauche le plus à gauche des mots
    qui lui ont été attribués — les données sont alignées à gauche, ce minimum
    est le vrai bord de la colonne (« Centre » retrouvait ainsi son organisme)."""
    centres=[c for _,c in cols]
    f1=[-1e9]+[(centres[k]+centres[k+1])/2 for k in range(len(centres)-1)]+[1e9]
    gauche={n:None for n,_ in cols}
    for toks in rows:
        for a,x0,x1 in toks:
            for k,(n,_) in enumerate(cols):
                if f1[k]<=x0<f1[k+1]:
                    if gauche[n] is None or x0<gauche[n]: gauche[n]=x0
                    break
    bords=[gauche[n] if gauche[n] is not None else centres[k] for k,(n,_) in enumerate(cols)]
    # garder l'ordre croissant (un bord aberrant ne doit pas inverser deux colonnes)
    for k in range(1,len(bords)):
        if bords[k]<=bords[k-1]: bords[k]=f1[k]
    return [-1e9]+bords[1:]+[1e9]
def _b8_ligne(toks,cols,fronts):
    out={n:[] for n,_ in cols}
    for a,x0,x1 in toks:
        for k,(n,_) in enumerate(cols):
            if fronts[k]<=x0+2<fronts[k+1]: out[n].append(a); break
    return {n:" ".join(v).strip() for n,v in out.items()}
def read_subventions_m57(doc, max_pages=None):
    """M57 « B8 – Subventions versées » lu PAR COLONNES (positions x de l'en-tête).
    Renvoie {"lignes":[{article,type,fonction,objet,organisme,nature,montant,section,page}],
    "totaux_imprimes", "totaux_lus", "ecart_pct", "pages"}. Les totaux imprimés
    « INVESTISSEMENT (total) / FONCTIONNEMENT (total) » servent de contrôle interne."""
    n=len(doc) if max_pages is None else min(len(doc),max_pages)
    lignes=[]; pages=[]; tot_imp={}; sec=None; en_cours=False; prev=None; cols=None
    for i in range(n):
        lines=_lines(doc[i])
        head=" ".join(l[2] for l in lines[:6])
        if re.search(r"subventions? vers[ée]es",head,re.I): en_cours=True; pages.append(i+1)
        elif en_cours and re.search(r"Article\s*\(1\)|Nature juridique|Nom de l.organisme",head,re.I): pages.append(i+1)
        elif en_cours: en_cours=False; prev=None
        if not en_cours: continue
        c=_b8_colonnes(lines)
        if c: cols=c
        fronts=_b8_fronts(cols,[toks for _,toks,_ in lines]) if cols else None
        for y,toks,l in lines:
            mt=_B8_TOT.match(l)
            if mt: sec="inv" if mt.group(1).upper().startswith("INV") else "fct"; tot_imp[sec]=_to_float(mt.group(2)); prev=None; continue
            if not cols: continue
            if re.match(r"^(Article|Nature juridique|l.organisme|subvention|Nom de l)",l,re.I): continue
            d=_b8_ligne(toks,cols,fronts)
            mont=d.get("montant","")
            mm=re.search(r"(-?\d{1,3}(?: \d{3})*[,.]\d{1,2})\s*$",mont)
            if mm and re.match(r"^\d{4,8}",d.get("article","")):
                fct=re.match(r"(\d{1,4}(?:\.\d+)?)\s*-\s*(.*)",d.get("objet",""))
                row={"article":d["article"].split()[0],"type":d.get("type","")[:40],"fonction":fct.group(1) if fct else "",
                     "objet":(fct.group(2) if fct else d.get("objet","")).strip()[:70],"organisme":d.get("organisme","").strip()[:90],
                     "nature":d.get("nature","").strip()[:40],"montant":_to_float(mm.group(1)),"section":sec,"page":i+1}
                lignes.append(row); prev=row
            elif prev and not mm:
                # ligne de suite : chaque colonne complète la sienne
                for k in ("objet","organisme","nature","type"):
                    if d.get(k): prev[k]=(prev[k]+" "+d[k]).strip()[:100]
    tot_lu={s2:round(sum(x["montant"] or 0 for x in lignes if x["section"]==s2),2) for s2 in ("fct","inv")}
    ecart={s2:(round(100*(tot_lu[s2]-tot_imp[s2])/tot_imp[s2],1) if tot_imp.get(s2) else None) for s2 in ("fct","inv")}
    return {"lignes":lignes,"n":len(lignes),"pages":pages,"totaux_imprimes":tot_imp,"totaux_lus":tot_lu,"ecart_pct":ecart}


# ---------------------------------------------------------------------------
# CFU (compte financier unique, obligatoire à partir de 2026) — annexes A1/A2
# « Présentation croisée, section … – VUE D'ENSEMBLE ». Troisième mise en page,
# et la plus riche : les COLONNES sont les fonctions (01, 0, 0-5, 1 … 9, TOTAL),
# les LIGNES sont les chapitres de nature (011, 012, 65, 66… / 10, 13, 16, 21…).
# On obtient donc le TABLEAU CROISÉ complet fonction × nature, pas seulement le
# total par fonction. Le tableau se poursuit sur une page « (suite) ».
CFU_PAGE=re.compile(r"pr[ée]sentation crois[ée]e.{0,40}vue d.ensemble",re.I|re.S)
_FCODE=re.compile(r"^(01|\d|\d-\d{1,2})$")
_CHAP=re.compile(r"^(0\d\d|\d{2,4})$")
def read_croisee_ensemble(doc, max_pages=None):
    """Renvoie {"fct":{code:{"total":x,"nature":{chap:val}}}, "inv":{…},
    "totaux":{"fct":x,"inv":x}, "controle":{"fct":pct,"inv":pct}, "pages":[…]}.
    Le contrôle compare la somme des fonctions à la colonne TOTAL imprimée."""
    n=len(doc) if max_pages is None else min(len(doc),max_pages)
    res={"fct":{},"inv":{}}; tot_imp={}; pages=[]
    for i in range(n):
        lines=_lines(doc[i])
        head=" ".join(l[2] for l in lines[:6])
        if not CFU_PAGE.search(head): continue
        sec="inv" if re.search(r"investissement",head,re.I) else ("fct" if re.search(r"fonctionnement",head,re.I) else None)
        if not sec: continue
        # ligne des codes de fonction : ≥ 4 jetons du type 01 / 0 / 0-5 / 1 … 9
        cols=None
        for y,toks,l in lines[:12]:
            codes=[(a,(x0+x1)/2) for a,x0,x1 in toks if _FCODE.match(a)]
            if len(codes)>=4: cols=codes; break
        if not cols: continue
        pages.append(i+1)
        # colonne TOTAL (page « suite ») : son en-tête est le mot TOTAL
        xtot=None
        for y,toks,l in lines[:12]:
            for a,x0,x1 in toks:
                if a.upper()=="TOTAL": xtot=(x0+x1)/2
        def repartir(toks):
            """Chaque nombre va à la fonction dont le centre de colonne est le
            plus proche (les nombres sont alignés à droite sous leur colonne)."""
            out={}
            for a,x0,x1 in toks:
                v=_to_float(a)
                if v is None or not NUM.match(a): continue
                c=(x0+x1)/2
                if xtot is not None and abs(c-xtot)<=min(abs(c-cx) for _,cx in cols): out["TOTAL"]=v; continue
                code=min(cols,key=lambda kc:abs(c-kc[1]))
                if abs(c-code[1])<70: out[code[0]]=v
            return out
        # la page enchaîne un bloc DEPENSES puis un bloc RECETTES, avec les
        # mêmes colonnes : sans ce drapeau, les chapitres 73/74 (recettes)
        # atterrissent dans les dépenses de la fonction 01
        bloc=None
        for y,toks,l in lines:
            if re.match(r"^\s*DEPENSES\b",l,re.I): bloc="d"
            elif re.match(r"^\s*RECETTES\b",l,re.I): bloc="r"
            if bloc and re.match(r"^\s*(DEPENSES|RECETTES)\b",l,re.I):
                for code,v in repartir(toks[1:]).items():
                    if code=="TOTAL":
                        if bloc=="d": tot_imp[sec]=v
                        continue
                    e=res[sec].setdefault(code,{"total":None,"nature":{},"recettes":None,"nature_recettes":{}})
                    if bloc=="d": e["total"]=v
                    else: e["recettes"]=v
                continue
            if bloc and _CHAP.match((toks[0][0] if toks else "")) and len(toks)>2:
                chap=toks[0][0]
                for code,v in repartir(toks[1:]).items():
                    if code=="TOTAL" or v==0: continue
                    e=res[sec].setdefault(code,{"total":None,"nature":{},"recettes":None,"nature_recettes":{}})
                    (e["nature"] if bloc=="d" else e["nature_recettes"])[chap]=v
    tot_lu={s2:round(sum((v["total"] or 0) for v in res[s2].values()),2) for s2 in ("fct","inv")}
    ctrl={s2:(round(100*(tot_lu[s2]-tot_imp[s2])/tot_imp[s2],2) if tot_imp.get(s2) else None) for s2 in ("fct","inv")}
    return {"fct":res["fct"],"inv":res["inv"],"totaux_lus":tot_lu,"totaux_imprimes":tot_imp,"controle_pct":ctrl,"pages":pages,
            "n_fct":sum(1 for v in res["fct"].values() if v.get("total") is not None),
            "n_inv":sum(1 for v in res["inv"].values() if v.get("total") is not None)}

