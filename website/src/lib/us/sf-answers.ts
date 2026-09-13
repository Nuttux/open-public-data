/**
 * The answer every San Francisco entity page opens with — title + one
 * sentence (lib/seo/page-answer.ts). Typed structurally on the fields each
 * page already loads, so the loaders stay the single source of the numbers.
 *
 * Sources named here are the ones the fiches already cite: the SF Controller's
 * open data (vendor payments, employee compensation, supplier contracts,
 * adopted budget) and the Internet Archive for places.
 */
import { fmtUsd, fmtUsdCompact, fmtShare } from "@/lib/us/format";
import { isoDate, n, sourceSentence, type PageAnswer } from "@/lib/seo/page-answer";
import { titleName } from "@/lib/entities/seo-text";

const SRC_PAYMENTS = "SF Controller vendor payments (open data)";
const SRC_PAYROLL = "SF Controller employee compensation (open data)";
const SRC_CONTRACTS = "SF Controller supplier contracts (open data)";
const SRC_BUDGET = "San Francisco adopted budget (Controller open data)";

const src = (name: string, iso?: string | null) => sourceSentence("en", name, isoDate(iso, "en"));

export function payeeAnswer(p: {
  name: string;
  total_paid_usd: number;
  first_year: number | null;
  last_year: number | null;
  top_departments: string[];
  n_contracts_held: number;
  as_of?: string;
}): PageAnswer {
  const amt = fmtUsdCompact(p.total_paid_usd);
  const lead =
    p.first_year != null && p.last_year != null && p.first_year !== p.last_year
      ? `Between ${p.first_year} and ${p.last_year},`
      : p.last_year != null
        ? `In ${p.last_year},`
        : "";
  const dept = p.top_departments[0];
  return {
    title: `${titleName(p.name)}: ${amt} paid by San Francisco`,
    answer: `${lead} the City and County of San Francisco paid ${amt} to ${p.name}${dept ? `, mostly through ${dept}` : ""}${
      p.n_contracts_held > 0 ? `, with ${n("contract", p.n_contracts_held)} on file` : ""
    }. ${src(SRC_PAYMENTS, p.as_of)}`.trim(),
  };
}

export function categoryAnswer(d: {
  label: string;
  paidUsd: number;
  fiscalYear: number;
  nVendors: number;
  nDepartments: number;
  shareOfYear: number;
}): PageAnswer {
  return {
    title: `${d.label}: ${fmtUsdCompact(d.paidUsd)} paid by San Francisco to ${n("payee", d.nVendors)} in FY${d.fiscalYear}`,
    answer: `In FY${d.fiscalYear}, San Francisco paid ${fmtUsdCompact(d.paidUsd)} for ${d.label.toLowerCase()} to ${n("payee", d.nVendors)} across ${n("department", d.nDepartments)}, ${fmtShare(d.shareOfYear)} of the year's payments. ${src(SRC_PAYMENTS)}`,
  };
}

export function payrollDeptAnswer(d: {
  name: string;
  fiscalYear: number;
  latest: { n_employees: number; total_compensation_usd: number; median_total_comp_usd: number };
  shareOfCityPayroll: number | null;
}): PageAnswer {
  const amt = fmtUsdCompact(d.latest.total_compensation_usd);
  return {
    title: `${d.name}: ${amt} in pay for ${n("employee", d.latest.n_employees)}, San Francisco FY${d.fiscalYear}`,
    answer: `In FY${d.fiscalYear}, San Francisco's ${d.name} paid ${n("person", d.latest.n_employees, "en", "people")} ${amt} in total, a median of ${fmtUsd(d.latest.median_total_comp_usd)} each${
      d.shareOfCityPayroll != null ? `, ${fmtShare(d.shareOfCityPayroll)} of the city payroll` : ""
    }. ${src(SRC_PAYROLL)}`,
  };
}

export function payrollFamilyAnswer(d: {
  family: string;
  fiscalYear: number;
  latest: { n_employees: number; total_compensation_usd: number };
  pay: { p50_usd: number } | null;
  shareOfCityPayroll: number | null;
}): PageAnswer {
  const amt = fmtUsdCompact(d.latest.total_compensation_usd);
  return {
    title: `${d.family} in San Francisco: ${n("city employee", d.latest.n_employees)}, ${amt} in pay (FY${d.fiscalYear})`,
    answer: `In FY${d.fiscalYear}, San Francisco paid ${amt} to ${n("employee", d.latest.n_employees)} in ${d.family.toLowerCase()} jobs${
      d.pay ? `, a median of ${fmtUsd(d.pay.p50_usd)} each` : ""
    }${d.shareOfCityPayroll != null ? `, ${fmtShare(d.shareOfCityPayroll)} of the city payroll` : ""}. ${src(SRC_PAYROLL)}`,
  };
}

