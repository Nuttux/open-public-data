"""Cut the Journal's boilerplate off the front of an item so the snippet starts at
the substance. Measured on the corpus, not guessed: the preamble is 45-190 chars of
"Resolution No. 26080 (New Series), as follows: Whereas, a petition has been filed
with the Board of Supervisors of the City and County of San Francisco, State of
California, petitioning that..." — every character of which is identical across
thousands of items and none of which tells a reader anything about their block.

Also drops the roll-call tail, which is names and numbers, never content.
"""
import re

HEAD = [
 r"^(Resolution|Ordinance|Motion)\s*(No\.?\s*[\d\-—]+[A-Za-z]?)?\s*"
 r"(\((?:New Series|Series of \d{4}|Bill No\.?[^)]*)\)\s*,?)?\s*"
 r"(,?\s*as (?:follows|amended)\s*[:.]?)?\s*",
 r"^(Whereas,?\s*)?(a\s+)?(petition|communication|application|resolution|report)\s+"
 r"(has been |was )?(duly )?(filed|received|presented)\s+with\s+the\s+Board\s+of\s+"
 r"Supervisors\s+(of\s+the\s+City\s+and\s+County\s+of\s+San\s+Francisco\s*,?\s*"
 r"(State\s+of\s+California)?\s*,?\s*)?,?\s*(petitioning\s+that\s*)?",
 r"^Resolved,?\s*That\s*",
 r"^(Be it |)Ordained by the People of the City and County of San Francisco\s*(as follows)?\s*[:.]?\s*",
 r"^(and\s+)?Whereas,?\s*",
 r"^the following (was |were )?",
]
HEAD = [re.compile(h, re.I) for h in HEAD]

TAIL = re.compile(
    r"\s*(Adopted by the following vote\s*[:.]?\s*)?"
    r"\bAyes?\s*[:\-—]\s*Supervisors?\b.*$", re.I | re.S)
TAIL2 = re.compile(r"\s*(File No\.?\s*[\d\-]+|Bill No\.?\s*[\d\-]+)\s*,?\s*$", re.I)

def strip(t: str) -> str:
    t = re.sub(r"\s+", " ", t).strip()
    t = TAIL.sub("", t)
    t = TAIL2.sub("", t)
    for _ in range(4):
        before = t
        for h in HEAD:
            t = h.sub("", t, count=1).lstrip(" ,;:.")
        if t == before:
            break
    return t.strip() or re.sub(r"\s+", " ", "").strip()

if __name__ == "__main__":
    import json, random, statistics
    rows = [json.loads(l) for l in open("cache/items.jsonl")]
    rows = [r for r in rows if r["r"]]
    a = [len(re.sub(r"\s+", " ", r["t"]).strip()) for r in rows]
    b = [len(strip(r["t"])) for r in rows]
    print(f"median raw {statistics.median(a):.0f} -> stripped {statistics.median(b):.0f} chars")
    print(f"empty after strip: {sum(1 for x in b if x < 25)}")
    random.seed(11)
    for r in random.sample(rows, 10):
        print("\nRAW :", re.sub(r"\s+"," ",r["t"])[:150])
        print("SNIP:", strip(r["t"])[:150])
