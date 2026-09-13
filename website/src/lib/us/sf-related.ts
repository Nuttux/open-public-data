/**
 * "See also" blocks of the San Francisco fiches (components/fiche/RelatedLinks.tsx).
 * Each row comes from the export the target route reads, through the same
 * lookup that route uses (a fiche file, a slug map, an href helper that
 * returns null when the page does not exist), so a listed row always lands.
 * Copy lives in the dictionaries under `us.sf.related.*` (EN-only, mirrored
 * verbatim in fr.ts like every SF key).
 */
import type { RelatedBlock, RelatedRow } from "@/components/fiche/RelatedLinks";
import {
  loadSfContractDeptBars,
  loadSfContractFiche,
  loadSfContractsActive,
  loadSfContractsOverview,
  loadSfContractType,
  sfContractDeptHref,
} from "@/app/[lang]/usa/san-francisco/contracts/data";
import { contractLabel, FAMILY_LABELS, typeLabel, typeSlug, type SfContractFiche } from "@/app/[lang]/usa/san-francisco/contracts/us-sf-contracts-types";
import type { SfAuthorityData } from "@/components/us/SfAuthorityFiche";
import type { SfContractTypeData } from "@/components/us/SfContractTypeFiche";
import type { SfDeptContractsData } from "@/components/us/SfDeptContractsFiche";
import { readDataJsonOrNull } from "@/lib/data/read";
import { contractPrimePayeeSlug, loadSfPayee, loadSfPayeesIndex, type SfPayeeFicheData } from "@/lib/us/sf-payees-data";
import { loadSfCategorySlugMap } from "@/lib/us/sf-category-links";
import type { SfCategoryData } from "@/lib/us/sf-spending";
import { loadSfPayrollArea, sfPayrollAreaSlugs, sfPayrollDeptSlugs, type SfPayrollAreaData, type SfPayrollDeptData, type SfPayrollRoleData } from "@/lib/us/sf-payroll-entities";
import { familySlug, payrollDeptSlug } from "@/lib/us/sf-payroll-slugs";
import type { SfPayrollFamilyData } from "@/lib/us/sf-payroll-family";
import { loadSfBudgetBreakdown, type SfCharacterFicheData, type SfDeptCharacterDetailData, type SfServiceFicheData } from "@/lib/us/sf-budget-data";
import { characterSlug, deptSlug, serviceSlug } from "@/lib/us/sf-budget-slugs";
import { hoodNeighbourPages, streetRelatedPages, type CityPage } from "@/lib/us/sf-city-pages";
import { loadSfPlacesIndex, type SfPlaceFicheData } from "@/lib/us/sf-places-data";
import { fmtUsdCompact } from "@/lib/us/format";
import { relatedT } from "@/lib/related-t";

const t = relatedT("en");
const usd = (n: number) => ({ v: fmtUsdCompact(n), u: "" });
const block = (sub: string, rows: RelatedRow[]): RelatedBlock => ({ title: t("us.sf.related.title"), sub, rows });

/**
 * The entries around position `at` in a ranked list — the page's neighbours
 * in the list its hub shows, nearest first, alternating above and below — so
 * each fiche links to different pages rather than every one to the top three.
 */
function neighbours<T>(list: T[], at: number, n: number): T[] {
  const picked: number[] = [];
  for (let d = 1; picked.length < n && (at - d >= 0 || at + d < list.length); d++) {
    if (at - d >= 0) picked.push(at - d);
    if (picked.length < n && at + d < list.length) picked.push(at + d);
  }
  // Shown in the list's own order, so the amounts still read as a ranking.
  return picked.sort((a, b) => a - b).map((i) => list[i]);
}

/**
 * Contract: the same contractor's other contracts that have a fiche, what the
 * City paid that contractor, the department's contracts and the contract
 * type — the last two are facets the fiche names inline; here they are rows.
 */
