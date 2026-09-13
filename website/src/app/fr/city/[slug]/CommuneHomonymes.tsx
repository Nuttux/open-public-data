import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import { V3Amt, V3Row, V3Section } from "@/components/fiche/v3";
import { findCommuneByAny, type AllCommuneEntry } from "@/lib/all-communes";
import { relatedInt, relatedT } from "@/lib/related-t";

/** Les communes d'un nom partagé, dans l'ordre de la table (plus peuplée d'abord). */
export function homonymesOf(slugs: string[]): AllCommuneEntry[] {
  return slugs.map((s) => findCommuneByAny(s)).filter((c): c is AllCommuneEntry => c !== null);
}

/**
 * Le choix entre communes homonymes. « /fr/city/saint-denis » ne peut pas
 * deviner entre Saint-Denis (La Réunion, 156 282 habitants) et Saint-Denis
 * (Seine-Saint-Denis, 114 782) : plutôt qu'un 404, la liste, avec de quoi
 * reconnaître la sienne. Page en noindex (voir page.tsx) : elle sert qui a tapé
 * l'adresse, elle n'a rien à faire dans un moteur.
 */
export default function CommuneHomonymes({ communes, locale }: { communes: AllCommuneEntry[]; locale: "fr" | "en" }) {
  const t = relatedT(locale);
  const nom = communes[0]?.nom ?? "";
  // fr-FR sépare les milliers d'une espace fine insécable, que la fonte du site
  // n'a pas : « 156282 ». Les formateurs du site posent une insécable ordinaire.
  const hab = (n: number) => relatedInt(n, locale).replace(/ /g, " ");
  // Cette page n'est pas une ville : la barre et le pied de page prennent les
  // liens France, pas sept sections /fr/city/<nom>/… qui n'existent pas.
  return (
    <div className="theme-fusion">
      <Navbar scopePath="/fr/national" />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-v3" style={{ maxWidth: 760, margin: "0 auto", padding: "48px 20px 72px" }}>
          <h1 style={{ fontFamily: "var(--f-disp)", fontSize: "clamp(28px, 5vw, 40px)", lineHeight: 1.1, margin: "0 0 12px", textWrap: "balance" }}>
            {t("fx.homonymes.h1", { nom, n: communes.length })}
          </h1>
          <p className="fx-answer" style={{ fontSize: 17, lineHeight: 1.5, color: "var(--ink-2)", margin: "0 0 32px" }}>
            {t("fx.homonymes.lead", { nom })}
          </p>
          <V3Section title={t("fx.homonymes.h_list", { nom })} sub={t("fx.homonymes.sub")}>
            {communes.map((c) => (
              <V3Row key={c.slug} href={`/fr/city/${c.slug}`}
                     label={`${c.nom} (${c.dep_name})`} sub={c.reg_name}
                     amount={<V3Amt v={hab(c.pop)} u={t("fx.homonymes.hab")} />} />
            ))}
          </V3Section>
        </div>
      </main>
      <Footer scopePath="/fr/national" />
    </div>
  );
}
