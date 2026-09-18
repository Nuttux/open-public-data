import { renderDrilldownPage } from "@/lib/render-drilldown-page";

export default async function DrawerDeptOverviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return renderDrilldownPage({
    params: Promise.resolve({}),
    searchParams,
    voice: "perso",
    basePath: "/france/simulateur-prelevements",
    isDrawer: true,
    kind: "local-scope",
    localScope: "dept",
  });
}