export function payrollRoleAnswer(d: {
  label: string;
  family: string;
  fiscalYear: number;
  latest: { n_employees: number; total_compensation_usd: number };
}): PageAnswer {
  const amt = fmtUsdCompact(d.latest.total_compensation_usd);
  const avg = d.latest.n_employees > 0 ? fmtUsd(Math.round(d.latest.total_compensation_usd / d.latest.n_employees)) : null;
  return {
    title: `${d.label} pay in San Francisco: ${amt} for ${n("person", d.latest.n_employees, "en", "people")} (FY${d.fiscalYear})`,
    answer: `In FY${d.fiscalYear}, San Francisco paid ${amt} to ${n("person", d.latest.n_employees, "en", "people")} with the job code ${d.label}${
      avg ? `, about ${avg} each on average` : ""
    }, in the ${d.family.toLowerCase()} family. ${src(SRC_PAYROLL)}`,
  };
}

export function payrollAreaAnswer(d: {
  name: string;
  fiscalYear: number;
  latest: { total_compensation_usd: number; n_employees_listed: number; n_departments: number };
  shareOfCityPayroll: number | null;
}): PageAnswer {
  const amt = fmtUsdCompact(d.latest.total_compensation_usd);
  return {
    title: `${d.name}: ${amt} in pay across ${n("department", d.latest.n_departments)}, San Francisco FY${d.fiscalYear}`,
    answer: `In FY${d.fiscalYear}, the ${n("department", d.latest.n_departments)} of San Francisco's ${d.name} paid ${n("person", d.latest.n_employees_listed, "en", "people")} ${amt}${
      d.shareOfCityPayroll != null ? `, ${fmtShare(d.shareOfCityPayroll)} of the city payroll` : ""
    }. ${src(SRC_PAYROLL)}`,
  };
}

export function budgetDeptAnswer(
  d: {
    label: string;
    display_name: string | null;
    spending: { total_usd: number; share_of_side: number } | null;
    revenue: { total_usd: number } | null;
    as_of: string | null;
  },
  year: number,
): PageAnswer {
  const name = d.display_name ?? d.label;
  if (!d.spending) {
    return {
      title: `${name}: San Francisco budget FY${year}`,
      answer: `${name} in San Francisco's adopted budget for fiscal year ${year}${d.revenue ? `: ${fmtUsdCompact(d.revenue.total_usd)} of revenue` : ""}. ${src(SRC_BUDGET, d.as_of)}`,
    };
  }
  const amt = fmtUsdCompact(d.spending.total_usd);
  return {
    title: `${name}: ${amt} in the San Francisco FY${year} budget`,
    answer: `In fiscal year ${year}, San Francisco budgeted ${amt} for ${name}, ${fmtShare(d.spending.share_of_side)} of city spending${
      d.revenue ? `, against ${fmtUsdCompact(d.revenue.total_usd)} of revenue it brings in` : ""
    }. ${src(SRC_BUDGET, d.as_of)}`,
  };
}

export function budgetServiceAnswer(
  s: { label: string; total_usd: number; share_of_side: number; n_departments: number; side: string; as_of: string | null },
  year: number,
): PageAnswer {
  const amt = fmtUsdCompact(s.total_usd);
  return {
    title: `${s.label}: ${amt} across ${n("department", s.n_departments)}, San Francisco FY${year} budget`,
    answer: `In fiscal year ${year}, the ${n("department", s.n_departments)} grouped under ${s.label} account for ${amt}, ${fmtShare(s.share_of_side)} of San Francisco's ${s.side}. ${src(SRC_BUDGET, s.as_of)}`,
  };
}

export function budgetCharacterAnswer(
  c: { label: string; total_usd: number; share_of_side: number; n_departments: number; side: string; as_of: string | null },
  year: number,
): PageAnswer {
  const amt = fmtUsdCompact(c.total_usd);
  return {
    title: `${c.label}: ${amt} of San Francisco's FY${year} ${c.side} budget`,
    answer: `In fiscal year ${year}, ${c.label.toLowerCase()} makes up ${amt} of San Francisco's adopted ${c.side}, ${fmtShare(c.share_of_side)} of the total, spread over ${n("department", c.n_departments)}. ${src(SRC_BUDGET, c.as_of)}`,
  };
}

