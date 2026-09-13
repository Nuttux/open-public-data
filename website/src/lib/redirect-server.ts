import { permanentRedirect } from "next/navigation";
import { readSiteLocale } from "@/lib/seo";
import { localize } from "@/lib/urls";

/**
 * permanentRedirect to a LOGICAL path (lib/urls.ts), in the language this
 * request is served in: /france/lille read on /en/… lands on /en/france/lille.
 * Server components only.
 */
export async function permanentRedirectLocalized(path: string): Promise<never> {
  permanentRedirect(localize(path, await readSiteLocale()));
}
