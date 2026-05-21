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
  const fp = stats.featuredProjet;
  const fa = stats.featuredAsso;
  const fm = stats.featuredMarcheCategorie;
  const fb = stats.featuredBailleur;

  return (
    <section className="fx-hero-deck" id="hero-deck" aria-label={t("fx.land.deck.aria")}>
      <div className="fx-wrap">
        <h2 className="fx-hero-deck-h2">
          {t("fx.land.deck.h2.before")}
          <em>{t("fx.land.deck.h2.em")}</em>
          {t("fx.land.deck.h2.dot")}
        </h2>

        <div className="fx-hero-deck-rail" role="group">
          {fp && (
            <HeroDeckCard
              href={`/ville/paris/investissements/projet/${fp.id}`}
              kicker={t("fx.land.deck.c1.kicker")}
              title={fp.nom}
              amount={fmtDec(fp.montant / 1e6, 1)}
              amountUnit="M €"
              meta={fill(t("fx.land.deck.c1.meta"), { arr: fp.arrondissement, year: fp.year })}
              cta={t("fx.land.deck.c1.cta")}
              photoPath={fp.photoPath}
              photoCredit={fp.credit}
            />
          )}

          {fa && (
            <HeroDeckCard
              href={`/ville/paris/subventions/association/${fa.slug}`}
              kicker={t("fx.land.deck.c2.kicker")}
              title={fa.nom}
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
              href={`/ville/paris/marches/categorie/${fm.slug}`}
              kicker={t("fx.land.deck.c3.kicker")}
              title={fm.nom}
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
              href={`/ville/paris/dette/bailleur/${fb.slug}`}
              kicker={t("fx.land.deck.c4.kicker")}
              title={fb.nom}
              amount={fb.capitalRestant >= 1e9 ? fmtBillions(fb.capitalRestant) : fmtMillions(fb.capitalRestant)}
              amountUnit={fb.capitalRestant >= 1e9 ? "Md €" : "M €"}
              meta={fill(t("fx.land.deck.c4.meta"), { year: fb.year, nb: fb.nbEmprunts })}
              cta={t("fx.land.deck.c4.cta")}
              photoPath={fb.photoPath}
              photoCredit={fb.photoCredit}
            />
          )}
        </div>

        <p className="fx-hero-deck-srcline">{fill(t("fx.land.deck.srcline"), { year: stats.year })}</p>
      </div>
    </section>
  );
}
