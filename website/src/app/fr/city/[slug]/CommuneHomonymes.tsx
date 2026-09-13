import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import { V3Amt, V3Row } from "@/components/fiche/v3";
import { findCommuneByAny, type AllCommuneEntry } from "@/lib/all-communes";
import { nomDistinct } from "@/lib/nom-commune";
import { relatedInt, relatedT } from "@/lib/related-t";

/** Les communes d'un nom partagé, dans l'ordre de la table (plus peuplée d'abord). */
export function homonymesOf(slugs: string[]): AllCommuneEntry[] {
  return slugs.map((s) => findCommuneByAny(s)).filter((c): c is AllCommuneEntry => c !== null);
}

/**
 * « /fr/city/saint-denis » : quelle Saint-Denis ? Une question, puis les
 * options telles que la recherche les écrit — « Saint-Denis (Seine-Saint-Denis) »
 * — de la plus peuplée à la moins peuplée. Rien d'autre à lire avant de
 * choisir. Page en noindex (voir page.tsx) : elle sert qui a tapé l'adresse.
 */
export default function CommuneHomonymes({ communes, locale }: { communes: AllCommuneEntry[]; locale: "fr" | "en" }) {
  const t = relatedT(locale);
  const nom = communes[0]?.nom ?? "";
  // fr-FR sépare les milliers d'une espace fine insécable, que la fonte du site
  // n'a pas : « 156282 ». Les formateurs du site posent une insécable ordinaire.
  const hab = (n: number) => relatedInt(n, locale).replace(/\u202f/g, "\u00a0");
  // Cette page n'est pas une ville : la barre et le pied de page prennent les
  // liens France, pas sept sections /fr/city/<nom>/… qui n'existent pas.
  return (
    <div className="theme-fusion">
      <Navbar scopePath="/fr/national" />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-v3" style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px 72px" }}>
          <h1 style={{ fontFamily: "var(--f-disp)", fontSize: "clamp(28px, 5vw, 40px)", lineHeight: 1.1, margin: "0 0 8px", textWrap: "balance" }}>
            {t("fx.homonymes.h1", { nom })}
          </h1>
          <p style={{ fontSize: 14, color: "var(--muted)", margin: "0 0 24px" }}>
            {t("fx.homonymes.lead", { n: communes.length })}
          </p>
          <div style={{ borderTop: "1px solid var(--ink)" }}>
            {communes.map((c) => (
              <V3Row key={c.slug} href={`/fr/city/${c.slug}`}
                     label={nomDistinct(c)} sub={c.reg_name}
                     amount={<V3Amt v={hab(c.pop)} u={t("fx.homonymes.hab")} />} />
            ))}
          </div>
        </div>
      </main>
      <Footer scopePath="/fr/national" />
    </div>
  );
}