export function sfContractRelated(fiche: SfContractFiche): RelatedBlock | null {
  const c = fiche.contract;
  const rows: RelatedRow[] = [];
  const prime = c.prime_contractor?.trim();
  const active = loadSfContractsActive().rows;
  const byAgreed = (a: { agreed_usd: number }, b: { agreed_usd: number }) => b.agreed_usd - a.agreed_usd;
  const same = prime
    ? active
      .filter((r) => r.prime?.trim() === prime && r.contract_no !== c.contract_no && r.agreed_usd > 0)
      .sort(byAgreed)
      .filter((r) => loadSfContractFiche(r.contract_no))
      .slice(0, 3)
    : [];
  for (const r of same) {
    rows.push({
      href: `/usa/san-francisco/contracts/contract/${r.contract_no}`,
      label: contractLabel(r) || t("us.sf.related.contract_fallback", { no: r.contract_no }),
      sub: r.department ? t("us.sf.related.same_prime_dept", { dept: r.department }) : t("us.sf.related.same_prime"),
      amount: usd(r.agreed_usd),
    });
  }
  // A contractor with no other contract on file: the department's largest
  // active contracts of the same type stand in, so the block still leads on.
  if (same.length < 2 && c.department_code && c.contract_type) {
    const taken = new Set([c.contract_no, ...same.map((r) => r.contract_no)]);
    for (const r of active
      .filter((r) => r.department_code === c.department_code && r.contract_type === c.contract_type && !taken.has(r.contract_no) && r.agreed_usd > 0)
      .sort(byAgreed)
      .filter((r) => loadSfContractFiche(r.contract_no))
      .slice(0, 2 - same.length)) {
      rows.push({
        href: `/usa/san-francisco/contracts/contract/${r.contract_no}`,
        label: contractLabel(r) || t("us.sf.related.contract_fallback", { no: r.contract_no }),
        sub: r.prime ? t("us.sf.related.same_dept_type_prime", { prime: r.prime }) : t("us.sf.related.same_dept_type"),
        amount: usd(r.agreed_usd),
      });
    }
  }
  if (prime) {
    const payee = contractPrimePayeeSlug(c.contract_no);
    if (payee) {
      rows.push({ href: `/usa/san-francisco/who-gets-paid/payee/${payee}`, label: t("us.sf.related.payee", { name: prime }), sub: t("us.sf.related.payee_sub") });
    }
  }
  const deptHref = sfContractDeptHref(c.department_code);
  if (deptHref && c.department) {
    rows.push({ href: deptHref, label: t("us.sf.related.dept_contracts", { dept: c.department }), sub: t("us.sf.related.dept_contracts_sub") });
  }
  const type = c.contract_type ? loadSfContractType(typeSlug(c.contract_type)) : null;
  if (type) {
    rows.push({
      href: `/usa/san-francisco/contracts/type/${typeSlug(type.raw)}`,
      label: t("us.sf.related.type", { type: typeLabel(type.raw) }),
      sub: t("us.sf.related.type_sub"),
      amount: usd(type.register.agreed_usd),
    });
  }
  return { title: t("us.sf.related.title"), sub: t("us.sf.related.contract_sub"), rows };
}

/* ── Who gets paid ─────────────────────────────────────────────────────── */

type PayeeLite = { slug: string; name: string; total: number; dept: string | null; deptName: string | null };
let _payeesByDept: PayeeLite[] | null = null;
/** Every keyed payee with its main paying department — read once per process
 *  (~200 small files), like contractPrimePayeeSlug. */
function payeesLite(): PayeeLite[] {
  if (_payeesByDept) return _payeesByDept;
  _payeesByDept = loadSfPayeesIndex().flatMap((p) => {
    const f = loadSfPayee(p.slug);
    if (!f) return [];
    const top = f.profile?.departments?.[0];
    return [{ slug: p.slug, name: f.name, total: f.total_paid_usd, dept: top?.department_code ?? null, deptName: top?.department ?? null }];
  });
  return _payeesByDept;
}

