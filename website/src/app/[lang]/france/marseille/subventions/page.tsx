import type { Metadata } from "next";
import "@/app/fusion.css";
import { budgetDoorTotal, loadLogementSocialData, loadQuiRecoitData, loadQuiRecoitIndex, marchesDoorTotal } from "@/lib/fusion-data";
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import { FrHubJsonLd, hubMetadataInput } from "@/lib/seo/sections/national";
import { marseilleSubventionsHub } from "@/lib/seo/sections/marseille";
import SubventionsClient from "@/app/[lang]/france/paris/subventions/SubventionsClient";

// POC v1 Marseille subventions — réutilise QuiRecoitClient avec data Marseille.
// Limites POC connues (cf. memory project_marseille_v1_decisions, P3.2 option a) :
//   - Subventions Ville uniquement (data.gouv.fr SCDL `marseille-subventions-{year}`)
//     Métropole AMP `subventions-attribuees-depuis-2022` à ajouter en phase 2.
//   - Pas d'enrichissement thématique / vulgarisation / SIRENE pour Marseille
//     (cache vide) → tous les bénéficiaires seront groupés sous "Autres" dans le
//     stackbar par thème, et la facette "thématique" sera vide.
//   - Drill-down beneficiaire (`/france/marseille/subventions/association/[slug]`)
//     pas implémenté en POC — les liens existent mais routent vers 404.
//   - Pas de drill-down par thème non plus (vu qu'il n'y a pas de thématique).
//   - Pas d'articles éditoriaux Marseille (posts: []).

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata(hubMetadataInput(marseilleSubventionsHub()));
}

export default async function QuiRecoitPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const idx = loadQuiRecoitIndex("marseille");
  const d = loadQuiRecoitData(requestedYear, "marseille");
  // No Marseille-specific blog posts yet.
  const posts: Parameters<typeof SubventionsClient>[0]["posts"] = [];
  const safe = <T,>(f: () => T): T | null => { try { return f(); } catch { return null; } };
  const doors = {
    budget: safe(() => budgetDoorTotal("marseille", d.year)),
    marches: safe(() => marchesDoorTotal("marseille", d.year)),
    next: safe(() => { const l = loadLogementSocialData(undefined, "marseille"); return l.stockTotal > 0 ? { total: l.stockTotal, year: l.sruYear } : null; }),
  };
  const locale = await readLocale();
  return (
    <>
      <FrHubJsonLd hub={marseilleSubventionsHub()} locale={locale} />
      <SubventionsClient idx={idx} d={d} posts={posts} doors={doors} />
    </>
  );
}
