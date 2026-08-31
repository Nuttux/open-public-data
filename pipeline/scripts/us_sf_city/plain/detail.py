# -*- coding: utf-8 -*-
"""The one concrete thing in a record: a name, a use, or a quantity."""
import re

ORG_TAIL = (r"Co\.|Company|Corporation|Corp\.|Inc\.|Incorporated|Association|Assn\.|"
            r"School|Hospital|Library|Center|Centre|Hotel|Club|Church|Theatre|Theater|"
            r"Works|Bank|Institute|Union|Society|Agency|District|Department|Foundation|"
            r"Museum|College|University|Academy|Restaurant|"
            r"Garage|Laundry|Bakery|Cafe|Brewery|Mill|Factory|Warehouse|L\.P\.|LLC")
ORG = re.compile(rf"\b((?:[A-Z][\w&'.\-]*\s+|(?:and|of|the|&)\s+){{0,5}}"
                 rf"(?:{ORG_TAIL}))(?![\w])")
AKA = re.compile(r"\(\s*(?:a\.?k\.?a\.?|also known as|formerly)\s+([^)]{3,52})\)", re.I)
PAREN = re.compile(r"\(([A-Z][^)]{4,46})\)")
QTY = re.compile(r"\b(\d[\d,]*)\s*(gallons?|horsepower|h\.?p\.?|units?|rooms?|beds?|"
                 r"stories|storey|story|seats?|acres?)\b", re.I)
# what a permit is FOR — the Board writes this as an infinitive or a "for" phrase
TO_DO = re.compile(r"\bto\s+(operate|conduct|maintain|construct|erect|install|establish|"
                   r"remove|use|run|keep|store|build|demolish|convert)\s+([^,;.]{4,54})", re.I)
FOR = re.compile(r"\bfor\s+((?:a|an|the)\s+)?([a-z][^,;.]{6,38})(?=[,;.]|$)", re.I)
# "prohibiting the establishment and operation of restaurants and fast food"
BANS = re.compile(r"\b(prohibit\w*|banning)\b[^,;.]{0,80}"
                  r"\bof\s+([a-z][^,;.]{4,40})(?=[,;.]|$)", re.I)
APPOS = re.compile(r"[;—–]\s*([A-Z][\w&'.\- ]{4,44})\s*$")

STOPPHRASE = re.compile(r"^(?:the (?:city|board|purpose|sum|same|period)|said|which|"
                        r"assessor|planning code|article \d|section \d|not to exceed|"
                        r"the following|such|any|all)", re.I)
BAD_ORG = re.compile(r"^(?:City|County|Board|Planning|Redevelopment Agency|"
                     r"Assessor|State|Municipal|Public|Department|Clerk|Mayor)\b", re.I)

CONNECT = {"and", "of", "the", "&", "for"}
# an explicit list, because "Catering" ends in -ing and is part of the name:
# testing the suffix cut "Bismarck Cafe and Catering Co." down to "Catering Co."
LEADIN = {"granting","approving","authorizing","adopting","ordering","directing",
 "amending","designating","establishing","denying","opposing","extending",
 "initiating","urging","requesting","declaring","vacating","confirming",
 "determining","providing","accepting","making","setting","fixing","naming",
 "certifying","releasing","continuing","appropriating","of","to","by","at",
 "from","that","re","per"}
TAIL_RE = re.compile(rf"\b(?:{ORG_TAIL})(?![\w])")

def org_name(line):
    """Walk BACK from the last company word to the start of the name.

    Matching forwards takes the FIRST word that can end a name, so
    "Granting the Bismarck Cafe and Catering Co." came back as "Granting the
    Bismarck Cafe" — the regex stopped at `Cafe`. Walking back from `Co.`
    over capitalised words and their connectors gets the whole name and drops
    the verb in front of it.
    """
    best = None
    for m in TAIL_RE.finditer(line):
        toks = line[:m.start()].split()
        i = len(toks)
        while i > 0:
            w = toks[i - 1]
            if w.lower() in CONNECT or (w[:1].isupper() and w.lower() not in LEADIN):
                i -= 1
            else:
                break
        while i < len(toks) and toks[i].lower() in CONNECT:
            i += 1                      # a name does not open with "and"
        name = " ".join(toks[i:] + [m.group(0)]).strip(" .,")
        if len(name.split()) >= 2 and not BAD_ORG.match(name):
            if best is None or len(name) > len(best): best = name
    return best

def detail(line):
    """A short verbatim phrase naming the thing, or None."""
    m = AKA.search(line)
    if m: return m.group(1).strip(" .,")
    # longest wins: "Bismarck Cafe" and "Bismarck Cafe and Catering Co." both
    # match, and the second is the one that names the business
    org = org_name(line)
    if org: return org
    m = PAREN.search(line)
    if m and not STOPPHRASE.match(m.group(1)): return m.group(1).strip(" .,")
    m = TO_DO.search(line)
    if m: return f"{m.group(1).lower()} {m.group(2).strip(' .,')}"
    m = BANS.search(line)
    if m: return m.group(2).strip(" .,")
    m = QTY.search(line)
    if m: return f"{m.group(1)} {m.group(2).lower()}"
    m = APPOS.search(line)
    if m and not BAD_ORG.match(m.group(1)): return m.group(1).strip(" .,")
    m = FOR.search(line)
    if m and not STOPPHRASE.match(m.group(2)): return m.group(2).strip(" .,")
    return None
