import { renderDrilldownPage } from "@/lib/render-drilldown-page";

type Params = { agg: string };

export default async function DrawerBudgetAggPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderDrilldownPage({
    params,
    searchParams,
    voice: "impersonal",
    basePath: "/fr/national/budget",
    isDrawer: true,
    kind: "etat-aggregation",
  });
}
