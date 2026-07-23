import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale, type Locale } from "@/lib/localeContext";
import RecifeLugarFiche from "@/components/br/RecifeLugarFiche";
import { loadPlace, loadPlaceObras } from "@/lib/br/recife-places-data";

/** Root-level intercepting drawer for a Recife civic-place fiche. */
export default async function DrawerLugarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = loadPlace(slug);
  if (!p) return notFound();
  const store = await cookies();
  const locale: Locale = store.get("br_locale")?.value === "en" ? "en" : "pt";
  const { source, ...place } = p;

  return (
    <ForcedLocale locale={locale}>
      <div className="theme-fusion">
        <DetailDrawer
          kicker={<>Recife · {locale === "en" ? "Places" : "Lugares"}</>}
          title={p.nome}
          shareUrl={`/br/city/recife/lugares/${slug}`}
          backHref="/br/city/recife/lugares"
          breadcrumbLabel={p.nome}
        >
          <RecifeLugarFiche place={place} source={source} obras={loadPlaceObras(slug)} />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
