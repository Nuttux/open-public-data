import { readSiteLocale } from "@/lib/seo";
import { notFound } from "next/navigation";
import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale, type Locale } from "@/lib/localeContext";
import RecifeFuncaoFiche from "@/components/br/RecifeFuncaoFiche";
import { loadFuncao } from "@/lib/br/recife-data";

/** Root-level intercepting drawer for a Recife budget função drilldown. */
export default async function DrawerFuncaoPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const f = loadFuncao(slug, sp.year ? parseInt(sp.year, 10) : undefined);
  if (!f) return notFound();
  const locale: Locale = (await readSiteLocale()) === "en" ? "en" : "pt";

  return (
    <ForcedLocale locale={locale}>
      <div className="theme-fusion">
        <DetailDrawer
          kicker={<>Recife · {locale === "en" ? "Budget" : "Orçamento"}</>}
          title={f.funcao}
          shareUrl={`/brasil/recife/budget/funcao/${slug}?year=${f.ano}`}
          backHref="/brasil/recife/budget"
          breadcrumbLabel={f.funcao}
        >
          <RecifeFuncaoFiche f={f} />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