/**
 * Payee: the other keyed payees its main department pays most (else its
 * neighbours in the payee ranking), its main spending category, that
 * department's contracts, and the hub.
 */
export function sfPayeeRelated(p: SfPayeeFicheData): RelatedBlock | null {
  const rows: RelatedRow[] = [];
  const all = payeesLite();
  const me = all.find((x) => x.slug === p.slug);
  const sameDept = me?.dept ? all.filter((x) => x.dept === me.dept && x.slug !== p.slug).sort((a, b) => b.total - a.total).slice(0, 3) : [];
  for (const x of sameDept) {
    rows.push({ href: `/usa/san-francisco/who-gets-paid/payee/${x.slug}`, label: x.name, sub: t("us.sf.related.payee_same_dept", { dept: x.deptName ?? "" }), amount: usd(x.total) });
  }
  if (sameDept.length < 2) {
    const ranked = all.slice().sort((a, b) => b.total - a.total);
    const taken = new Set(sameDept.map((x) => x.slug));
    for (const x of neighbours(ranked, ranked.findIndex((x) => x.slug === p.slug), 3).filter((x) => !taken.has(x.slug)).slice(0, 3 - sameDept.length)) {
      rows.push({ href: `/usa/san-francisco/who-gets-paid/payee/${x.slug}`, label: x.name, sub: t("us.sf.related.payee_rank"), amount: usd(x.total) });
    }
  }
  const slugs = loadSfCategorySlugMap();
  const cat = (p.profile?.categories ?? []).find((c) => slugs[c.code]);
  if (cat) {
    rows.push({ href: `/usa/san-francisco/who-gets-paid/category/${slugs[cat.code]}`, label: t("us.sf.related.category", { label: cat.label }), sub: t("us.sf.related.category_sub") });
  }
  const deptHref = sfContractDeptHref(me?.dept);
  if (deptHref && me?.deptName) rows.push({ href: deptHref, label: t("us.sf.related.dept_contracts", { dept: me.deptName }), sub: t("us.sf.related.dept_contracts_sub") });
  rows.push({ href: "/usa/san-francisco/who-gets-paid", label: t("us.sf.related.hub_wgp"), sub: t("us.sf.related.hub_wgp_sub") });
  return block(t("us.sf.related.payee_block_sub"), rows);
}

type SpendingLite = { years: Record<string, { code: string; label: string; spend_class: string; paid_usd: number }[]> };

/** Spending category: its neighbours among the same year's categories of the same kind that have a page, and the hub. */
export function sfCategoryRelated(d: SfCategoryData): RelatedBlock | null {
  const file = readDataJsonOrNull<SpendingLite>("us/sf/spending_subobjects.json");
  const slugs = loadSfCategorySlugMap();
  const ranked = (file?.years[String(d.fiscalYear)] ?? [])
    .filter((r) => r.spend_class === d.spendClass && slugs[r.code] && r.paid_usd > 0)
    .sort((a, b) => b.paid_usd - a.paid_usd);
  const rows: RelatedRow[] = neighbours(ranked, ranked.findIndex((r) => r.code === d.code), 5).map((r) => ({
    href: `/usa/san-francisco/who-gets-paid/category/${slugs[r.code]}?year=${d.fiscalYear}`,
    label: r.label,
    sub: t("us.sf.related.category_peer_sub", { fy: d.fiscalYear }),
    amount: usd(r.paid_usd),
  }));
  rows.push({ href: "/usa/san-francisco/who-gets-paid", label: t("us.sf.related.hub_wgp"), sub: t("us.sf.related.hub_wgp_sub") });
  return block(t("us.sf.related.category_block_sub", { fy: d.fiscalYear }), rows);
}

/* ── Contracts facets ──────────────────────────────────────────────────── */

const contractsHub = (): RelatedRow => ({ href: "/usa/san-francisco/contracts", label: t("us.sf.related.hub_contracts"), sub: t("us.sf.related.hub_contracts_sub") });

