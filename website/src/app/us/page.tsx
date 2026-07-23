import type { Metadata } from "next";
import Link from "next/link";
import "@/app/fusion.css";

import PageIntro from "@/components/fusion/PageIntro";

export const metadata: Metadata = {
  title: { absolute: "United States · Public money, followed to the source" },
  description:
    "United States public finance, followed to the source: the federal dollar and, at city scale, San Francisco's budget, payments, contracts, payroll and places.",
};

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
