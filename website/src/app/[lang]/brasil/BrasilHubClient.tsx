"use client";

import Link from "@/components/LocalizedLink";
import MunicipioSearch from "@/components/br/MunicipioSearch";
import SectionHero from "@/components/fiche/SectionHero";
import { Door, NextDoor } from "@/components/fiche/Doors";
import { V3Fold, V3Foot, V3Row, V3Section } from "@/components/fiche/v3";
import { useLocale, useT } from "@/lib/localeContext";
import { fill, fmtBrl, fmtBrlCompact, fmtBrlCompactNum, brlMagnitude } from "@/lib/br/format";

export type BrasilHubData = {
  count: number;
  year: number;
  totalPago: number;
  capitals: { slug: string; nome: string; uf: string; pop: number | null; hab: number | null; ano: number }[];
  recife: { total: number; year: number } | null;
};

/**
 * The Brazil hub (2026-09-18) : the field to find one's município, the
 * country's number, Recife as the documented city, the 27 capitals as a way
 * in, and where the numbers come from. Same grammar as the sections.
 */
export default function BrasilHubClient({ d }: { d: BrasilHubData }) {
  const t = useT();
  const { locale } = useLocale();
  const int = new Intl.NumberFormat(locale === "en" ? "en-US" : "pt-BR", { maximumFractionDigits: 0 });
  const caps = d.capitals.slice().sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-sec fx-v3">
        <div className="fx-sec-kicker fx-page-kicker">{t("br.hub.kicker")}</div>
        <div className="fx-sec-grid" data-layout="subventions">
          <div className="fx-sec-a-hero">
            <SectionHero
              title={t("br.hub.h1")}
              value={fmtBrlCompactNum(d.totalPago)}
              unit={brlMagnitude(d.totalPago)}
              captionBefore={fill(t("br.hub.cap_before"), { n: int.format(d.count) })}
              captionAfter={t("br.hub.cap_after")}
              years={[d.year]}
              year={d.year}
              basePath="/brasil"
              meta={t("br.hub.meta")}
              shareTitle={fill(t("br.hub.share"), { n: int.format(d.count), total: fmtBrlCompact(d.totalPago), y: d.year })}
            />
            <V3Section id="find" title={t("br.hub.find_h")} sub={t("br.hub.find_sub")}>
              <MunicipioSearch placeholder={t("br.hub.find_ph")} label={t("br.hub.find_h")} />
              <p className="fx-v3-note">{t("br.hub.find_note")}</p>
            </V3Section>
          </div>

          <div className="fx-sec-a-scene">
            <V3Section id="recife" title={t("br.hub.recife_h")} sub={t("br.hub.recife_sub")}>
              <Door href="/brasil/recife" hard title="Recife" sub={t("br.hub.recife_door")} value={d.recife ? fmtBrlCompactNum(d.recife.total) : undefined} unit={d.recife ? brlMagnitude(d.recife.total) : undefined} />
              <Door href="/brasil/recife/quem-recebe" hard title={t("br.hub.recife_quem")} sub={t("br.hub.recife_quem_sub")} />
              <Door href="/brasil/recife/contratos" hard title={t("br.hub.recife_contratos")} sub={t("br.hub.recife_contratos_sub")} />
              <Door href="/brasil/recife/lugares" hard title={t("br.hub.recife_lugares")} sub={t("br.hub.recife_lugares_sub")} />
            </V3Section>
          </div>

          <div className="fx-sec-a-search">
            <V3Section id="capitais" title={t("br.hub.caps_h")} sub={t("br.hub.caps_sub")}>
              {caps.map((c) => (
                <V3Row key={c.slug} href={`/brasil/${c.slug}`} label={`${c.nome} (${c.uf})`} subText={c.pop ? fill(t("br.mun.peers_hab"), { pop: int.format(c.pop), y: c.ano }) : String(c.ano)} amount={c.hab ? <span className="fx-v3-amt tnum" style={{ fontSize: 14 }}>{fmtBrl(Math.round(c.hab))}<span className="u">{t("br.mun.per_hab")}</span></span> : undefined} />
              ))}
            </V3Section>
          </div>

          <div className="fx-sec-a-understand">
            <V3Section id="understand" title={t("fx.sec.understand")}>
              <V3Fold id="what" label={t("br.hub.u.what")}><p className="fx-v3-sentence">{t("br.hub.u.what_body")}</p></V3Fold>
              <V3Fold id="fonte" label={t("br.recife.bud3.u.fonte")}><p className="fx-v3-sentence">{t("br.hub.u.fonte_body")}</p></V3Fold>
            </V3Section>
          </div>

          <div className="fx-sec-a-related">
            <V3Section id="related" title={t("fx.sec.see_also")}>
              <V3Row href="/france/paris" label="Paris" subText={t("br.hub.r.paris")} />
              <V3Row href="/usa/san-francisco" label="San Francisco" subText={t("br.hub.r.sf")} />
              <V3Row href="/pour-les-villes" label={t("br.hub.r.cities")} subText={t("br.hub.r.cities_sub")} />
            </V3Section>
          </div>

          <div className="fx-sec-a-next">
            <NextDoor href="/brasil/recife" kicker={t("fx.pv.next.kicker")} title={t("br.mun.next_title")} sub={t("br.mun.next_sub")} />
          </div>

          <div className="fx-sec-a-foot">
            <V3Foot>{t("br.hub.foot")}</V3Foot>
          </div>
        </div>
      </div>
      <Link href="/brasil/recife" hidden aria-hidden="true">Recife</Link>
    </main>
  );
}
