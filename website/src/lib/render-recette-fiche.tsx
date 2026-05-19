import type { ReactNode } from "react";
import { notFound } from "next/navigation";

import { DetailDrawer, Navbar, Footer, RecetteFiche } from "@/components/fusion";
import { loadRecettesApu } from "@/lib/recettes-apu";
import { readLocale } from "@/lib/seo";

/**
 * Helper unique pour rendre la fiche d'une recette publique (drawer ou
 * standalone). Mirror de render-drilldown-page.tsx mais pour les recettes
 * du panneau §02 /france/budget.
 *
 * Cas spécial : la clé `psr_ue` ouvre une fiche enrichie avec la
 * décomposition PSR-UE (RNB, TVA, plastique, NextGenerationEU). La clé
 * `ue_fonds_recus` (synthetic) ouvre la décomposition fonds reçus.
 */

export type RenderRecetteOpts = {
  params: Promise<{ key: string }>;
  isDrawer: boolean;
};

const UE_PSR_VERSE_KEY = "psr_ue";
const UE_FONDS_RECUS_KEY = "ue_fonds_recus";

export async function renderRecettePage(
  opts: RenderRecetteOpts,
): Promise<ReactNode> {
  const { key } = await opts.params;
  const decoded = decodeURIComponent(key);
  const locale = await readLocale();
  const data = loadRecettesApu();
  if (!data) return notFound();

  // Cas spécial : la fiche synthétique "PSR-UE versé" — pas dans les items
  // d'une institution, on la fabrique depuis europe.psr_decomposition.
  if (decoded === UE_PSR_VERSE_KEY && data.europe.psr_decomposition) {
    const ficheItem = {
      key: UE_PSR_VERSE_KEY,
      label_fr: "Contribution Union européenne (PSR-UE brut)",
      label_en: "EU contribution (gross PSR-UE)",
      annual_eur: data.europe.psr_ue_brut_md_eur * 1e9,
      nature: "transfert_ue" as const,
      source: data.europe.psr_source,
      source_url: data.europe.psr_source_url,
      notes:
        "Prélèvement sur Recettes au profit de l'Union européenne (PSR-UE). La France verse ~23 Md€/an au budget de l'UE, principalement basé sur le RNB (PIB) français. Cette contribution est obligatoire (article 311 TFUE + décision sur les ressources propres 2020). Contribution nette ~5,8 Md€/an après déduction des fonds reçus en retour (PAC, FEDER, Horizon, NGEU).",
    };
    const ueDecomposition = {
      type: "psr_verse" as const,
      items: data.europe.psr_decomposition,
      totalNetMdEur: data.europe.contribution_nette_md_eur,
      sourceUrl: data.europe.psr_source_url,
    };
    return renderShell({
      isDrawer: opts.isDrawer,
      title:
        locale === "en"
          ? "EU contribution (gross PSR-UE)"
          : "Contribution UE — PSR-UE brut",
      kicker:
        locale === "en"
          ? "EU balance · gross / received / net"
          : "Bilan UE · brut / reçu / net",
      shareUrl: "/france/budget/recettes/psr_ue",
      backHref: "/france/budget#recettes-apu",
      fiche: (
        <RecetteFiche
          item={ficheItem}
          institution={{
            label_fr: "Union européenne",
            label_en: "European Union",
            annual_eur: data.europe.psr_ue_brut_md_eur * 1e9,
            items: [],
          }}
          ueDecomposition={ueDecomposition}
          locale={locale}
        />
      ),
    });
  }

  // Cas spécial : la fiche synthétique "fonds reçus UE" — pas dans les items
  // des institutions, on la fabrique depuis europe.fonds_decomposition.
  if (decoded === UE_FONDS_RECUS_KEY && data.europe.fonds_decomposition) {
    const ficheItem = {
      key: UE_FONDS_RECUS_KEY,
      label_fr: "Fonds européens reçus en France",
      label_en: "EU funds received in France",
      annual_eur: data.europe.fonds_recus_md_eur * 1e9,
      nature: "transfert_ue" as const,
      source: data.europe.fonds_source,
      source_url: data.europe.fonds_source_url,
      notes:
        "Les fonds européens reviennent en France via différents canaux : PAC pour les agriculteurs (versée par ASP), fonds structurels FEDER/FSE pour les régions et porteurs de projets, Horizon Europe pour la recherche, et le volet subventions de NextGenerationEU pour le plan de relance. Ils ne transitent pas par le budget de l'État central — sauf NGEU partiellement.",
    };
    const ueDecomposition = {
      type: "fonds_recus" as const,
      items: data.europe.fonds_decomposition,
      totalNetMdEur: data.europe.contribution_nette_md_eur,
      sourceUrl: data.europe.fonds_source_url,
    };
    return renderShell({
      isDrawer: opts.isDrawer,
      title:
        locale === "en"
          ? "EU funds received in France"
          : "Fonds européens reçus en France",
      kicker:
        locale === "en"
          ? "EU balance · gross / received / net"
          : "Bilan UE · brut / reçu / net",
      shareUrl: "/france/budget/recettes/ue_fonds_recus",
      backHref: "/france/budget#recettes-apu",
      fiche: (
        <RecetteFiche
          item={ficheItem}
          institution={{
            label_fr: "Union européenne",
            label_en: "European Union",
            annual_eur: data.europe.fonds_recus_md_eur * 1e9,
            items: [],
          }}
          ueDecomposition={ueDecomposition}
          locale={locale}
        />
      ),
    });
  }

  // Recherche dans les 3 institutions S1311/S1313/S1314.
  let item:
    | (typeof data.institutions.S1311.items)[number]
    | null = null;
  let institution: typeof data.institutions.S1311 | null = null;
  for (const code of ["S1311", "S1313", "S1314"] as const) {
    const ins = data.institutions[code];
    const found = ins.items.find((it) => it.key === decoded);
    if (found) {
      item = found;
      institution = ins;
      break;
    }
  }
  if (!item || !institution) return notFound();

  // Enrich UE si c'est la ligne psr_ue.
  let ueDecomposition: Parameters<typeof RecetteFiche>[0]["ueDecomposition"] =
    null;
  if (decoded === UE_PSR_VERSE_KEY && data.europe.psr_decomposition) {
    ueDecomposition = {
      type: "psr_verse",
      items: data.europe.psr_decomposition,
      totalNetMdEur: data.europe.contribution_nette_md_eur,
      sourceUrl: data.europe.psr_source_url,
    };
  }

  const title = locale === "en" ? item.label_en : item.label_fr;
  const instLabel =
    locale === "en" ? institution.label_en : institution.label_fr;
  const kicker =
    locale === "en" ? `Public revenue · ${instLabel}` : `Recette publique · ${instLabel}`;

  return renderShell({
    isDrawer: opts.isDrawer,
    title,
    kicker,
    shareUrl: `/france/budget/recettes/${encodeURIComponent(decoded)}`,
    backHref: "/france/budget#recettes-apu",
    fiche: (
      <RecetteFiche
        item={item}
        institution={institution}
        ueDecomposition={ueDecomposition}
        locale={locale}
      />
    ),
  });
}

function renderShell(opts: {
  isDrawer: boolean;
  title: string;
  kicker: string;
  shareUrl: string;
  backHref: string;
  fiche: ReactNode;
}): ReactNode {
  if (opts.isDrawer) {
    return (
      <div className="theme-fusion db-drawer-shell">
        <DetailDrawer
          kicker={opts.kicker}
          title={opts.title}
          shareUrl={opts.shareUrl}
          backHref={opts.backHref}
          breadcrumbLabel={opts.title}
        >
          {opts.fiche}
        </DetailDrawer>
      </div>
    );
  }
  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <section className="fx-page-header">
          <div className="fx-wrap">
            <p className="fx-page-kicker">{opts.kicker}</p>
            <h1
              className="fx-page-title"
              style={{ fontSize: "clamp(28px, 4vw, 48px)" }}
            >
              {opts.title}
            </h1>
          </div>
        </section>
        <div className="fx-fiche-wrap">{opts.fiche}</div>
      </main>
      <Footer />
    </div>
  );
}
