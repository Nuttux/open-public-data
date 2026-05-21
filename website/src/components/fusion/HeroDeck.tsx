"use client";

import Link from "next/link";
import type { LandingStats } from "@/lib/fusion-data";
import { fmtInt, fmtDec } from "@/lib/fmt";
import { useT } from "@/lib/localeContext";

type Props = { stats: LandingStats };

function fill(s: string, vars: Record<string, string | number>): string {
  let out = s;
  for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
  return out;
}

export default function HeroDeck({ stats }: Props) {
  const t = useT();
  const fp = stats.featuredProjet;
  const educationEntry = stats.breakdown.find((b) =>
    b.label.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().startsWith("educ"),
  );
  const sinceYear = Math.min(stats.marchesSinceYear, stats.subventionsSinceYear);

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
            <Link
              className="fx-hero-deck-card fx-hero-deck-card-photo"
              href={`/ville/paris/investissements/projet/${fp.id}`}
            >
              <figure className="fx-hero-deck-photo">
                <img
                  src={fp.photoPath}
                  alt=""
                  loading="eager"
                  fetchPriority="high"
                  width={1200}
                  height={750}
                />
                {fp.credit && (
                  <figcaption className="fx-hero-deck-photo-credit">
                    © {fp.credit}
                  </figcaption>
                )}
              </figure>
              <div className="fx-hero-deck-body">
                <span className="fx-hero-deck-kicker">{t("fx.land.deck.c1.kicker")}</span>
                <h3 className="fx-hero-deck-title">{fp.nom}</h3>
                <p className="fx-hero-deck-num tnum">
                  {fmtDec(fp.montant / 1e6, 1)} <span className="u">M €</span>
                </p>
                <p className="fx-hero-deck-meta">
                  {fill(t("fx.land.deck.c1.meta"), { arr: fp.arrondissement, year: fp.year })}
                </p>
                <p className="fx-hero-deck-cta">{t("fx.land.deck.c1.cta")} <span aria-hidden="true">→</span></p>
              </div>
            </Link>
          )}

          <Link className="fx-hero-deck-card fx-hero-deck-card-num" href="/ville/paris/budget">
            <div className="fx-hero-deck-body">
              <span className="fx-hero-deck-kicker">{t("fx.land.deck.c2.kicker")}</span>
              <p className="fx-hero-deck-num fx-hero-deck-num-xl tnum">
                {fmtInt(stats.perCapitaMonth)} <span className="u">€</span>
              </p>
              <p className="fx-hero-deck-meta">{t("fx.land.deck.c2.meta")}</p>
              <p className="fx-hero-deck-cta">{t("fx.land.deck.c2.cta")} <span aria-hidden="true">→</span></p>
            </div>
          </Link>

          {educationEntry && (
            <Link
              className="fx-hero-deck-card fx-hero-deck-card-num"
              href={`/ville/paris/budget?year=${stats.year}#sec-flux`}
            >
              <div className="fx-hero-deck-body">
                <span className="fx-hero-deck-kicker">{t("fx.land.deck.c3.kicker")}</span>
                <p className="fx-hero-deck-num fx-hero-deck-num-xl tnum">
                  {fmtInt(educationEntry.perMonth)} <span className="u">€</span>
                </p>
                <p className="fx-hero-deck-meta">{t("fx.land.deck.c3.meta")}</p>
                <p className="fx-hero-deck-cta">{t("fx.land.deck.c3.cta")} <span aria-hidden="true">→</span></p>
              </div>
            </Link>
          )}

          <Link className="fx-hero-deck-card fx-hero-deck-card-num" href="/ville/paris/marches">
            <div className="fx-hero-deck-body">
              <span className="fx-hero-deck-kicker">{t("fx.land.deck.c4.kicker")}</span>
              <p className="fx-hero-deck-num-pair">
                <span className="v tnum">{fmtInt(stats.nbMarchesCumul)}</span>
                <span className="l">{t("fx.land.deck.c4.marches")}</span>
              </p>
              <p className="fx-hero-deck-num-pair">
                <span className="v tnum">{fmtInt(stats.nbSubventionsCumul)}</span>
                <span className="l">{t("fx.land.deck.c4.subv")}</span>
              </p>
              <p className="fx-hero-deck-meta">{fill(t("fx.land.deck.c4.meta"), { since: sinceYear })}</p>
              <p className="fx-hero-deck-cta">{t("fx.land.deck.c4.cta")} <span aria-hidden="true">→</span></p>
            </div>
          </Link>
        </div>

        <p className="fx-hero-deck-srcline">
          {fill(t("fx.land.deck.srcline"), { year: stats.year })}
        </p>
      </div>
    </section>
  );
}
