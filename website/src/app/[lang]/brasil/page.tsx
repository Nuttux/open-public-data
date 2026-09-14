import { redirect } from "next/navigation";
import { readSiteLocale } from "@/lib/seo";
import { localize } from "@/lib/urls";

/**
 * /pt/brasil, /en/brasil: Brazil has one city and no hub page yet. Until it
 * has one, the country address leads to Recife, with a temporary redirect so
 * the address stays free for the hub. Not listed in the sitemap.
 */
export default async function BrasilHub(): Promise<never> {
  redirect(localize("/brasil/recife", await readSiteLocale()));
}
