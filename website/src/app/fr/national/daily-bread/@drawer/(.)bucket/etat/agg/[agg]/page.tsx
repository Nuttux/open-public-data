import { renderDrilldownPage } from "@/lib/render-drilldown-page";

type Params = { agg: string };

export default async function DrawerAggregationPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderDrilldownPage({
    params,
    searchParams,
    voice: "perso",
    basePath: "/france/daily-bread",
    isDrawer: true,
    kind: "etat-aggregation",
  });
}
