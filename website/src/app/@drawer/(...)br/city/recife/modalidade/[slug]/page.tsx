import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale, type Locale } from "@/lib/localeContext";
import RecifeModalidadeFiche from "@/components/br/RecifeModalidadeFiche";
import { loadModalidade } from "@/lib/br/recife-data";
import { titleCasePt } from "@/lib/br/format";

/** Root-level intercepting drawer for a Recife procurement-modality fiche. */
export default async function DrawerModalidadePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = loadModalidade(slug);
  if (!m) return notFound();
  const store = await cookies();
  const locale: Locale = store.get("br_locale")?.value === "en" ? "en" : "pt";
  const { source, ...modalidade } = m;
  const nome = titleCasePt(m.modalidade);

  return (
    <ForcedLocale locale={locale}>
      <div className="theme-fusion">
        <DetailDrawer
          kicker={<>Recife · {locale === "en" ? "Modality" : "Modalidade"}</>}
          title={nome}
          shareUrl={`/br/city/recife/modalidade/${slug}`}
          backHref="/br/city/recife/contratos"
          breadcrumbLabel={nome}
        >
          <RecifeModalidadeFiche m={modalidade} source={source} />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
