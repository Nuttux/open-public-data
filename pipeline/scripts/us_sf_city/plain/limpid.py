# -*- coding: utf-8 -*-
"""State the thing. Drop the ceremony.

The passive voice in the output was MINE, not the Board's. "Granted to hold a
masquerade ball in Druids' Temple" came from keeping the passive verb and
throwing the actor away; the record says "permission be granted to the Druids
to hold a masquerade ball". So the fix is not to quote less legalese — it is to
stop emitting a half-sentence and name the thing instead.
"""
import re, sys
sys.path.insert(0, '/tmp')
from detail import org_name

# the granting ceremony, in every form the Board writes it. What follows is the
# thing; what precedes it is procedure.
CEREMONY = re.compile(
    r"^\W*(?:"
    r"(?:be and (?:is|are|it is|they are) hereby )?"
    r"(?:hereby )?"
    r"(?:Granted|Granting|Authorized|Authorizing|Approved|Approving|Ordered|"
    r"Ordering|Adopted|Adopting|Permitted|Permitting|Directed|Directing|"
    r"Accepted|Accepting|Provided|Providing|Confirmed|Confirming|Established|"
    r"Establishing|Declared|Declaring|Determined|Determining|Instructed|"
    r"Denied|Denying|Refused|Refusing|Rescinded|Revoked)"
    r"(?:\s+(?:revocable\s+)?permission)?"
    r"(?:\s+(?:to|that|for|of))?"
    r"\s+)", re.I)
# "The following X be and the same are hereby established:" -> just X
FOLLOWING = re.compile(r"^\W*(?:The following|Following)\s+([\w\s-]{3,40}?)\s+"
                       r"(?:be and (?:the same )?(?:is|are)\s+)?(?:hereby\s+)?"
                       r"(?:\w+ed|\w+ted)\s*:?\s*", re.I)
# a leftover "be and is" after the actor has been lifted out
SCAFFOLD = re.compile(r"\b(?:be and (?:is|are|he is|she is|it is|they are)"
                      r"|be and the same(?:\s+(?:is|are))?)\s+(?:hereby\s+)?", re.I)
LEADVERB = re.compile(r"^\W*(?:to\s+)?(?:[a-z]+(?:,\s*|\s+and\s+|\s+or\s+))*"
                      r"(operate|maintain|erect|construct|hold|conduct|install|"
                      r"establish|use|occupy|keep|store|lay|remove|build)\s+"
                      r"(?:\b(?:a|an|the)\b\s*)?", re.I)
DEAD = re.compile(r"\b(?:certain|said|aforesaid|hereby|thereof|duly|revocable|existing"
                  r"|at (?:the )?will of the Board of Supervisors"
                  r"|during the pleasure of the Board of Supervisors"
                  r"|of the City and County of San Francisco"
                  r"|his successors and assigns|her successors and assigns)\b", re.I)
TIDY = re.compile(r"\s{2,}")

def limpid(line, cap=12):
    t = SCAFFOLD.sub(" ", line)
    f = FOLLOWING.match(t)
    if f:
        rest = t[f.end():].strip(" :,")
        t = f"{f.group(1).strip()}, {rest}" if rest else f.group(1)
    else:
        t = CEREMONY.sub("", t)
    party = org_name(t)
    if party and re.match(r"^(?:Sale|Real|Surplus|Public|Certain|Portion)\b", party): party = None
    t = LEADVERB.sub("", t)
    t = DEAD.sub(" ", t)
    t = TIDY.sub(" ", t).strip(" ,;.:—-")
    if party and party.lower() in t.lower():
        # the name reads better at the end than buried in the middle
        cut = re.sub(rf",?\s*(?:to\s+)?{re.escape(party)}\s*,?", " ", t, count=1, flags=re.I)
        cut = re.sub(r"^\W*(?:The|A|An)\s+", "", TIDY.sub(" ", cut).strip(" ,;.:—-"), flags=re.I)
        cut = LEADVERB.sub("", CEREMONY.sub("", cut)).strip(" ,;.:—-")
        if len(cut.split()) >= 3: t = f"{cut[0].upper()}{cut[1:]} — {party}"
    w = t.split()
    if len(w) > cap:
        head = " ".join(w[:cap]); b = max(head.rfind(","), head.rfind(";"))
        t = (head[:b] if b > 16 else head).rstrip(" ,;") + "…"
    return t[0].upper() + t[1:] if t else t
