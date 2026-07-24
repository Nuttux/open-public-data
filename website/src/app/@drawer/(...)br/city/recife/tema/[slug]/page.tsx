import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale, type Locale } from "@/lib/localeContext";
import RecifeTemaFiche from "@/components/br/RecifeTemaFiche";
import { loadTema } from "@/lib/br/recife-data";

/** Root-level intercepting drawer for a Recife theme (tema) fiche. */
export default async function DrawerTemaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tm = loadTema(slug);
  if (!tm) return notFound();
  const store = await cookies();
  const locale: Locale = store.get("br_locale")?.value === "en" ? "en" : "pt";
  const { source, tema_method, ...tema } = tm;

  return (
    <ForcedLocale locale={locale}>
      <div className="theme-fusion">
        <DetailDrawer
          kicker={<>Recife · {locale === "en" ? "Theme" : "Tema"}</>}
          title={tm.tema}
          shareUrl={`/br/city/recife/tema/${slug}`}
          backHref="/br/city/recife/quem-recebe"
          breadcrumbLabel={tm.tema}
        >
          <RecifeTemaFiche tm={tema} temaMethod={tema_method} source={source} />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
