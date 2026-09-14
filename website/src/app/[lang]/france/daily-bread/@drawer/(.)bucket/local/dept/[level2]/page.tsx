import { renderDrilldownPage } from "@/lib/render-drilldown-page";

type Params = { level2: string };

export default async function DrawerDeptL2Page({
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
    kind: "local-dept",
  });
}
