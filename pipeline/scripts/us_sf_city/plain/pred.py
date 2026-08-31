# -*- coding: utf-8 -*-
"""What HAPPENED: the record's own verb and the thing it acts on."""
import re, sys
sys.path.insert(0,'/tmp')

# the Board opens a decision with a gerund, and what follows it is the event
VERB = (r"Authorizing|Approving|Granting|Ordering|Adopting|Designating|Providing|"
        r"Establishing|Accepting|Amending|Directing|Extending|Initiating|Urging|"
        r"Denying|Disapproving|Opposing|Confirming|Determining|Declaring|Vacating|"
        r"Reclassifying|Rezoning|Releasing|Certifying|Setting|Fixing|Naming|"
        r"Renaming|Appropriating|Requesting|Permitting|Instructing|Calling|"
        r"Commending|Supporting|Prohibiting|Imposing|Creating|Making|Adding|Waiving|"
        r"Affirming|Repealing|Dedicating|Abandoning|Transferring|Renewing|"
        r"Suspending|Delegating|Endorsing|Condemning|Rescinding|Modifying|"
        r"Reappropriating|Deappropriating|Opposing|Levying|Widening|"
        r"Closing|Opening|Restricting|Allowing|Requiring|Excusing|Waiver")
LEAD = re.compile(rf"\b({VERB})\b", re.I)
# a record with no verb often opens with the act as a noun instead
NOMINAL = re.compile(r"\b((?:Construction|Improvement|Extension|Sale|Purchase|Award|"
                     r"Acquisition|Designation|Establishment|Installation|Widening|"
                     r"Closing|Opening|Repair|Paving|Grading|Lease|Transfer|Adoption|"
                     r"Appropriations?|Reclassification|Renaming|Demolition|Amendment)\s+(?:of|for|to)\s+"
                     r"[^,;.]{4,60})", re.I)

# where the event stops and the paperwork starts
TAIL = re.compile(
    r"[,;]?\s*(?:Assessor'?s?\s+(?:Parcel\s+)?Block|under\s+(?:Section|Article)|"
    r"pursuant to|in accordance with|and adopting|and making|and directing|"
    r"and authorizing the Clerk|finding and determining|as defined|"
    r"The rights granted|Adopted by the following|upon the following conditions|"
    r"subject to|provided that|File No|Ordinance No|Resolution No|"
    r"\(New Series\)|for the reasons|as more particularly|and to take)", re.I)

# ── THE BOARD WROTE IN THE PASSIVE FOR MOST OF THIS CENTURY ────────────────
# "Resolved, That Howard J. Mallen be and is hereby granted permission to
# maintain and operate an automobile parking station on Taylor street."
# The leading-gerund pattern is the MODERN clerk's style; the Journal puts the
# verb in the middle and the actor in front of it. 15,382 records — 34.3% of
# everything that stated no event — are this shape, concentrated in the 1920s.
PASSIVE = re.compile(
    r"\b(?:be and (?:is|are)\s+hereby|(?:is|are)\s+hereby|hereby)\s+"
    r"(granted|ordered|directed|authorized|amended|revoked|rescinded|approved|"
    r"denied|instructed|appropriated|set aside|accepted|changed|established|"
    r"fixed|declared|permitted|required|dedicated|vacated|closed|confirmed|"
    r"extended|released|transferred|approve|accept|grant|order|authorize|amend|declare|establish|confirm|adopt|dedicate|waive)\b", re.I)
# who it was done TO, sitting in front of the verb: "Resolved, That <actor> be
# and is hereby granted" — kept short, and only when it reads as a name
ACTOR = re.compile(r"\bResolved,?\s+That\s+(.{3,60}?)\s+(?:be and (?:is|are)|is|are)\s+hereby", re.I)
# the modern Clerk's own title, which needs no extraction at all
BRACKET = re.compile(r"[\[I({]([A-Z][^\]}]{9,89})[\]}]")
# a tally is not an event
PAREN_TITLE = re.compile(
    r"^\W{0,4}(?:Resolution|Ordinance|Motion)\s+No\.?\s*[\d\w\-.]{0,10}\s*"
    r"\(([A-Z][^)]{12,110})\)", re.I)