/** Department (contracts): its budget and payroll pages, its neighbours in the ranking of active contracts, the hub. */
export function sfContractDeptRelated(d: SfDeptContractsData): RelatedBlock | null {
  const rows: RelatedRow[] = [];
  if (d.budgetHref) rows.push({ href: d.budgetHref, label: t("us.sf.related.dept_budget", { dept: d.name }), sub: t("us.sf.related.dept_budget_sub") });
  const payroll = payrollDeptSlug(d.code);
  if (sfPayrollDeptSlugs().includes(payroll)) rows.push({ href: `/usa/san-francisco/payroll/dept/${payroll}`, label: t("us.sf.related.dept_payroll", { dept: d.name }), sub: t("us.sf.related.dept_payroll_sub") });
  const bars = loadSfContractDeptBars(1000);
  for (const b of neighbours(bars, bars.findIndex((b) => b.code === d.code), 3)) {
    const href = sfContractDeptHref(b.code);
    if (href) rows.push({ href, label: b.name, sub: t("us.sf.related.dept_peer_sub", { n: b.n_contracts.toLocaleString("en-US") }), amount: usd(b.agreed_usd) });
  }
  rows.push(contractsHub());
  return block(t("us.sf.related.dept_block_sub"), rows);
}

/** Contract type: its neighbours in the register's ranking of types, the hub. */
export function sfContractTypeRelated(d: SfContractTypeData): RelatedBlock | null {
  const ranked = loadSfContractsOverview().landscape.by_type.slice().sort((a, b) => b.agreed_usd - a.agreed_usd);
  const rows: RelatedRow[] = neighbours(ranked, ranked.findIndex((r) => r.contract_type === d.raw), 5).map((r) => ({
    href: `/usa/san-francisco/contracts/type/${typeSlug(r.contract_type)}`,
    label: typeLabel(r.contract_type),
    sub: t("us.sf.related.register_sub", { n: r.n_contracts.toLocaleString("en-US") }),
    amount: usd(r.agreed_usd),
  }));
  rows.push(contractsHub());
  return block(t("us.sf.related.type_block_sub"), rows);
}

/** Purchasing authority: the other authority families of the register, the hub. */
export function sfAuthorityRelated(d: SfAuthorityData): RelatedBlock | null {
  const ranked = loadSfContractsOverview().authority_families.families.slice().sort((a, b) => b.agreed_usd - a.agreed_usd);
  const rows: RelatedRow[] = neighbours(ranked, ranked.findIndex((f) => f.family === d.family), 5).map((f) => ({
    href: `/usa/san-francisco/contracts/authority/${f.family}`,
    label: FAMILY_LABELS[f.family] ?? f.family,
    sub: t("us.sf.related.register_sub", { n: f.n_contracts.toLocaleString("en-US") }),
    amount: usd(f.agreed_usd),
  }));
  rows.push(contractsHub());
  return block(t("us.sf.related.authority_block_sub"), rows);
}

/* ── Budget ────────────────────────────────────────────────────────────── */

const budgetHub = (fy: number): RelatedRow => ({ href: `/usa/san-francisco/budget?year=${fy}`, label: t("us.sf.related.hub_budget", { fy }), sub: t("us.sf.related.hub_budget_sub") });
const sideWord = (side: string) => t(side === "revenue" ? "us.sf.related.side_revenue" : "us.sf.related.side_spending");

/** Spending/revenue type: its neighbours on the same side of the same year, the budget. */
export function sfCharacterRelated(c: SfCharacterFicheData): RelatedBlock | null {
  const bd = loadSfBudgetBreakdown(c.fiscal_year);
  const ranked = (bd?.characters[c.side] ?? []).filter((r) => r.total_usd > 0).sort((a, b) => b.total_usd - a.total_usd);
  const rows: RelatedRow[] = neighbours(ranked, ranked.findIndex((r) => r.code === c.code), 5).map((r) => ({
    href: `/usa/san-francisco/budget/character/${characterSlug(r.code)}?year=${c.fiscal_year}&side=${c.side}`,
    label: r.label,
    sub: t("us.sf.related.budget_peer_sub", { side: sideWord(c.side), fy: c.fiscal_year }),
    amount: usd(r.total_usd),
  }));
  rows.push(budgetHub(c.fiscal_year));
  return block(t("us.sf.related.character_block_sub", { fy: c.fiscal_year }), rows);
}