export function budgetDeptCharacterAnswer(
  d: {
    dept: { label: string; display_name: string | null };
    character: { label: string };
    amount_usd: number;
    dept_total_usd: number;
    side: string;
    as_of: string | null;
  },
  year: number,
): PageAnswer {
  const name = d.dept.display_name ?? d.dept.label;
  const amt = fmtUsdCompact(d.amount_usd);
  const share = d.dept_total_usd > 0 ? fmtShare(d.amount_usd / d.dept_total_usd) : null;
  return {
    title: `${name}, ${d.character.label}: ${amt} in San Francisco's FY${year} budget`,
    answer: `In fiscal year ${year}, ${name} has ${amt} of ${d.character.label.toLowerCase()} in San Francisco's adopted ${d.side}${
      share ? `, ${share} of the department's total` : ""
    }, line by line, with the vendor payments that funded it. ${src(SRC_BUDGET, d.as_of)}`,
  };
}

export function contractAnswer(f: {
  as_of: string | null;
  contract: {
    contract_no: string;
    title: string;
    title_plain: string | null;
    title_clear: string | null;
    what_concretely: string | null;
    department: string | null;
    prime_contractor: string | null;
    term_start: string | null;
    agreed_usd: number;
    paid_usd: number;
  };
}): PageAnswer {
  const c = f.contract;
  const label = (c.title_clear || c.title_plain || c.title || `Contract ${c.contract_no}`).trim();
  const short = label.length > 60 ? `${label.slice(0, 60).replace(/[\s,;:–-]+$/u, "")}…` : label;
  const year = c.term_start ? new Date(c.term_start).getFullYear() : null;
  const who = c.prime_contractor ?? "an unnamed supplier";
  const agreed = fmtUsdCompact(c.agreed_usd);
  const paid = fmtUsdCompact(c.paid_usd);
  return {
    title: `${short}: ${agreed} San Francisco contract with ${who}${year && Number.isFinite(year) ? ` (${year})` : ""}`,
    answer: `${c.what_concretely ? `${c.what_concretely.trim().replace(/\.$/u, "")}. ` : ""}San Francisco agreed ${agreed} with ${who} for contract ${c.contract_no}${
      c.department ? ` (${c.department})` : ""
    }; ${paid} has been paid on it so far. ${src(SRC_CONTRACTS, f.as_of)}`,
  };
}

export function contractTypeAnswer(d: { label: string; register: { n_contracts: number; agreed_usd: number } }): PageAnswer {
  return {
    title: `${d.label}: ${n("San Francisco contract", d.register.n_contracts)}, ${fmtUsdCompact(d.register.agreed_usd)} agreed`,
    answer: `San Francisco's supplier register holds ${n("contract", d.register.n_contracts)} of the type "${d.label}", worth ${fmtUsdCompact(d.register.agreed_usd)} agreed in total, the biggest of them active today. ${src(SRC_CONTRACTS)}`,
  };
}

export function contractDeptAnswer(d: { label: string; n_active: number; activeAgreedUsd: number }): PageAnswer {
  return {
    title: `${d.label}: ${n("active contract", d.n_active)}, ${fmtUsdCompact(d.activeAgreedUsd)} agreed, San Francisco`,
    answer: `San Francisco's ${d.label} holds ${n("agreement", d.n_active)} active today, worth ${fmtUsdCompact(d.activeAgreedUsd)} agreed, with its biggest suppliers and how much was awarded without competition. ${src(SRC_CONTRACTS)}`,
  };
}

export function contractAuthorityAnswer(d: { label: string; register: { n_contracts: number; agreed_usd: number } }): PageAnswer {
  return {
    title: `${d.label}: ${n("San Francisco contract", d.register.n_contracts)}, ${fmtUsdCompact(d.register.agreed_usd)} agreed`,
    answer: `${n("contract", d.register.n_contracts)} in San Francisco's supplier register were awarded under ${d.label.toLowerCase()}, ${fmtUsdCompact(d.register.agreed_usd)} agreed in total. ${src(SRC_CONTRACTS)}`,
  };
}

export function placeAnswer(p: {
  name: string;
  kind: string;
  owning_dept: { name: string };
  summary_en: string | null;
  money: {
    budget_line: { total_usd: number; fiscal_year: number } | null;
    payroll_line: { total_compensation_usd: number; n_employees: number; fiscal_year: number } | null;
    contracts: unknown[];
  };
  capital: { n_items: number } | null;
  documents: unknown[];
}): PageAnswer {
  const bits: string[] = [];
  if (p.money.budget_line) bits.push(`${fmtUsdCompact(p.money.budget_line.total_usd)} budgeted for its department in FY${p.money.budget_line.fiscal_year}`);
  if (p.money.payroll_line && p.money.payroll_line.n_employees > 0) bits.push(`${n("employee", p.money.payroll_line.n_employees)} on the payroll`);
  if (p.money.contracts.length > 0) bits.push(n("contract", p.money.contracts.length));
  if (p.capital && p.capital.n_items > 0) bits.push(n("capital project", p.capital.n_items));
  if (p.documents.length > 0) bits.push(`${n("city document", p.documents.length)} at the Internet Archive`);
  const facts = bits.length ? `${bits.join(", ")}, every figure linked to its source.` : "the city money that reaches it and the documents that mention it, every fact linked to its source.";
  const summary = p.summary_en ? `${p.summary_en.trim().replace(/\.$/u, "")}. ` : "";
  return {
    title: `${p.name}: what San Francisco spends and decided on it`,
    answer: `${summary}${p.name} (${p.kind.toLowerCase()}, run by the ${p.owning_dept.name}): ${facts} ${src("SF Controller open data and the Internet Archive")}`,
  };
}
