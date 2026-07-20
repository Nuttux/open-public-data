"use client";

import Link from "next/link";
import type { LandingStats } from "@/lib/fusion-data";
import { fmtInt, fmtDec, fmtMillions, fmtBillions } from "@/lib/fmt";
import { useT } from "@/lib/localeContext";

type Props = { stats: LandingStats };

function fill(s: string, vars: Record<string, string | number>): string {
  let out = s;
  for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
  return out;
}

type CardProps = {
  href: string;
  kicker: string;
  title: string;
  amount: string;
  amountUnit: string;
  meta: string;
  cta: string;
  photoPath: string;
  photoCredit: string | null;
};

function HeroDeckCard({ href, kicker, title, amount, amountUnit, meta, cta, photoPath, photoCredit }: CardProps) {
  return (
    <Link className="fx-hero-deck-card fx-hero-deck-card-photo" href={href} scroll={false}>
      <figure className="fx-hero-deck-photo">
        <img
          src={photoPath}
          alt=""
          loading="eager"
          fetchPriority="high"
          width={1200}
          height={675}
        />
        {photoCredit && (
          <figcaption className="fx-hero-deck-photo-credit">© {photoCredit}</figcaption>
        )}
      </figure>
      <div className="fx-hero-deck-body">
        <span className="fx-hero-deck-kicker">{kicker}</span>
        <h3 className="fx-hero-deck-title">{title}</h3>
        <p className="fx-hero-deck-num tnum">
          {amount} <span className="u">{amountUnit}</span>
        </p>
        <p className="fx-hero-deck-meta">{meta}</p>
        <p className="fx-hero-deck-cta">
          {cta} <span aria-hidden="true">→</span>
        </p>
      </div>
    </Link>
  );
}

export default function HeroDeck({ stats }: Props) {
  const t = useT();
  const fl = stats.featuredLieu;
  const fa = stats.featuredAsso;
  const fm = stats.featuredMarcheCategorie;
  const fb = stats.featuredBailleur;
  // Titles come from i18n (not the data `nom`) so the EN locale can gloss the
  // French names — keep fr/en `fx.land.deck.c*.title` in sync with the
  // HERO_FEATURED_* picks in fusion-data.ts.

  return (
    <section className="fx-hero-deck" id="hero-deck" aria-label={t("fx.land.deck.aria")}>
      <div className="fx-wrap">
        <div className="fx-hero-deck-rail" role="group">
          {fl && (
            <HeroDeckCard
              href={`/fr/city/paris/lieu/${fl.slug}`}
              kicker={t("fx.land.deck.lieu.kicker")}
              title={fl.name}
              amount={fmtInt(fl.argentTotal / 1e6)}
              amountUnit="M €"
              meta={fill(
                t(fl.depuis ? "fx.land.deck.lieu.meta" : "fx.land.deck.lieu.meta_nodate"),
                { kind: fl.kind, arr: fl.arrondissement, depuis: fl.depuis ?? "" },
              )}
              cta={t("fx.land.deck.lieu.cta")}
              photoPath={fl.photoPath}
              photoCredit={fl.credit}
            />
          )}

          {fa && (
            <HeroDeckCard
              href={`/fr/city/paris/subventions/association/${fa.slug}`}
              kicker={t("fx.land.deck.c2.kicker")}
              title={t("fx.land.deck.c2.title")}
              amount={fmtInt(fa.montant / 1e6)}
              amountUnit="M €"
              meta={fill(t("fx.land.deck.c2.meta"), { year: fa.year, theme: fa.theme ?? "Culture" })}
              cta={t("fx.land.deck.c2.cta")}
              photoPath={fa.photoPath}
              photoCredit={fa.photoCredit}
            />
          )}

          {fm && (
            <HeroDeckCard
              href={`/fr/city/paris/marches/categorie/${fm.slug}`}
              kicker={t("fx.land.deck.c3.kicker")}
              title={t("fx.land.deck.c3.title")}
              amount={fm.total >= 1e9 ? fmtBillions(fm.total) : fmtMillions(fm.total)}
              amountUnit={fm.total >= 1e9 ? "Md €" : "M €"}
              meta={fill(t("fx.land.deck.c3.meta"), { year: fm.year, nb: fm.nbMarches })}
              cta={t("fx.land.deck.c3.cta")}
              photoPath={fm.photoPath}
              photoCredit={fm.photoCredit}
            />
          )}

          {fb && (
            <HeroDeckCard
              href={`/fr/city/paris/dette/bailleur/${fb.slug}`}
              kicker={t("fx.land.deck.c4.kicker")}
              title={t("fx.land.deck.c4.title")}
              amount={fb.capitalRestant >= 1e9 ? fmtBillions(fb.capitalRestant) : fmtMillions(fb.capitalRestant)}
              amountUnit={fb.capitalRestant >= 1e9 ? "Md €" : "M €"}
              meta={fill(t("fx.land.deck.c4.meta"), { year: fb.year, nb: fb.nbEmprunts })}
              cta={t("fx.land.deck.c4.cta")}
              photoPath={fb.photoPath}
              photoCredit={fb.photoCredit}
            />
          )}
        </div>
      </div>
    </section>
  );
}
