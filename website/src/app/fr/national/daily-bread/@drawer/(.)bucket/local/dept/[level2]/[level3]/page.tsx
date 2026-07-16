import { renderDrilldownPage } from "@/lib/render-drilldown-page";

type Params = { level2: string; level3: string };

export default async function DrawerDeptL3Page({
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
    basePath: "/fr/national/daily-bread",
    isDrawer: true,
    kind: "local-dept-level3",
  });
}
