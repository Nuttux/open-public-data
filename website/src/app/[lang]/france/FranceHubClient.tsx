"use client";

import CommunePicker, { type CommuneChoice } from "@/components/fusion/CommunePicker";
import SectionHero from "@/components/fiche/SectionHero";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Fold, V3Foot, V3Row, V3Section } from "@/components/fiche/v3";
import { useT } from "@/lib/localeContext";
import { useRouter } from "@/lib/navigation";
import { useFmt, useFmtEur } from "@/lib/use-fmt";
import { fill } from "@/lib/fmt";

export type FranceHubData = {
  count: number;
  year: number;
  total: number;
  lastYear: number;
  biggest: { slug: string; nom: string; dep: string; pop: number; hab: number | null }[];
  suggestions: CommuneChoice[];
  paris: {
    budget: { total: number; year: number; voted: boolean } | null;
    subventions: { total: number; year: number } | null;
    marches: { total: number; nb: number; year: number } | null;
    investissements: { total: number; year: number } | null;
    dette: { total: number; year: number } | null;
    logement: { sru: number; year: number } | null;
    lieux: { n: number; money: number } | null;
  };
  marseille: { total: number; year: number; voted: boolean } | null;
};

/**
 * The France hub (2026-09-18) : the field to find one's commune, the
 * country's number, Paris as the documented city with its seven doors,
 * Marseille, the 20 largest communes as a way in, and where the numbers come
 * from. Same grammar as the sections and as the Brazil hub.
 */
