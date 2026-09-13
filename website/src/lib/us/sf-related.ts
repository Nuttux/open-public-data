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
  loadSfContractFiche,
  loadSfContractsActive,
  loadSfContractType,
  sfContractDeptHref,
} from "@/app/us/city/sf/contracts/data";
import { contractLabel, typeLabel, typeSlug, type SfContractFiche } from "@/app/us/city/sf/contracts/us-sf-contracts-types";
import { contractPrimePayeeSlug } from "@/lib/us/sf-payees-data";
import { fmtUsdCompact } from "@/lib/us/format";
import { relatedT } from "@/lib/related-t";

const t = relatedT("en");
const usd = (n: number) => ({ v: fmtUsdCompact(n), u: "" });

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
      href: `/us/city/sf/contracts/contract/${r.contract_no}`,
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
        href: `/us/city/sf/contracts/contract/${r.contract_no}`,
        label: contractLabel(r) || t("us.sf.related.contract_fallback", { no: r.contract_no }),
        sub: r.prime ? t("us.sf.related.same_dept_type_prime", { prime: r.prime }) : t("us.sf.related.same_dept_type"),
        amount: usd(r.agreed_usd),
      });
    }
  }
  if (prime) {
    const payee = contractPrimePayeeSlug(c.contract_no);
    if (payee) {
      rows.push({ href: `/us/city/sf/who-gets-paid/payee/${payee}`, label: t("us.sf.related.payee", { name: prime }), sub: t("us.sf.related.payee_sub") });
    }
  }
  const deptHref = sfContractDeptHref(c.department_code);
  if (deptHref && c.department) {
    rows.push({ href: deptHref, label: t("us.sf.related.dept_contracts", { dept: c.department }), sub: t("us.sf.related.dept_contracts_sub") });
  }
  const type = c.contract_type ? loadSfContractType(typeSlug(c.contract_type)) : null;
  if (type) {
    rows.push({
      href: `/us/city/sf/contracts/type/${typeSlug(type.raw)}`,
      label: t("us.sf.related.type", { type: typeLabel(type.raw) }),
      sub: t("us.sf.related.type_sub"),
      amount: usd(type.register.agreed_usd),
    });
  }
  return { title: t("us.sf.related.title"), sub: t("us.sf.related.contract_sub"), rows };
}
