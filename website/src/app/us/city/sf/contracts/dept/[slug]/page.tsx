import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfDeptContractsFiche from "@/components/us/SfDeptContractsFiche";
import { deptDisplayName } from "../../us-sf-contracts-types";
import { loadSfContractDept, sfContractDeptSlugs } from "../../data";
import { answerMetadata } from "@/lib/seo/page-answer";
import { contractDeptAnswer } from "@/lib/us/sf-answers";
import PageJsonLd from "@/components/seo/PageJsonLd";
import RelatedLinks from "@/components/fiche/RelatedLinks";
import { sfContractDeptRelated } from "@/lib/us/sf-related";

type Params = { slug: string };

/**
 * Full-page fallback for a department's CONTRACTS fiche — direct URL
 * navigation. In-app clicks are intercepted by the root-level drawer at
 * app/@drawer/(...)us/city/sf/contracts/dept/[slug].
 *
 * Sibling of contracts/type/[slug]: a department inside the contracts page
 * is a contracts facet, not a shortcut into the budget explorer.
 */

export function generateStaticParams(): Params[] {
  return sfContractDeptSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const d = loadSfContractDept(slug);
  if (!d) return { title: { absolute: "Department not found" }, robots: { index: false } };
  const label = deptDisplayName(d.name);
  return answerMetadata(contractDeptAnswer({ label, n_active: d.n_active, activeAgreedUsd: d.activeAgreedUsd }), `/us/city/sf/contracts/dept/${slug}`, "en");
}

export default async function SfDeptContractsPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const d = loadSfContractDept(slug);
  if (!d) return notFound();
  const label = deptDisplayName(d.name);

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
            {label}
          </h1>
          <p className="fx-page-lede">
            What this department buys, and from whom · department code {d.code}
          </p>
          <p className="fx-page-lede fx-answer">{contractDeptAnswer({ label, n_active: d.n_active, activeAgreedUsd: d.activeAgreedUsd }).answer}</p>
          <PageJsonLd title={contractDeptAnswer({ label, n_active: d.n_active, activeAgreedUsd: d.activeAgreedUsd }).title} description={contractDeptAnswer({ label, n_active: d.n_active, activeAgreedUsd: d.activeAgreedUsd }).answer} path={`/us/city/sf/contracts/dept/${slug}`} locale={"en"} creator="City and County of San Francisco" spatialCoverage="San Francisco, California" />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfDeptContractsFiche d={d} />
        <RelatedLinks block={sfContractDeptRelated(d)} />
      </div>
    </main>
  );
}
