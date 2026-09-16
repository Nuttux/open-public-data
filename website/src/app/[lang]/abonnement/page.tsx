import type { Metadata } from "next";
import "@/app/fusion.css";
import Link from "@/components/LocalizedLink";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import LocaleRefresh from "@/components/LocaleRefresh";
import { buildLocaleAwareMetadata, readLocale } from "@/lib/seo";
import fr from "@/i18n/fr";
import en from "@/i18n/en";

/**
 * Where the confirmation link lands (2026-09-16): confirmed, link expired, or
 * something failed. Three sentences, one door back to the numbers. Not
 * indexed, not in the sitemap: nobody searches for this page.
 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = await readLocale();
  return buildLocaleAwareMetadata({
    title: locale === "en" ? "Data alerts · Qipu" : "Alerte données · Qipu",
    description: locale === "en" ? "Your address for the Qipu data alert." : "Votre adresse pour l’alerte données de Qipu.",
    noindex: true,
  });
}

type State = "confirme" | "lien-expire" | "erreur";

export default async function AbonnementPage({ searchParams }: { searchParams: Promise<{ etat?: string }> }) {
  const locale = await readLocale();
  const dict = locale === "en" ? en : fr;
  const t = (key: string): string => dict[key] ?? fr[key] ?? key;
  const sp = await searchParams;
  const state: State = sp.etat === "confirme" || sp.etat === "lien-expire" ? sp.etat : "erreur";

  return (
    <div className="theme-fusion">
      <LocaleRefresh />
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <section className="fx-page-header">
          <div className="fx-wrap">
            <div className="fx-page-kicker">{t("fx.alert.page.kicker")}</div>
            <h1 className="fx-page-title">{t(`fx.alert.page.${state}.title`)}</h1>
            <p className="fx-page-lede">{t(`fx.alert.page.${state}.body`)}</p>
          </div>
        </section>
        <section className="fx-section">
          <div className="fx-wrap" style={{ maxWidth: 720 }}>
            <p>
              <Link href="/france/paris/budget" className="fx-btn fx-btn-primary">{t("fx.alert.page.back")}</Link>
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
