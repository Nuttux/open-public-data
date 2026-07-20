import type { Metadata } from "next";
import Link from "next/link";
import "@/app/fusion.css";

import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import { loadSfPlacesIndex } from "@/lib/us/sf-places-data";
import { loadSfPayeesIndex } from "@/lib/us/sf-payees-data";

export const metadata: Metadata = {
  title: { absolute: "San Francisco — follow the city's money and record" },
  description:
    "San Francisco's budget, payments, contracts, payroll and places — the city's money and its historical record, every figure linked to its source.",
};

type Section = { href: string; label: string; blurb: string };

export default async function SfHubPage() {
  const places = loadSfPlacesIndex();
  const payees = loadSfPayeesIndex();

  const sections: Section[] = [
    { href: "/us/city/sf/budget", label: "Budget", blurb: "Where the money goes, service by service — adopted vs executed, FY2010–2027." },
    { href: "/us/city/sf/who-gets-paid", label: "Who gets paid", blurb: "Every payment through the City's ledger, ranked and classified, to the voucher." },
    { href: "/us/city/sf/contracts", label: "Contracts", blurb: "The active register with the sole-source lens and award-vs-paid on every contract." },
    { href: "/us/city/sf/payroll", label: "Payroll", blurb: "What city work pays, and the overtime pattern in 24/7 services." },
    { href: "/us/city/sf/places", label: "Places", blurb: "The city building by building — money and archival record, place by place." },
  ];

  return (
    <main id="main-content" tabIndex={-1}>
      <PageIntro
        kicker="United States · City"
        title={
          <>
            San Francisco, <em>followed to the source</em>
          </>
        }
        lede="The city's money and its record: budget and payments, contracts and payroll, and the places the money reaches — every figure linked to where it comes from."
        stats={
          <>
            <IntroStat value={places.length} label="places documented" />
            <IntroStat value={payees.length} label="payees keyed" />
            <IntroStat value="FY2010–27" label="budget years" />
          </>
        }
      />

      <section className="fx-section">
        <div className="fx-wrap">
          <div className="fx-hub-grid">
            {sections.map((s) => (
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