export default function FranceHubClient({ d }: { d: FranceHubData }) {
  const t = useT();
  const f = useFmt();
  const eur = useFmtEur();
  const router = useRouter();
  const hero = f.fmtCompactEur(d.total);
  const int = (n: number) => f.fmtInt(n);
  const money = (n: number | null | undefined) => (n != null && n > 0 ? { value: eur(n).v, unit: eur(n).u } : {});
  const p = d.paris;
  const budgetSub = (b: { year: number; voted: boolean }) => fill(t(b.voted ? "fr.hub.d.budget_vote" : "fr.hub.d.budget_exec"), { y: b.year });

  return (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-sec fx-v3">
        <div className="fx-sec-kicker fx-page-kicker">{t("fr.hub.kicker")}</div>
        <div className="fx-sec-grid" data-layout="subventions">
          <div className="fx-sec-a-hero">
            <SectionHero
              title={t("fr.hub.h1")}
              value={hero.value}
              unit={hero.unit}
              captionBefore={fill(t("fr.hub.cap_before"), { n: int(d.count) })}
              captionAfter={t("fr.hub.cap_after")}
              years={[d.year]}
              year={d.year}
              basePath="/france"
              meta={t("fr.hub.meta")}
              shareTitle={fill(t("fr.hub.share"), { n: int(d.count), total: `${hero.value} ${hero.unit}`, y: d.year })}
            />
            <V3Section id="find" title={t("fr.hub.find_h")} sub={t("fr.hub.find_sub")}>
              <CommunePicker current={null} exclude="" suggestions={d.suggestions} label={t("fr.hub.find_h")} suggestHeading={t("fr.hub.big_h")} onPick={(c) => router.push(`/france/${c.slug}`)} />
              <p className="fx-v3-note">{t("fr.hub.find_note")}</p>
            </V3Section>
          </div>

          <div className="fx-sec-a-scene">
            <V3Section id="paris" title={t("fr.hub.paris_h")} sub={t("fr.hub.paris_sub")}>
              <Door href="/france/paris/budget" hard title={t("fr.hub.d.budget")} sub={p.budget ? budgetSub(p.budget) : undefined} {...money(p.budget?.total)} />
              <Door href="/france/paris/subventions" hard title={t("fr.hub.d.subventions")} sub={p.subventions ? fill(t("fr.hub.d.subventions_sub"), { y: p.subventions.year }) : undefined} {...money(p.subventions?.total)} />
              <Door href="/france/paris/marches" hard title={t("fr.hub.d.marches")} sub={p.marches ? fill(t("fr.hub.d.marches_sub"), { n: int(p.marches.nb), y: p.marches.year }) : undefined} {...money(p.marches?.total)} />
              <Door href="/france/paris/investissements" hard title={t("fr.hub.d.invest")} sub={p.investissements ? fill(t("fr.hub.d.invest_sub"), { y: p.investissements.year }) : undefined} {...money(p.investissements?.total)} />
              <Door href="/france/paris/logement" hard title={t("fr.hub.d.logement")} sub={p.logement ? fill(t("fr.hub.d.logement_sub"), { y: p.logement.year }) : undefined} value={p.logement ? f.fmtDec(p.logement.sru, 1) : undefined} unit={p.logement ? "%" : undefined} />
              <Door href="/france/paris/dette" hard title={t("fr.hub.d.dette")} sub={p.dette ? fill(t("fr.hub.d.dette_sub"), { y: p.dette.year }) : undefined} {...money(p.dette?.total)} />
              <Door href="/france/paris/lieux" hard title={t("fr.hub.d.lieux")} sub={p.lieux && p.lieux.money > 0 ? fill(t("fr.hub.d.lieux_sub"), { money: `${eur(p.lieux.money).v} ${eur(p.lieux.money).u}` }) : undefined} value={p.lieux ? int(p.lieux.n) : undefined} unit={p.lieux ? t("fr.hub.d.lieux_unit") : undefined} />
            </V3Section>
            <V3Section id="marseille" title={t("fr.hub.marseille_h")} sub={t("fr.hub.marseille_sub")}>
              <Door href="/france/marseille" hard title="Marseille" sub={d.marseille ? budgetSub(d.marseille) : undefined} {...money(d.marseille?.total)} />
            </V3Section>
          </div>

          <div className="fx-sec-a-search">
            <V3Section id="grandes" title={t("fr.hub.big_h")} sub={fill(t("fr.hub.big_sub"), { y: d.year })}>
              {d.biggest.map((c) => (
                <V3Row
                  key={c.slug}
                  href={`/france/${c.slug}`}
                  label={c.dep && c.dep !== c.nom ? `${c.nom} (${c.dep})` : c.nom}
                  subText={fill(t("fr.hub.row_sub"), { pop: int(c.pop), y: d.year })}
                  amount={c.hab != null ? <span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{int(Math.round(c.hab))}{"\u00a0"}€<span className="u">{t("fr.hub.per_hab")}</span></span> : undefined}
                />
              ))}
            </V3Section>
          </div>

          <div className="fx-sec-a-understand">
            <V3Section id="understand" title={t("fx.sec.understand")}>
              <V3Fold id="what" label={t("fr.hub.u.what")}><p className="fx-v3-sentence">{fill(t("fr.hub.u.what_body"), { n: int(d.count) })}</p></V3Fold>
              <V3Fold id="source" label={t("fr.hub.u.source")}><p className="fx-v3-sentence">{fill(t("fr.hub.u.source_body"), { y: d.year, last: d.lastYear })}</p></V3Fold>
            </V3Section>
          </div>

          <div className="fx-sec-a-related">
            <V3Section id="related" title={t("fx.sec.see_also")}>
              <V3Row href="/france/budget" label={t("fr.hub.r.etat")} subText={t("fr.hub.r.etat_sub")} />
              <V3Row href="/france/simulateur-prelevements" label={t("fr.hub.r.contrib")} subText={t("fr.hub.r.contrib_sub")} />
              <V3Row href="/france/comparer" label={t("fr.hub.r.comparer")} subText={t("fr.hub.r.comparer_sub")} />
              <V3Row href="/analyses" label={t("fr.hub.r.analyses")} subText={t("fr.hub.r.analyses_sub")} />
              <V3Row href="/usa/san-francisco" label="San Francisco" subText={t("fr.hub.r.sf")} />
              <V3Row href="/brasil" label={t("fr.hub.r.brasil")} subText={t("fr.hub.r.brasil_sub")} />
              <V3Row href="/pour-les-villes" label={t("fr.hub.r.cities")} subText={t("fr.hub.r.cities_sub")} />
            </V3Section>
          </div>

          <div className="fx-sec-a-next">
            <NextDoor href="/france/paris" kicker={t("fx.pv.next.kicker")} title={t("fr.hub.next_title")} sub={t("fr.hub.next_sub")} />
          </div>

          <div className="fx-sec-a-foot">
            <V3Foot>{fill(t("fr.hub.foot"), { y: d.year })}</V3Foot>
          </div>
        </div>
      </div>
    </main>
  );
}
