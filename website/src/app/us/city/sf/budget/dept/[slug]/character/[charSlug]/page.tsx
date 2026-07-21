import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import "@/app/fusion.css";

import { readDataJsonOrNull } from "@/lib/data/read";
import SfDeptCharacterFiche from "@/components/us/SfDeptCharacterFiche";
import {
  defaultFiscalYear,
  loadSfBudgetByYear,
  loadSfDeptCharacterDetail,
  type SfSide,
} from "@/lib/us/sf-budget-data";
import { deptSlug } from "@/lib/us/sf-budget-slugs";
import { fmtUsdCompact } from "@/lib/us/format";

type Params = { slug: string; charSlug: string };
type SP = { year?: string; side?: string };

function parseSide(v: string | undefined): SfSide | undefined {
  return v === "revenue" ? "revenue" : v === "spending" ? "spending" : undefined;
}

/** Full-page fallback for the SF dept × character DETAIL fiche (third
 *  drill level: dept → character → this — line items + vendor payments). */

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}): Promise<Metadata> {
  const { slug, charSlug } = await params;
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : defaultFiscalYear(loadSfBudgetByYear());
  const d = loadSfDeptCharacterDetail(slug, charSlug, year, parseSide(sp.side));
  if (!d) {
    return { title: { absolute: "Detail not found" }, robots: { index: false } };
  }
  const deptName = d.dept.display_name ?? d.dept.label;
  return {
    title: { absolute: `${deptName} · ${d.character.label} — San Francisco budget FY${year}` },
    description: `${deptName}'s ${d.character.label} spending: raw budget line items and the vendor payments that funded them — San Francisco fiscal year ${year}.`,
    alternates: { canonical: `/us/city/sf/budget/dept/${slug}/character/${charSlug}` },
  };
}

export default async function SfDeptCharacterPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}) {
  const { slug, charSlug } = await params;
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : defaultFiscalYear(loadSfBudgetByYear());
  const d = loadSfDeptCharacterDetail(slug, charSlug, year, parseSide(sp.side));
  if (!d) return notFound();

  const vendorSlugMap =
    readDataJsonOrNull<Record<string, string>>("us/sf/payees/_vendor_slug_map.json") ?? {};
  const deptName = d.dept.display_name ?? d.dept.label;

  return (
    <main id="main-content" tabIndex={-1}>
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link
              href={`/us/city/sf/budget/dept/${deptSlug(d.dept.code)}?year=${year}`}
              style={{ textDecoration: "none", color: "inherit" }}
            >
              ← {deptName} · FY{year}
            </Link>
          </div>
          <h1 className="fx-page-title">{d.character.label}</h1>
          <p className="fx-page-lede">
            {deptName} · {fmtUsdCompact(d.amount_usd)} adopted (FY{year})
          </p>
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <SfDeptCharacterFiche d={d} vendorSlugMap={vendorSlugMap} />
      </div>
    </main>
  );
}