/** Service area: the other service areas on the same side of the same year, the budget. */
export function sfServiceRelated(sv: SfServiceFicheData): RelatedBlock | null {
  const bd = loadSfBudgetBreakdown(sv.fiscal_year);
  const rows: RelatedRow[] = (bd?.org_groups[sv.side] ?? [])
    .filter((g) => g.code !== sv.code && g.total_usd > 0)
    .sort((a, b) => b.total_usd - a.total_usd)
    .slice(0, 5)
    .map((g) => ({
      href: `/usa/san-francisco/budget/service/${serviceSlug(g.label)}?year=${sv.fiscal_year}&side=${sv.side}`,
      label: g.label,
      sub: t(g.n_departments === 1 ? "us.sf.related.service_peer_sub_one" : "us.sf.related.service_peer_sub", { n: g.n_departments, fy: sv.fiscal_year }),
      amount: usd(g.total_usd),
    }));
  rows.push(budgetHub(sv.fiscal_year));
  return block(t("us.sf.related.service_block_sub", { fy: sv.fiscal_year }), rows);
}

/** Department × type cell: the department, the type citywide, the department's other types, the budget. */
export function sfDeptCharacterRelated(d: SfDeptCharacterDetailData): RelatedBlock | null {
  const fy = d.fiscal_year;
  const name = d.dept.display_name ?? d.dept.label;
  const rows: RelatedRow[] = [
    { href: `/usa/san-francisco/budget/dept/${deptSlug(d.dept.code)}?year=${fy}`, label: t("us.sf.related.cell_dept", { dept: name }), sub: t("us.sf.related.cell_dept_sub", { fy }), amount: usd(d.dept_total_usd) },
    { href: `/usa/san-francisco/budget/character/${characterSlug(d.character.code)}?year=${fy}&side=${d.side}`, label: t("us.sf.related.cell_char", { label: d.character.label }), sub: t("us.sf.related.cell_char_sub", { fy }) },
  ];
  const bd = loadSfBudgetBreakdown(fy);
  const labels = new Map((bd?.characters[d.side] ?? []).map((c) => [c.code, c.label]));
  for (const [, code, amount] of (bd?.dept_characters[d.side] ?? [])
    .filter(([dept, code, amount]) => dept === d.dept.code && code !== d.character.code && amount > 0)
    .sort((a, b) => b[2] - a[2])
    .slice(0, 3)) {
    rows.push({
      href: `/usa/san-francisco/budget/dept/${deptSlug(d.dept.code)}/character/${characterSlug(code)}?year=${fy}&side=${d.side}`,
      label: labels.get(code) ?? code,
      sub: t("us.sf.related.cell_peer_sub", { dept: name, fy }),
      amount: usd(amount),
    });
  }
  rows.push(budgetHub(fy));
  return block(t("us.sf.related.cell_block_sub"), rows);
}

/* ── Payroll ───────────────────────────────────────────────────────────── */

const payrollHub = (): RelatedRow => ({ href: "/usa/san-francisco/payroll", label: t("us.sf.related.hub_payroll"), sub: t("us.sf.related.hub_payroll_sub") });

