# AGENTS.md

Instructions for AI coding assistants working in this repo.

**Read these first, in order:**

1. **`HANDOFF.md`** — session/context handoff: hard environment gotchas (two
   clones — this is the canonical one), non-negotiable rules, current
   work-in-flight, and where things live.
2. **`CLAUDE.md`** — project instructions: architecture, convergence primitives,
   config paths, non-negotiables.
3. **`ADDING-A-PLACE.md`** — required before adding or modifying any
   city/country, plus the ADRs it links.

**The three rules to never break:**
- Work only in the canonical clone `/Users/daniel/code/open-public-data/` (a
  stale duplicate exists on the Desktop — never touch it).
- Commit author is the user only — never add the assistant as author/co-author.
- Zero hardcoded numbers: every metric flows raw → stg → core → mart → export
  with a `source_url`; no pipeline-layer bypasses.

See `HANDOFF.md` §1 for the full rule set (editorial neutrality, mandatory UI
screenshot review, i18n parity, eval rigor).
