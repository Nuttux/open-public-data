import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfContractTypeFiche from "@/components/us/SfContractTypeFiche";
import { loadSfContractType, sfContractTypeSlugs } from "../../data";
import { typeLabel } from "../../us-sf-contracts-types";
import { answerMetadata } from "@/lib/seo/page-answer";
import { contractTypeAnswer } from "@/lib/us/sf-answers";
import PageJsonLd from "@/components/seo/PageJsonLd";

type Params = { slug: string };

/**
 * Full-page fallback for a contract-type fiche — the SF analogue of Recife's
 * /modalidade/[slug]. In-app clicks are intercepted by the root-level drawer
 * at app/@drawer/(...)us/city/sf/contracts/type/[slug].
 */

export function generateStaticParams(): Params[] {
  return sfContractTypeSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const d = loadSfContractType(slug);
  if (!d) return { title: { absolute: "Contract type not found" }, robots: { index: false } };
  const label = typeLabel(d.raw);
  return answerMetadata(contractTypeAnswer({ label, register: d.register }), `/us/city/sf/contracts/type/${slug}`, "en");
}

export default async function SfContractTypePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const d = loadSfContractType(slug);
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
          <h1 className="fx-page-title">{typeLabel(d.raw)}</h1>
          <p className="fx-page-lede">A contract type in the City&rsquo;s supplier register</p>
          <p className="fx-page-lede fx-answer">{contractTypeAnswer({ label: typeLabel(d.raw), register: d.register }).answer}</p>
          <PageJsonLd title={contractTypeAnswer({ label: typeLabel(d.raw), register: d.register }).title} description={contractTypeAnswer({ label: typeLabel(d.raw), register: d.register }).answer} path={`/us/city/sf/contracts/type/${slug}`} locale={"en"} creator="City and County of San Francisco" spatialCoverage="San Francisco, California" />
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfContractTypeFiche d={d} />
      </div>
    </main>
  );
}