/** Payroll department: its service area, its budget and contracts, its neighbours in the area, the hub. */
export function sfPayrollDeptRelated(d: SfPayrollDeptData): RelatedBlock | null {
  const rows: RelatedRow[] = [];
  const area = loadSfPayrollArea(d.areaHref.split("/").pop() ?? "");
  if (area) rows.push({ href: d.areaHref, label: t("us.sf.related.payroll_area", { area: area.name }), sub: t("us.sf.related.payroll_area_sub", { n: area.departments.length }) });
  if (d.budgetHref) rows.push({ href: d.budgetHref, label: t("us.sf.related.dept_budget", { dept: d.name }), sub: t("us.sf.related.dept_budget_sub") });
  const contracts = sfContractDeptHref(d.code);
  if (contracts) rows.push({ href: contracts, label: t("us.sf.related.dept_contracts", { dept: d.name }), sub: t("us.sf.related.dept_contracts_sub") });
  const peers = area?.departments ?? [];
  for (const x of neighbours(peers, peers.findIndex((x) => x.code === d.code), 2)) {
    rows.push({ href: x.href, label: x.name, sub: t("us.sf.related.payroll_dept_peer_sub", { n: x.n_employees.toLocaleString("en-US"), fy: d.fiscalYear }), amount: usd(x.total_compensation_usd) });
  }
  rows.push(payrollHub());
  return block(t("us.sf.related.payroll_dept_block_sub"), rows);
}

/** Payroll service area: the other service areas, the hub. */
export function sfPayrollAreaRelated(a: SfPayrollAreaData): RelatedBlock | null {
  const others = sfPayrollAreaSlugs().map((slug) => loadSfPayrollArea(slug)).filter((o): o is SfPayrollAreaData => o !== null);
  const rows: RelatedRow[] = others
    .filter((o) => o.slug !== a.slug)
    .sort((x, y) => y.latest.total_compensation_usd - x.latest.total_compensation_usd)
    .slice(0, 5)
    .map((o) => ({
      href: `/usa/san-francisco/payroll/area/${o.slug}`,
      label: o.name,
      sub: t("us.sf.related.payroll_area_peer_sub", { n: o.latest.n_employees_listed.toLocaleString("en-US"), fy: o.fiscalYear }),
      amount: usd(o.latest.total_compensation_usd),
    }));
  rows.push(payrollHub());
  return block(t("us.sf.related.payroll_area_block_sub"), rows);
}

/** Job family: its neighbours in the citywide ranking of families, the hub. */
export function sfPayrollFamilyRelated(f: SfPayrollFamilyData): RelatedBlock | null {
  const cw = readDataJsonOrNull<{ years: Record<string, { display_family: string; total_compensation_usd: number; n_employees: number }[]> }>("us/sf/payroll_by_family_citywide.json");
  const ranked = (cw?.years[String(f.fiscalYear)] ?? [])
    .map((r) => ({ slug: familySlug(r.display_family), family: r.display_family, usd: r.total_compensation_usd, n: r.n_employees }))
    .sort((a, b) => b.usd - a.usd);
  const rows: RelatedRow[] = neighbours(ranked, ranked.findIndex((r) => r.family === f.family), 5).map((r) => ({
    href: `/usa/san-francisco/payroll/family/${r.slug}`,
    label: r.family,
    sub: t("us.sf.related.payroll_family_peer_sub", { n: r.n.toLocaleString("en-US"), fy: f.fiscalYear }),
    amount: usd(r.usd),
  }));
  rows.push(payrollHub());
  return block(t("us.sf.related.payroll_family_block_sub", { fy: f.fiscalYear }), rows);
}

/** Role: its job family, the other roles of that family, the department employing most of it, the hub. */
export function sfPayrollRoleRelated(r: SfPayrollRoleData): RelatedBlock | null {
  const rows: RelatedRow[] = [{ href: r.familyHref, label: t("us.sf.related.payroll_role_family", { family: r.family }), sub: t("us.sf.related.payroll_role_family_sub") }];
  for (const s of r.siblings.filter((s) => s.href && s.label !== r.label).sort((a, b) => b.total_compensation_usd - a.total_compensation_usd).slice(0, 3)) {
    rows.push({ href: s.href, label: s.label, sub: t("us.sf.related.payroll_role_sibling_sub", { n: s.n_employees.toLocaleString("en-US"), fy: r.fiscalYear }), amount: usd(s.total_compensation_usd) });
  }
  const top = r.departments[0];
  if (top) rows.push({ href: top.href, label: t("us.sf.related.payroll_role_dept", { dept: top.name }), sub: t("us.sf.related.payroll_role_dept_sub", { fy: r.fiscalYear }) });
  rows.push(payrollHub());
  return block(t("us.sf.related.payroll_role_block_sub"), rows);
}

