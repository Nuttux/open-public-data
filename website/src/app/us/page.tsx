import type { Metadata } from "next";
import Link from "next/link";
import "@/app/fusion.css";

import PageIntro from "@/components/fusion/PageIntro";
import { answerMetadata } from "@/lib/seo/page-answer";
import { readSiteLocale } from "@/lib/seo";
import { usCountryHub, SfHubJsonLd } from "@/lib/seo/sections/sf";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await readSiteLocale();
  const hub = usCountryHub();
  return answerMetadata(hub.answer, hub.path, locale);
}

export default function UsRootPage() {
  const scopes = [
    {
      href: "/us/national",
      label: "United States · National",
      blurb: "The federal dollar — receipts, outlays, the deficit and the national debt since 1790.",
    },
    {
      href: "/us/city/sf",
      label: "San Francisco",
      blurb: "The city's budget, payments, contracts, payroll and places — every figure linked to its source.",
    },
  ];
  return (
    <main id="main-content" tabIndex={-1}>
      <SfHubJsonLd hub={usCountryHub()} />
      <PageIntro
        kicker="United States"
        title={
          <>
            Public money, <em>followed to the source</em>
          </>
        }
        lede="One engine, many places. The federal dollar at national scale, and San Francisco at city scale — the same method, wherever the data reaches."
      />
      <section className="fx-section">
        <div className="fx-wrap">
          <div className="fx-hub-grid">
            {scopes.map((s) => (
              <Link key={s.href} href={s.href} className="fx-hub-card">
                <span className="fx-hub-card-label">{s.label}</span>
                <span className="fx-hub-card-blurb">{s.blurb}</span>
                <span className="fx-hub-card-arrow" aria-hidden="true">→</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
