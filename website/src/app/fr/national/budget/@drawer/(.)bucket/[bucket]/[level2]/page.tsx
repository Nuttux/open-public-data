import { renderDrilldownPage } from "@/lib/render-drilldown-page";

type Params = { bucket: string; level2: string };

export default async function DrawerBudgetL2Page({
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
    kind: "level2",
  });
}
