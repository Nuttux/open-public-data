import WipBanner from "@/components/fusion/WipBanner";
import { CityProvider } from "@/components/fusion/CityContext";

/**
 * Layout partagé pour toutes les pages /fr/city/marseille/*.
 *
 *  - Bandeau WIP en haut de chaque page (périmètre v1 partiel, audit wave 2).
 *  - CityProvider : ancre le contexte ville sur Marseille pour tout le sous-arbre,
 *    de sorte que les fiches partagées (association, contrat, fournisseur…)
 *    construisent leurs liens internes via useCity().basePath = /fr/city/marseille
 *    au lieu du défaut Paris — sinon un lien de fiche Marseille renvoyait vers
 *    Paris (cf. liens cassés hubs Marseille).
 *
 * Les metadata par page restent gérées dans leurs layout.tsx respectifs.
 */
export default function MarseilleLayout({ children }: { children: React.ReactNode }) {
  return (
    <CityProvider city={{ slug: "marseille", basePath: "/fr/city/marseille" }}>
      <WipBanner city="marseille" />
      {children}
    </CityProvider>
  );
}
