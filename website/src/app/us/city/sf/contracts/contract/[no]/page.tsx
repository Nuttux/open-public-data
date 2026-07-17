import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfContractFiche from "@/components/us/SfContractFiche";
import { loadSfContractFiche } from "../../data";

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
  const title = `${(c.title_plain || c.title || `Contract ${c.contract_no}`).slice(0, 70)} — SF contract ${c.contract_no}`;
  return {
    title: { absolute: title },
    description: `San Francisco supplier contract ${c.contract_no} — ${c.prime_contractor ?? "unnamed prime"}, ${c.department ?? "City and County of San Francisco"}. Agreed and paid amounts, payment curve and project team from the SF Controller's open data.`,
  };
}

export default async function SfContractPage({ params }: { params: Promise<Params> }) {
  const { no } = await params;
  const fiche = loadSfContractFiche(no);
  if (!fiche) return notFound();
  const c = fiche.contract;

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
            {c.title_plain || c.title || `Contract ${c.contract_no}`}
          </h1>
          <p className="fx-page-lede">
            {c.prime_contractor ?? "—"}
            {c.department ? ` · ${c.department}` : ""}
          </p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfContractFiche fiche={fiche} />
      </div>
    </main>
  );
}
