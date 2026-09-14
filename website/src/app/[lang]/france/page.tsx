import { redirect } from "next/navigation";
import { readSiteLocale } from "@/lib/seo";
import { localize } from "@/lib/urls";

/**
 * /fr/france, /en/france: France has no hub page yet (the legacy tree had none
 * either — /fr/national answered 404). Until it has one, the country address
 * leads to the national budget, with a temporary redirect so the address stays
 * free for the hub. Not listed in the sitemap.
 */
export default async function FranceHub(): Promise<never> {
  redirect(localize("/france/budget", await readSiteLocale()));
}
