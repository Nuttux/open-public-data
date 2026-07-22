import { AssociationFiche } from "@/components/fusion";
import { AssoKicker, AssoPageHeader } from "@/components/fusion/AssoKicker";
import VoirLeLieu from "@/components/fusion/VoirLeLieu";
import type { EntityPageConfig } from "@/lib/entity-page";
import { numLocale } from "@/lib/fmt";
import {
  loadAssociation,
  loadSubventionVulgarization,
  loadBeneficiaireGrounded,
} from "@/lib/fusion-data";
import { lieuForBeneficiaire } from "@/lib/lieux-data";

type D = {
  asso: NonNullable<ReturnType<typeof loadAssociation>>;
  vulgarization: ReturnType<typeof loadSubventionVulgarization>;
  grounded: ReturnType<typeof loadBeneficiaireGrounded>;
  lieuLien: ReturnType<typeof lieuForBeneficiaire>;
};

export const associationConfig: EntityPageConfig<D> = {
  load: ({ slug }) => {
    const asso = loadAssociation(slug);
    if (!asso) return null;
    return {
      asso,
      vulgarization: loadSubventionVulgarization(asso.name),
      grounded: loadBeneficiaireGrounded(asso.name),
      lieuLien: lieuForBeneficiaire(asso.name),
    };
  },
  notFoundMetadata: (locale) => ({
    title: locale === "en" ? "Beneficiary not found — Qipu" : "Association introuvable — Qipu",
    robots: { index: false },
  }),
  metadata: ({ asso: a }, locale) => {
    const amountFmt = a.totalAmount.toLocaleString(numLocale(locale));
    const title = locale === "en"
      ? `${a.name} — Beneficiary · Qipu`
      : `${a.name} — Association · Qipu`;
    const description = locale === "en"
      ? `${a.name}: ${a.subventionCount} grants, total €${amountFmt} from the Ville de Paris.`
      : `${a.name} : ${a.subventionCount} subventions, cumul ${amountFmt} € de la Ville de Paris.`;
    const canonical = `/fr/city/paris/subventions/association/${encodeURIComponent(a.name)}`;
    return {
      title,
      description,
      alternates: { canonical, languages: { "fr-FR": canonical, "en-US": canonical } },
      openGraph: {
        title,
        description,
        type: "article",
        locale: locale === "en" ? "en_US" : "fr_FR",
        alternateLocale: locale === "en" ? ["fr_FR"] : ["en_US"],
      },
    };
  },
  page: {
    header: ({ asso }) => (
      <>
        <AssoPageHeader theme={asso.theme} />
        <h1 className="fx-page-title" style={{ fontSize: "clamp(28px, 4vw, 48px)" }}>
          {asso.name}
        </h1>
      </>
    ),
    body: ({ asso, vulgarization, grounded, lieuLien }, locale) => (
      <>
        <VoirLeLieu lien={lieuLien} locale={locale} />
        <AssociationFiche asso={asso} vulgarization={vulgarization} grounded={grounded} />
      </>
    ),
  },
  drawer: {
    kicker: ({ asso }) => <AssoKicker theme={asso.theme} />,
    title: ({ asso }) => asso.name,
    shareUrl: ({ asso }) => `/fr/city/paris/subventions/association/${encodeURIComponent(asso.name)}`,
    shareText: ({ asso }) => {
      const montantStr = asso.totalAmount >= 1e6
        ? `${(asso.totalAmount / 1e6).toFixed(1).replace(".", ",")} M€`
        : `${Math.round(asso.totalAmount / 1000).toLocaleString("fr-FR")} k€`;
      return `${asso.name} a reçu ${montantStr} de subventions de la Ville de Paris${asso.theme ? ` (${asso.theme})` : ""}`;
    },
    backHref: () => "/fr/city/paris/subventions",
    breadcrumbLabel: ({ asso }) => asso.name,
    children: ({ asso, vulgarization, grounded, lieuLien }) => (
      <>
        <VoirLeLieu lien={lieuLien} locale={"fr"} />
        <AssociationFiche asso={asso} vulgarization={vulgarization} grounded={grounded} />
      </>
    ),
  },
};
