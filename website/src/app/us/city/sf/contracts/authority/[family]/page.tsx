import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfAuthorityFiche from "@/components/us/SfAuthorityFiche";
import { loadSfContractAuthority, sfAuthorityFamilies } from "../../data";
import { answerMetadata } from "@/lib/seo/page-answer";
import { contractAuthorityAnswer } from "@/lib/us/sf-answers";
import PageJsonLd from "@/components/seo/PageJsonLd";
import RelatedLinks from "@/components/fiche/RelatedLinks";
import { sfAuthorityRelated } from "@/lib/us/sf-related";

type Params = { family: string };

/**
 * Full-page fallback for a purchasing-authority fiche. In-app clicks are
 * intercepted by the root-level drawer. Sibling of contracts/type/[slug] and
 * contracts/dept/[slug] — the third facet of the same register.
 */

export function generateStaticParams(): Params[] {
  return sfAuthorityFamilies().map((family) => ({ family }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { family } = await params;
  const d = loadSfContractAuthority(family);
  if (!d) return { title: { absolute: "Authority not found" }, robots: { index: false } };
  return answerMetadata(contractAuthorityAnswer(d), `/us/city/sf/contracts/authority/${family}`, "en");
}

export default async function SfAuthorityPage({ params }: { params: Promise<Params> }) {
  const { family } = await params;
  const d = loadSfContractAuthority(family);
  if (!d) return notFound();

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
            {d.label}
          </h1>
          <p className="fx-page-lede">How these contracts were legally awarded</p>
          <p className="fx-page-lede fx-answer">{contractAuthorityAnswer(d).answer}</p>
          <PageJsonLd title={contractAuthorityAnswer(d).title} description={contractAuthorityAnswer(d).answer} path={`/us/city/sf/contracts/authority/${family}`} locale={"en"} creator="City and County of San Francisco" spatialCoverage="San Francisco, California" />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfAuthorityFiche d={d} />
        <RelatedLinks block={sfAuthorityRelated(d)} />
      </div>
    </main>
  );
}
