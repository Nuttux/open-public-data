import WipBanner from "@/components/fusion/WipBanner";

/**
 * Layout partagé pour toutes les pages /fr/city/marseille/*.
 *
 * Rôle unique : afficher le bandeau WIP en haut de chaque page Marseille
 * (signalisation honnête du périmètre v1 partiel, cf audit data wave 2).
 *
 * Les metadata par page restent gérées dans leurs layout.tsx respectifs.
 */
export default function MarseilleLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <WipBanner city="marseille" />
      {children}
    </>
  );
}
