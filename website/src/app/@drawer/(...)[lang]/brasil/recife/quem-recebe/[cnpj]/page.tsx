import { readSiteLocale } from "@/lib/seo";
import { notFound } from "next/navigation";
import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale, type Locale } from "@/lib/localeContext";
import RecifeRecebedorFiche from "@/components/br/RecifeRecebedorFiche";
import { loadRecipient } from "@/lib/br/recife-data";

/**
 * Root-level intercepting drawer for a Recife recipient fiche. Self-wraps in
 * ForcedLocale because the root @drawer slot renders OUTSIDE app/br/layout.tsx.
 */
export default async function DrawerRecebedorPage({ params }: { params: Promise<{ cnpj: string }> }) {
  const { cnpj } = await params;
  const rec = loadRecipient(cnpj);
  if (!rec) return notFound();
  const locale: Locale = (await readSiteLocale()) === "en" ? "en" : "pt";
  const { source, ...detail } = rec;

  return (
    <ForcedLocale locale={locale}>
      <div className="theme-fusion">
        <DetailDrawer
          kicker={<>Recife · {locale === "en" ? "Who's paid" : "Quem recebe"}</>}
          title={rec.nome}
          shareUrl={`/brasil/recife/quem-recebe/${cnpj}`}
          backHref="/brasil/recife/quem-recebe"
          breadcrumbLabel={rec.nome}
        >
          <RecifeRecebedorFiche rec={detail} source={source} />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