NUMBER_ONLY = re.compile(
    r"^\W{0,4}(?:Resolution|Ordinance|Motion)\s+No\.?\s*[\d][\w\-.]{0,9}\s*"
    r"(?:\((?:New Series|Second Series|Series of \d{4})\)\s*)?[.,;:]?\s*$", re.I)
VOTE = re.compile(r"\bAdopted by the following vote[^.]{0,400}?\.|\\bFinally [Pp]assed by the following[^.]{0,400}?\\.|\\bAyes\\s*[:—-][^.]{0,400}?\\.", re.I)

# "granted permission, REVOCABLE AT WILL OF THE BOARD OF SUPERVISORS, to
# maintain an automobile supply station" — the phrase is in the middle and the
# substance is behind it, so cutting the line here loses the whole event.
MIDDLE = re.compile(r",?\s*\b(?:revocable at (?:the )?will of the Board of Supervisors|"
                    r"during the pleasure of the Board of Supervisors|"
                    r"be and the same is hereby|be and (?:he|she|it|they) (?:is|are) hereby|"
                    r"a municipal corporation|of the City and County of San Francisco)\b,?", re.I)

RESOLVED_BE = re.compile(
    r"\bResolved,?\s+That,?\s+(.{10,190}?\bbe\s+(?:and\s+(?:is|are)\s+hereby\s+)?"
    r"(?:closed|abandoned|granted|vacated|accepted|paid|set aside|appropriated|"
    r"established|changed|widened|improved|reclassified|named|renamed|dedicated|"
    r"transferred|authorized|directed|instructed|amended|approved|denied|"
    r"confirmed|extended|released|ordered)\b[^.;]{0,90})", re.I)

# 15 words cut 65% of rows off mid-phrase — "Requesting that the premises
# occupied by the Pierce, Rodolph Warehouse Company, located…" ends one word
# before the address. The Board's titles are long because they are precise.
MAX_WORDS = 26

PROCEDURAL = re.compile(
    r"^\W*(?:CALLING THE ROLL|The Roll was called|ROLL CALL|APPROVAL OF THE|"
    r"Communications? (?:and Reports?)? ?(?:from|were)|The following Supervisors|"
    r"Absent:|Noes:|Excused|In Memoriam\b(?!.{6,}))", re.I)

def predicate(line):
    out = _predicate(line)
    return None if (out and PROCEDURAL.match(out)) else out


