# SF pages — de-fluff + jargon-tooltip audit

Nothing here is applied yet (except the three already-done budget subtitles,
marked ✅). Tick / cross / edit each item and I'll apply the survivors. Rule:
**cut instructional hand-holding, self-praise, and restatements; move
jargon-explaining prose into a tooltip on the jargon term; keep the data, the
source lines, and the honesty caveats.**

`Tip` is the existing tooltip component: `<Tip label="explanation">term</Tip>`.

---

## Part A — cuts & trims

| # | Where | Current text | Proposed |
|---|---|---|---|
| A1 ✅ | budget s02.sub | "…service areas — the one classification that stays comparable across every year of data. FY{fy} spending side." | "The City groups its {n} departments into {n} service areas." (done) |
| A2 ✅ | budget s03.sub | "…from salaries to debt service. Hover a label for what it actually means." | "{n} spending categories, from salaries to debt service." (done) |
| A3 ✅ | budget s04.sub | "…in FY{fy} — the most readable labels in the whole dataset, with one big trap explained below." | "{n} revenue categories add up to {total}." (done) |
| A4 | **dept fiche** `dept.meta` | "Department code DPH · source label "DPH Public Health" · adopted budget, FY2025, all funds, net of transfer adjustments" | **Cut entirely** — repeats the page header + KPIs. ("net of transfer adjustments" moves into the offsets tooltip, B1.) |
| A5 | contracts s02.sub | "Agreed amounts by contract type, whole register. Labels are plain English — hover any row for the register's own wording." | "Agreed amounts by contract type." (cut self-praise + the hover instruction — the tooltip stays) |
| A6 | contracts s06.sub | "…the legal basis for the award. We grouped its 93 wordings into 8 families; fiches always show the register's own wording verbatim." | "The register records a purchasing authority for each contract — the legal basis for the award." (drop the methodology tail) |
| A7 | payroll s02.sub | "…FY{fy}. Toggle between payroll dollars and headcount — the ranking changes." | "{nDepts} departments in {nGroups} service areas." (cut the toggle instruction; the toggle is visible) |
| A8 | budget s01 KPI notes | "balanced budget — revenue equals spending" / "internal transfers cancelled citywide" | Keep as micro-captions, but "balanced budget…" is a candidate to drop (a US city budget is balanced by law — arguably obvious). Your call. |

## Part B — jargon → tooltip (move the explanation onto the term)

| # | Term (gets the tooltip) | Inline prose to REMOVE and fold into the tooltip |
|---|---|---|
| B1 | **Offsets & adjustments** (dept fiche heading) + each "Transfer Adjustment" row | "Negative lines are kept out of the bars: transfer adjustments cancel money moving between funds, and overhead recoveries are charges billed to other departments." (currently a standalone paragraph) |
| B2 | **Operating funds** (budget s05, dept fiche caveat) | keep the one-line caveat, but put "capital and multi-year project funds spend across years and can't be compared to a single year's budget" on a tooltip on the term |
| B3 | **perimeter** (the tag in the adopted-vs-executed table) | "Rows tagged 'perimeter' are structural artifacts of where money is parked or which funds execute it" → tooltip on the tag |
| B4 | **sole-source** (contracts) | the "continuity of care, a single existing supplier, software the City already runs" examples → tooltip; keep the section title short |
| B5 | **Unilateral** / paid-exceeds-agreed (contracts s05.note) | "'Unilateral' construction contracts… payments accumulate across contract modifications while the agreed amount reflects the base document" → tooltip on the flag |
| B6 | **LBE** (Local Business Enterprise, contracts s04) | expand the acronym once + tooltip: "San Francisco certifies Local Business Enterprises and tracks them on contract teams" |
| B7 | **fiscal agent / pass-through** (who-gets-paid toggle) | the two toggle notes ("banks acting as bond trustees or paying agents… flows through them, not payments for their services") → tooltip on the toggle label |
| B8 | **Total compensation** (payroll hero) | "= salary + overtime + other pay + benefits (retirement, health & dental). Per person, per year — not FTE-adjusted." → tooltip on the term |
| B9 | **Charges for Services** (budget s04 callout) | the enterprise-billing explanation (SF General, airport, water) — keep as a callout OR tooltip on the label; your call |

Bare terms elsewhere that could use a first-mention tooltip if you want them:
**voucher**, **prime**, **appropriation**, **executed / execution**, **residual /
deviation**, **character** (SF's word for spending type — already relabeled
"category" on the dept fiche, good).

## Keep as-is (load-bearing — flagging so you know I'm NOT cutting these)

- All per-section **source lines** and the **Sources & method** blocks.
- Honesty caveats: the Operating-funds comparison note (B2 keeps a short form),
  the **individual-payee** note ("mostly landlords… never featured in rankings"),
  the **nonprofit ranking** separation note, the **FY2018** migration note.
- Status banners (adopted-only / preliminary) — they prevent misreading a year.
- The analytical one-liners that ARE the insight (e.g. payroll overtime story,
  the "$500k group is mostly public-safety supervisors and hospital physicians",
  the budget spine "SF routinely spends slightly under, FY2021 the outlier").
