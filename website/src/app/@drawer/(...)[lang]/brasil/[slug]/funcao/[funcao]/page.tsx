import { readSiteLocale } from "@/lib/seo";
import { notFound } from "next/navigation";
import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale, type Locale } from "@/lib/localeContext";
import RecifeFuncaoFiche from "@/components/br/RecifeFuncaoFiche";
import { funcaoFromBudget } from "@/lib/br/recife-data";
import { findMunicipio, loadMunicipioBudget } from "@/lib/br/municipios";
import { municipioPerimeter } from "@/lib/br/municipio-funcao";

/** Root-level intercepting drawer for a função of any município (2026-09-18). */
export default async function DrawerMunicipioFuncaoPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string; funcao: string }>;
  searchParams: Promise<{ year?: string }>;
}) {
  const { slug, funcao } = await params;
  const m = findMunicipio(slug);
  if (!m) return notFound();
  const d = await loadMunicipioBudget(m.id);
  if (!d) return notFound();
  const sp = await searchParams;
  const f = funcaoFromBudget(d, funcao, sp.year ? parseInt(sp.year, 10) : undefined);
  if (!f) return notFound();
  const locale: Locale = (await readSiteLocale()) === "en" ? "en" : "pt";
  return (
    <ForcedLocale locale={locale}>
      <div className="theme-fusion">
        <DetailDrawer
          kicker={<>{d.municipio.nome} ({d.municipio.uf}) · {locale === "en" ? "Budget" : "Orçamento"}</>}
          title={f.funcao}
          shareUrl={`/brasil/${slug}/funcao/${funcao}?year=${f.ano}`}
          backHref={`/brasil/${slug}`}
          breadcrumbLabel={f.funcao}
        >
          <RecifeFuncaoFiche f={f} perimeter={municipioPerimeter[locale]} />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