/* ── The city (the Board's record on the map) ─────────────────────────── */

/** Neighbourhood or street page: its neighbours on the record, the whole city. */
export async function sfCityPageRelated(p: CityPage): Promise<RelatedBlock | null> {
  const rows: RelatedRow[] = [];
  if (p.kind === "neighbourhood") {
    for (const h of await hoodNeighbourPages(p.slug)) {
      rows.push({ href: `/usa/san-francisco/the-city/neighbourhood/${h.slug}`, label: h.name, sub: t(h.count === "1" ? "us.sf.related.city_hood_sub_one" : "us.sf.related.city_hood_sub", { count: h.count }) });
    }
  } else {
    for (const s of await streetRelatedPages(p.slug)) {
      rows.push({ href: `/usa/san-francisco/the-city/street/${s.slug}`, label: s.name, sub: t(`us.sf.related.city_street_${s.sameBlock ? "block" : "rank"}_sub${s.count === "1" ? "_one" : ""}`, { count: s.count }) });
    }
  }
  rows.push({ href: "/usa/san-francisco/the-city", label: t("us.sf.related.hub_city"), sub: t("us.sf.related.hub_city_sub") });
  return block(t(p.kind === "neighbourhood" ? "us.sf.related.city_hood_block_sub" : "us.sf.related.city_street_block_sub_block"), rows);
}

/* ── Places ────────────────────────────────────────────────────────────── */

/**
 * Place: the other places of its department (then of its kind) that the
 * fiche's own "same kind" strip does not already show — same selection as
 * SfPlaceFiche — most money paid for work there first; the department's
 * contracts; the places hub.
 */
export function sfPlaceRelated(place: SfPlaceFicheData): RelatedBlock | null {
  const others = loadSfPlacesIndex().filter((p) => p.slug !== place.slug);
  const sameFamily = others.filter((p) => p.family === place.family);
  const strip = (sameFamily.length < 2 ? others.filter((p) => p.owning_dept_code === place.owning_dept.code) : sameFamily).slice(0, 4);
  const shown = new Set(strip.map((p) => p.slug));
  const byMoney = (a: { funds_usd: number; n_documents: number }, b: { funds_usd: number; n_documents: number }) => b.funds_usd - a.funds_usd || b.n_documents - a.n_documents;
  const pick = [
    ...others.filter((p) => p.owning_dept_code === place.owning_dept.code && !shown.has(p.slug)).sort(byMoney).map((p) => ({ p, why: "dept" as const })),
    ...others.filter((p) => p.family === place.family && p.owning_dept_code !== place.owning_dept.code && !shown.has(p.slug)).sort(byMoney).map((p) => ({ p, why: "kind" as const })),
  ].slice(0, 4);
  const rows: RelatedRow[] = pick.map(({ p, why }) => ({
    href: `/usa/san-francisco/places/place/${p.slug}`,
    label: p.name,
    sub: why === "dept" ? t("us.sf.related.place_same_dept", { kind: p.kind, dept: place.owning_dept.name }) : t("us.sf.related.place_same_kind", { kind: p.kind }),
    amount: p.funds_usd > 0 ? usd(p.funds_usd) : null,
  }));
  const contracts = sfContractDeptHref(place.owning_dept.code);
  if (contracts) rows.push({ href: contracts, label: t("us.sf.related.dept_contracts", { dept: place.owning_dept.name }), sub: t("us.sf.related.dept_contracts_sub") });
  rows.push({ href: "/usa/san-francisco/places", label: t("us.sf.related.hub_places"), sub: t("us.sf.related.hub_places_sub") });
  return block(t("us.sf.related.place_block_sub", { dept: place.owning_dept.name }), rows);
}
