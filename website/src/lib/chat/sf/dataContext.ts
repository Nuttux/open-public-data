import { GENERATED_SF_INVENTORY as INV } from "./dataContext.generated";

// Same split as Paris: the factual inventory (years, totals) is GENERATED from
// public/data/us/sf (npm run gen:chat-context). Only formatting and the
// editorial layer — traps, glossary — are hand-written here, because they are
// judgement calls about how the data misleads, not facts about it.

const usd = (v: number) => `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const yearRange = (ys: readonly number[]) => (ys.length ? `FY${Math.min(...ys)}–FY${Math.max(...ys)}` : "unavailable");

function budgetBlock(): string {
  const b = INV.budget;
  const totals = Object.entries(b.totalsByYear)
    .slice(-6)
    .map(([y, t]) => `  - FY${y}: ${usd(t.spending_usd)}${t.per_resident_usd ? ` (${usd(t.per_resident_usd)} per resident)` : ""} — ${t.execution_status}`)
    .join("\n");
  const pop = b.population;
  return `### BUDGET — what the City adopts
- Fiscal years: ${yearRange(b.years)}. Breakdown by department/character/fund: ${yearRange(INV.breakdown.years)}. Line-item drill: ${yearRange(INV.deptDetail.years)}.
- Adopted spending, most recent years:
${totals}
- Tools: get_budget_by_year (series), get_budget_breakdown (one year by dimension), get_department_budget (one department by character), get_department_line_items (deepest drill), get_budget_vs_actual.
${pop ? `- Population: ${usd(pop.value).replace("$", "")} (${pop.year}, ${pop.source}). Use ONLY this figure for per-resident maths.` : ""}
- TRAP — ALL FUNDS: SF's budget covers enterprise operations most cities do not run in their general fund (the airport, the Public Utilities Commission, the Port, MTA). Per-resident figures are therefore NOT comparable to a city that budgets only general-fund services. Say so when you quote one.
- TRAP — NET totals: the source embeds negative "Transfer Adjustment" lines and every total here is net of them. Do not re-add or re-net them.
- TRAP — two-year cycle: San Francisco adopts a balanced TWO-year budget, so the two most recent fiscal years are adopted in the same ordinance and revenue equals spending by construction. A "balanced budget" is an accounting fact here, not an achievement to report.
- TRAP — adopted ≠ spent: get_budget_by_year is what was ADOPTED. Actual spending is get_budget_vs_actual only.`;
}

function contractsBlock(): string {
  const c = INV.contracts;
  if (!c) return "";
  return `### CONTRACTS — the supplier register
- Register: ${c.register.n_contracts?.toLocaleString("en-US")} contracts, ${usd(c.register.agreed_usd ?? 0)} agreed, ${usd(c.register.paid_usd ?? 0)} actually paid. Active today: ${c.active.n_contracts?.toLocaleString("en-US")} contracts, ${usd(c.active.agreed_usd ?? 0)} agreed.
- Tools: get_contracts_overview (landscape), search_contracts (keyword).
- TRAP CRITICAL — agreed ≠ spent: agreed_usd is the contract CEILING over its entire multi-year term. paid_usd is what has gone out of the door. Never present an agreed amount as spending, and prefer paid when the question is "how much did X get".
- TRAP — the register includes GRANTS THE CITY GIVES OUT (its largest single contract type), rents, and other non-purchasing agreements. "Contracts" here is not the same as "procurement of services".
- TRAP — search_contracts covers contracts ACTIVE TODAY only. Expired contracts exist in the register but are not searchable — never imply a complete historical view.`;
}

function payeesBlock(): string {
  return `### VENDOR PAYMENTS — who actually gets paid
- Fiscal years: ${yearRange(INV.payees.years)}. Tools: get_top_payees (ranking for a year), search_payee (one vendor across years).
- TRAP CRITICAL — the largest payees are NOT suppliers. Banks and trustees at the top of the ranking are fiscal agents moving the City's own money (debt service, payroll tax remittance). The bucket field says what each payee is. Describing them as "the City's biggest contractors" is factually wrong.
- TRAP — vendor names are unkeyed portal strings: one institution can appear under several spellings. Check variants before stating a total.
- TRAP — coverage is each year's top ~1,000 payees (≈95–97% of dollars), not every vendor. Fine for rankings, wrong for "the complete list".
- Individual people paid by the City (mostly landlords) are in the source but excluded from search results: never name a private individual.`;
}

function payrollBlock(): string {
  const p = INV.payroll;
  const l = p.latest;
  return `### PAYROLL — what staff costs
- Fiscal years: ${yearRange(p.years)}.${l ? ` Latest FY${l.fiscal_year}: ${usd(l.total_compensation_usd ?? 0)} total compensation, ${l.n_employees?.toLocaleString("en-US")} people paid, median ${usd(l.median_total_comp_usd ?? 0)}.` : ""}
- Tools: get_payroll_by_year (series), get_payroll_by_department, get_payroll_by_family (job families), get_payroll_distribution (percentiles), get_payroll_overtime.
- TRAP — headcount is NOT full-time equivalents: it counts everyone paid in the year, including part-year and part-time staff. Average pay per head is therefore pulled down by seasonal and partial-year workers. Prefer the median, and say which you used.
- TRAP — compensation includes benefits (retirement, health). Salary alone is a different, smaller number; be explicit about which one you are quoting.
- Privacy floor: no dollar aggregate covers fewer than 5 employees; small groups are pooled. Never try to isolate an individual's pay.`;
}

export const SF_DATA_CONTEXT = `# Available data

Scope: the City and County of San Francisco (a consolidated city-county — the same government runs both, so there is no separate county budget). Sources: the SF open data portal (data.sfgov.org), published by the Controller's Office, plus U.S. Census population estimates — through this project's dbt pipeline. The inventory below (years, totals) is generated from the pipeline's exports.

Fiscal years: SF fiscal year N runs July 1 (N-1) to June 30 (N). Every figure here is fiscal-year accounting. Write "FY2025", never "2025" alone, so a reader cannot mistake it for a calendar year.

${budgetBlock()}

${contractsBlock()}

${payeesBlock()}

${payrollBlock()}

## Guide: user question → right tool
- "how big is the budget", "is spending growing" → get_budget_by_year
- "where does the money go", "biggest departments", "how much on salaries" → get_budget_breakdown
- "what does the police/health/transit department get" → get_department_budget
- "what exactly did that pay for", "which vendors" → get_department_line_items
- "does the City spend what it budgets" → get_budget_vs_actual
- "who does the City contract with", "how much is under contract" → get_contracts_overview / search_contracts
- "who gets paid the most", a named organisation → get_top_payees / search_payee
- "how many employees", "what does staff cost" → get_payroll_by_year / get_payroll_by_department
- "what do nurses/police earn", "typical City salary" → get_payroll_by_family / get_payroll_distribution
- "overtime" → get_payroll_overtime

## Frequent clarifications
- "How much does SF spend on X" → the adopted budget breakdown, NOT the sum of contracts and payments (those are partial, overlapping views of the same dollars).
- "Money given to X" → payments if X is a vendor or non-profit (search_payee), contracts if the question is about an agreement and its ceiling.
- A contract ceiling, a payment, and a budget line are three different measurements. Never add them together.`;