def _predicate(line):
    """The event, in the record's own words, or None if it states none."""
    # ── EVERYTHING AFTER THE VOTE TALLY BELONGS TO THE NEXT RECORD ─────────
    # The Journal prints title, text, then "Adopted by the following vote:
    # Ayes — … — 11." and the NEXT item's title follows on the same page. 9,625
    # records carry a verb after their tally and every one I read belonged to
    # the item below. So the tally is a WALL, not a thing to strip: nothing
    # past it is this record's.
    if PROCEDURAL.match(line.strip()): return None
    # ── THE JOURNAL HAS TWO LAYOUTS AND THEY DISAGREE ABOUT THE WALL ───────
    # A: [title][text][tally] — the tally is a wall; what follows is the NEXT
    #    record's title. 11,968 records; a post-tally title names one of this
    #    record's own streets only 5.2% of the time, i.e. chance.
    # B: [Resolution No. X.][tally][title] — the post-war house style, 1940s to
    #    1970s. Here the title comes AFTER the vote and belongs to this record:
    #    the address sits inside the FIRST post-tally title on 3,133 of 3,311
    #    (94.6%).
    # They are told apart by what sits before the tally: in B there is nothing
    # there but the record's own number. Found by reading three pages of the
    # 1949 Journal, after four automated joins had failed at 24-53%.
    cut = VOTE.search(line)
    if cut:
        head = line[:cut.start()].strip()
        line = line[cut.end():].strip() if NUMBER_ONLY.match(head) else head
    b = BRACKET.search(line)
    if b and len(b.group(1).split()) >= 2:
        return b.group(1).strip(" .,")
    paren = PAREN_TITLE.match(line)
    if paren and len(paren.group(1).split()) >= 3:
        return paren.group(1).strip(" .,")
    # "Resolved, That the following streets BE CLOSED to vehicular traffic" —
    # the passive without a "hereby", where the thing acted on comes FIRST.
    r = RESOLVED_BE.search(line)
    if r:
        clause = MIDDLE.sub(" ", r.group(1))
        clause = re.sub(r"\s+", " ", clause).strip(" ,;.—-")
        cutb = TAIL.search(clause)
        if cutb: clause = clause[:cutb.start()].strip(" ,;.—-")
        w = clause.split()
        if len(w) > MAX_WORDS + 3: clause = " ".join(w[:MAX_WORDS + 3]) + "…"
        if len(clause.split()) >= 5:
            return clause[0].upper() + clause[1:]
    m = PASSIVE.search(line)
    if m:
        who = ACTOR.search(line)
        after = line[m.end():]
        cut = TAIL.search(after)
        if cut: after = after[:cut.start()]
        after = MIDDLE.sub(" ", after)
        after = re.sub(r"\s+", " ", after).strip(" ,;.—-")
        words = after.split()
        if len(words) > MAX_WORDS: after = " ".join(words[:MAX_WORDS]) + "…"
        verb = m.group(1).lower()
        if len(after.split()) >= 3:
            head = (f"{who.group(1).strip(' ,')} {verb} {after}"
                    if who and len(who.group(1).split()) <= 8 else f"{verb.capitalize()} {after}")
            head = re.sub(r"\s+", " ", head).strip()
            return head[0].upper() + head[1:]
    # Before the wall, position does not matter — the verb sits behind a
    # preamble ("Resolution No. 5875 (New Series), Granting permission…") on
    # 6,994 records that a 60-character window was walking straight past.
    m = LEAD.search(line)
    if m:
        span = line[m.start():]
    else:
        m = NOMINAL.search(line)
        if not m: return None
        span = m.group(1)
    cut = TAIL.search(span)
    if cut: span = span[:cut.start()]
    span = MIDDLE.sub(" ", span)
    span = re.sub(r"\s+", " ", span).strip(" ,;.—-")
    words = span.split()
    if len(words) > MAX_WORDS and "(" in " ".join(words[MAX_WORDS-4:MAX_WORDS+6]):
        # let a parenthetical finish rather than severing the name inside it
        j = span.find(")", len(" ".join(words[:MAX_WORDS])) - 20)
        if 0 < j < len(span) - 1: span, words = span[:j+1], span[:j+1].split()
    if len(words) > MAX_WORDS:
        # cut at the last clause boundary inside the budget, else at the budget
        head = " ".join(words[:MAX_WORDS])
        b = max(head.rfind(","), head.rfind(";"))
        span = (head[:b] if b > 24 else head).rstrip(" ,;") + "…"
    # an object is required: a verb with nothing after it is not an event
    # THE SHARD'S TEXT IS ITSELF A FRAGMENT (median 154 characters), so a span
    # can end inside its object: "on property located at 40-50", "from Jesse
    # H", "sublease of City leasehold interest located at 701". Ending on a
    # dangling preposition, article or bare number reads as broken, so it is
    # cut back to the last thing that completes.
    for _ in range(6):
        n = re.sub(r"[\s,;-]+(?:the|a|an|of|to|for|and|in|on|at|by|with|from|"
                   r"also|located|between|No\.?|[\d-]+|[A-Z]\.?)$", "", span)
        if n == span: break
        span = n
    span = span.strip(" ,;.—-")
    if len(span.split()) < 4: return None
    return span[0].upper() + span[1:]
