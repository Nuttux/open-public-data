import { notFound } from "next/navigation";

import { DetailDrawer, ArrondissementLogementFiche } from "@/components/fusion";
import { loadArrondissementLogement, PARIS_CENTRE_SLUG } from "@/lib/fusion-data";

type Params = { arr: string };

const isValidSlug = (s: string) => {
  if (s === PARIS_CENTRE_SLUG) return true;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1 && n <= 20;
};

export default async function DrawerArrLogementPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { arr } = await params;
  if (!isValidSlug(arr)) return notFound();

  const data = loadArrondissementLogement(arr);
  if (!data) return notFound();

  return (
    <div className="theme-fusion">
      <DetailDrawer
        kicker={
          <span
            style={{
              fontFamily: "var(--f-mono)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "var(--muted)",
            }}
          >
            Logement social · {data.year}
          </span>
        }
        title={data.label}
        shareUrl={`/ville/paris/logement/arrondissement/${data.slug}`}
        backHref="/ville/paris/logement"
        breadcrumbLabel={data.label}
      >
        <ArrondissementLogementFiche data={data} />
      </DetailDrawer>
    </div>
  );
}
