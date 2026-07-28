import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfContractFiche from "@/components/us/SfContractFiche";
import { loadSfContractFiche, sfContractDeptHref } from "../../data";
import { contractLabel } from "../../us-sf-contracts-types";
import { contractPrimePayeeSlug } from "@/lib/us/sf-payees-data";

type Params = { no: string };

/**
 * Full-page fallback for a contract fiche — direct URL navigation (shared
 * links, crawlers). In-app clicks are intercepted by the root-level drawer
 * at app/@drawer/(...)us/city/sf/contracts/contract/[no].
 *
 * The exported fiche corpus is active ∪ sole-source ∪ top-500 by agreed;
 * anything else 404s (the register row still exists in
 * contracts_active.json / the source dataset).
 */

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { no } = await params;
  const fiche = loadSfContractFiche(no);
  if (!fiche) {
    return { title: { absolute: "Contract not found" }, robots: { index: false } };
  }
  const c = fiche.contract;
  const title = `${(contractLabel(c) || `Contract ${c.contract_no}`).slice(0, 70)} — SF contract ${c.contract_no}`;
  return {
    title,
    description: `San Francisco supplier contract ${c.contract_no} — ${c.prime_contractor ?? "unnamed prime"}, ${c.department ?? "City and County of San Francisco"}. Agreed and paid amounts, payment curve and project team from the SF Controller's open data.`,
  };
}

export default async function SfContractPage({ params }: { params: Promise<Params> }) {
  const { no } = await params;
  const fiche = loadSfContractFiche(no);
  if (!fiche) return notFound();
  const c = fiche.contract;
  const primePayeeSlug = contractPrimePayeeSlug(c.contract_no);
  const deptContractsHref = sfContractDeptHref(c.department_code);

  return (
    <main id="main-content" tabIndex={-1}>
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link href="/us/city/sf/contracts" style={{ color: "inherit" }}>
              ← San Francisco · Contracts
            </Link>
          </div>
          <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 44px)" }}>
            {contractLabel(c) || `Contract ${c.contract_no}`}
          </h1>
          <p className="fx-page-lede">
            {primePayeeSlug && c.prime_contractor ? (
              <Link
                href={`/us/city/sf/who-gets-paid/payee/${primePayeeSlug}`}
                style={{ color: "inherit", borderBottom: "1px solid currentColor" }}
              >
                {c.prime_contractor}
              </Link>
            ) : (
              c.prime_contractor ?? "—"
            )}
            {c.department ? (
              <>
                {" · "}
                {deptContractsHref ? (
                  <Link href={deptContractsHref} scroll={false} style={{ color: "inherit", borderBottom: "1px solid currentColor" }}>
                    {c.department}
                  </Link>
                ) : (
                  c.department
                )}
              </>
            ) : null}
          </p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfContractFiche
          fiche={fiche}
          primePayeeSlug={primePayeeSlug}
          deptContractsHref={deptContractsHref}
        />
      </div>
    </main>
  );
}
