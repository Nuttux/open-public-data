import { renderDrilldownPage } from "@/lib/render-drilldown-page";

export default async function DrawerBlocOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderDrilldownPage({
    params: Promise.resolve({}),
    searchParams,
    voice: "perso",
    basePath: "/fr/national/daily-bread",
    isDrawer: true,
    kind: "local-scope",
    localScope: "bloc_communal",
  });
}
