import { readSiteLocale } from "@/lib/seo";
import { notFound } from "next/navigation";
import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale, type Locale } from "@/lib/localeContext";
import RecifeContratoFiche from "@/components/br/RecifeContratoFiche";
import { loadContrato } from "@/lib/br/recife-data";

/** Root-level intercepting drawer for a Recife contract fiche. */
export default async function DrawerContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = loadContrato(id);
  if (!found) return notFound();
  const locale: Locale = (await readSiteLocale()) === "en" ? "en" : "pt";
  // The portal leaves some contracts unnumbered ("Aguardando Numeração"),
  // which the pipeline nulls out rather than printing as a fake reference.
  const ref = found.contrato.numero ?? (locale === "en" ? "unnumbered" : "sem número");

  return (
    <ForcedLocale locale={locale}>
      <div className="theme-fusion">
        <DetailDrawer
          kicker={<>Recife · {locale === "en" ? "Contracts" : "Contratos"}</>}
          title={`Contrato ${ref}`}
          shareUrl={`/brasil/recife/contratos/${id}`}
          backHref="/brasil/recife/contratos"
          breadcrumbLabel={ref}
        >
          <RecifeContratoFiche c={found.contrato} source={found.source} />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
