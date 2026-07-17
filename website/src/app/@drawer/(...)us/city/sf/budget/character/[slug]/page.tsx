import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale } from "@/lib/localeContext";
import SfCharacterFiche from "@/components/us/SfCharacterFiche";
import {
  defaultFiscalYear,
  loadSfBudgetByYear,
  loadSfCharacterFiche,
  type SfSide,
} from "@/lib/us/sf-budget-data";
import { fmtUsdCompact } from "@/lib/us/format";

type Params = { slug: string };
type SP = { year?: string; side?: string };

/**
 * Root-level intercepting drawer for SF character fiches (spending /
 * revenue "type of money" — the Paris poste analogue).
 */
export default async function DrawerSfCharacterPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : defaultFiscalYear(loadSfBudgetByYear());
  const side = (sp.side === "revenue" ? "revenue" : sp.side === "spending" ? "spending" : undefined) as
    | SfSide
    | undefined;
  const c = loadSfCharacterFiche(slug, year, side);
  if (!c) return notFound();

  const sideWord = c.side === "spending" ? "Spending" : "Revenue";
  const backHref = `/us/city/sf/budget?year=${year}`;
  const shareText = `${c.label} — ${fmtUsdCompact(c.total_usd)} (${sideWord.toLowerCase()}, FY${year}, San Francisco budget).`;
  const sideParam = sp.side ? `&side=${c.side}` : "";

  return (
    <ForcedLocale locale="en">
    <div className="theme-fusion">
      <DetailDrawer
        kicker={<>{sideWord} type · FY{year} adopted budget</>}
        title={c.label}
        shareUrl={`/us/city/sf/budget/character/${slug}?year=${year}${sideParam}`}
        shareText={shareText}
        backHref={backHref}
        breadcrumbLabel={c.label}
      >
        <SfCharacterFiche c={c} />
      </DetailDrawer>
    </div>
    </ForcedLocale>
  );
}
