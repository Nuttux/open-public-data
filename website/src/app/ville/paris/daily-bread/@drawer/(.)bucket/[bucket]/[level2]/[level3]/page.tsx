import { renderDrilldownPage } from "@/lib/render-drilldown-page";

type Params = { bucket: string; level2: string; level3: string };

export default async function DrawerL3Page({
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
    basePath: "/ville/paris/daily-bread",
    isDrawer: true,
    kind: "level3",
  });
}
