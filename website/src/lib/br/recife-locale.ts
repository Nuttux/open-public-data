import { readSiteLocale } from "@/lib/seo";
import type { RecifeLocale } from "@/lib/br/recife-answers";

/** The Recife pages speak Portuguese on pt.qipu.org and English elsewhere. */
export async function recifeLocale(): Promise<RecifeLocale> {
  return (await readSiteLocale()) === "pt" ? "pt" : "en";
}
