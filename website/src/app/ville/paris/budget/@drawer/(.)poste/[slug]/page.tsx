import { notFound } from "next/navigation";

import DetailDrawer from "@/components/fusion/DetailDrawer";
import PosteFiche from "@/components/fusion/PosteFiche";
import { loadBudgetPoste } from "@/lib/fusion-data";

type Params = { slug: string };
type SP = { year?: string };

const fmtEur = (n: number) => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2).replace(".", ",")} Md €`;
  if (n >= 1e6) return `${Math.round(n / 1e6).toLocaleString("fr-FR")} M €`;
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
};

export default async function DrawerPostePage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<SP>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const year = sp.year ? Number(sp.year) : undefined;
  const poste = loadBudgetPoste(slug, year);
  if (!poste) return notFound();

  const kindLabel = poste.kind === "depense" ? "Dépense" : "Recette";
  const backHref = year ? `/ville/paris/budget?year=${year}` : "/ville/paris/budget";
  const shareText = `${poste.label} — ${fmtEur(poste.total)} (${poste.year}, ${kindLabel.toLowerCase()}) · ${poste.subPostes.length} sous-postes.`;

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={<>{kindLabel} · Budget {poste.year}</>}
        title={poste.label}
        shareUrl={`/ville/paris/budget/poste/${poste.slug}${year ? `?year=${year}` : ""}`}
        shareText={shareText}
        backHref={backHref}
        breadcrumbLabel={poste.label}
      >
        <PosteFiche poste={poste} />
      </DetailDrawer>
    </div>
  );
}
