import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import DetailDrawer from "@/components/fusion/DetailDrawer";
import { ForcedLocale, type Locale } from "@/lib/localeContext";
import RecifeOrgaoFiche from "@/components/br/RecifeOrgaoFiche";
import { loadOrgao } from "@/lib/br/recife-data";
import { titleCasePt } from "@/lib/br/format";

/** Root-level intercepting drawer for a Recife órgão (agency) fiche. */
export default async function DrawerOrgaoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const o = loadOrgao(slug);
  if (!o) return notFound();
  const store = await cookies();
  const locale: Locale = store.get("br_locale")?.value === "en" ? "en" : "pt";
  const { source, ...orgao } = o;
  const nome = titleCasePt(o.orgao);

  return (
    <ForcedLocale locale={locale}>
      <div className="theme-fusion">
        <DetailDrawer
          kicker={<>Recife · Órgão</>}
          title={nome}
          shareUrl={`/br/city/recife/orgao/${slug}`}
          backHref="/br/city/recife/quem-recebe"
          breadcrumbLabel={nome}
        >
          <RecifeOrgaoFiche o={orgao} source={source} />
        </DetailDrawer>
      </div>
    </ForcedLocale>
  );
}
