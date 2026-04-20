import { NextResponse } from "next/server";
import { loadBudgetPageData } from "@/lib/fusion-data";

type Params = { year: string };

/**
 * CSV export for the budget page. Flattens the Sankey links
 * (source, target, value) into a single flat CSV file consumable
 * by Excel / Numbers / a data pipeline.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<Params> },
) {
  const { year } = await params;
  const yearNum = Number(year);
  if (!Number.isFinite(yearNum)) {
    return NextResponse.json({ error: "Invalid year" }, { status: 400 });
  }

  let data;
  try {
    data = loadBudgetPageData(yearNum);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: `Year ${yearNum} not available: ${msg}` }, { status: 404 });
  }

  const rows: string[] = [];
  rows.push(
    [
      "type",
      "source",
      "target",
      "value_eur",
      "percent_of_depenses",
    ].join(","),
  );

  const esc = (s: string) => {
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  for (const r of data.recettesBreakdown) {
    rows.push(
      ["recette", esc(r.label), "Budget Paris", String(r.value), ""].join(","),
    );
  }
  for (const t of data.topDepenses) {
    const pct = ((t.value / data.depenses) * 100).toFixed(2);
    rows.push(
      ["depense", "Budget Paris", esc(t.label), String(t.value), pct].join(","),
    );
    for (const sp of t.subPostes) {
      const spPct = ((sp.value / data.depenses) * 100).toFixed(2);
      rows.push(
        ["sous-poste", esc(t.label), esc(sp.name), String(sp.value), spPct].join(","),
      );
    }
  }

  const csv =
    `# Budget Ville de Paris — exercice ${data.year}\n` +
    `# Source : comptes administratifs M57, opendata.paris.fr\n` +
    `# Exports: recettes, dépenses par thématique, sous-postes\n` +
    rows.join("\n") +
    "\n";

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="budget-paris-${data.year}.csv"`,
    },
  });
}
