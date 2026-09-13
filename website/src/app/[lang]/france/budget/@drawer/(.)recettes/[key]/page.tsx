import { renderRecettePage } from "@/lib/render-recette-fiche";

type Params = { key: string };

export default async function DrawerRecettePage({
  params,
}: {
  params: Promise<Params>;
}) {
  return renderRecettePage({ params, isDrawer: true });
}
