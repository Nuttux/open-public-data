import { cookies } from "next/headers";
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
  const store = await cookies();
  const locale: Locale = store.get("br_locale")?.value === "en" ? "en" : "pt";

  return (
    <ForcedLocale locale={locale}>
      <div className="theme-fusion">
        <DetailDrawer
          kicker={<>Recife · {locale === "en" ? "Contracts" : "Contratos"}</>}
          title={`Contrato ${found.contrato.numero}`}
          shareUrl={`/br/city/recife/contratos/${id}`}
          backHref="/br/city/recife/contratos"
          breadcrumbLabel={found.contrato.numero}
        >
          <RecifeContratoFiche c={found.contrato} source={found.source} />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
