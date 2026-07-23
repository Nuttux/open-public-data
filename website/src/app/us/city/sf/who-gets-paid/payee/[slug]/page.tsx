import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import SfPayeeFiche from "@/components/us/SfPayeeFiche";
import { loadSfPayee, loadSfPayeesIndex } from "@/lib/us/sf-payees-data";
import { fmtUsdCompact } from "@/lib/us/format";

type Params = { slug: string };

/** Full-page fallback for the SF payee fiche (hard loads / no-JS —
 *  the root-level drawer intercepts soft navigations). */

export function generateStaticParams(): Params[] {
  return loadSfPayeesIndex().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const payee = loadSfPayee(slug);
  if (!payee) return { title: { absolute: "Payee not found" }, robots: { index: false } };
  return {
    title: `${payee.name} — San Francisco`,
    description: `${payee.name}: ${fmtUsdCompact(payee.total_paid_usd)} paid by San Francisco ${payee.first_year}–${payee.last_year}, by department and contract.`,
    alternates: { canonical: `/us/city/sf/who-gets-paid/payee/${slug}` },
  };
}

export default async function SfPayeePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const payee = loadSfPayee(slug);
  if (!payee) return notFound();

  return (
    <main id="main-content" tabIndex={-1}>
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link href="/us/city/sf/who-gets-paid" style={{ textDecoration: "none", color: "inherit" }}>
              ← San Francisco · Payees
            </Link>
          </div>
          <h1 className="fx-page-title">{payee.name}</h1>
          <p className="fx-page-lede">
            {fmtUsdCompact(payee.total_paid_usd)} paid {payee.first_year}–{payee.last_year}
          </p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfPayeeFiche payee={payee} />
      </div>
    </main>
  );
}
