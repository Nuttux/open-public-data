"use client";

import { usePathname } from "next/navigation";
import { useT } from "@/lib/localeContext";
import { registryFooterModel } from "@/lib/footer-model";
import type { Place } from "@/lib/places";
import SiteFooter from "./SiteFooter";

/**
 * The registry-driven footer for any country (US/BR). Mirror of RegistryChrome
 * at the bottom of the page — derives the current place's sections + a per-scope
 * legal / data credit from the place registry, then hands the normalised model
 * to the shared <SiteFooter>. Rendered by the /us and /br layouts.
 */
export default function RegistryFooter({ country }: { country: Place["country"] }) {
  const t = useT();
  const pathname = usePathname() ?? "/";
  const year = new Date().getFullYear();
  const model = registryFooterModel(country, pathname, t, year);
  return <SiteFooter model={model} />;
}
