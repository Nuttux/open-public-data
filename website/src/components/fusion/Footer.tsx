"use client";

import { usePathname } from "next/navigation";
import { useT } from "@/lib/localeContext";
import { franceFooterModel } from "@/lib/footer-model";
import { useCommuneNav } from "@/components/CommuneNavContext";
import SiteFooter from "@/components/SiteFooter";
import ReplayOptIn from "./ReplayOptIn";

/**
 * France footer — builds the normalised model from nav-links.ts (ADR-0010 D3:
 * France's nav still reads cities.ts/nav-links.ts, not the registry) and renders
 * the shared <SiteFooter>. Session-replay consent lives in France's `optIn` slot.
 * Imported per-page by France clients; US/BR use RegistryFooter via their layout.
 */
export default function Footer({ scopePath }: { scopePath?: string } = {}) {
  const t = useT();
  const pathname = usePathname() ?? "/";
  // National tail commune → its DATA-DERIVED sections (no Paris-shaped fallback).
  const commune = useCommuneNav();
  const year = new Date().getFullYear();
  // `scopePath` : même rôle que dans Navbar — une page qui n'est pas un lieu
  // (le choix entre communes homonymes) prend le pied de page de ce chemin.
  const model = franceFooterModel(scopePath ?? pathname, t, year, commune);
  return <SiteFooter model={model} optIn={<ReplayOptIn />} />;
}
