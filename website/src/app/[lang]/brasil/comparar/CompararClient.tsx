"use client";

import Link from "@/components/LocalizedLink";
import MunicipioSearch from "@/components/br/MunicipioSearch";
import { V3Fold, V3Foot, V3Section } from "@/components/fiche/v3";
import { useLocale, useT } from "@/lib/localeContext";
import { fill, fmtBrl, titleCasePt } from "@/lib/br/format";

/**
 * Two municípios side by side, per resident (2026-09-18) : the spending
 * paid, the net revenue, then every government function either declared,
 * in the latest year both declared to the National Treasury. The bars share
 * one scale per line ; a function absent on one side reads as « — », never
 * as a zero. The field under the table swaps the second município.
 */

export type CmpSide = {
  slug: string;
  nome: string;
  uf: string;
  pop: number;
  popAno: number;
  pago: number;
  receita: number | null;
  funcoes: { funcao: string; pago: number }[];
};
export type CmpData = { a: CmpSide; b: CmpSide; year: number };

const CITY = "/brasil";

export default function CompararClient({ d, pickOnly = false, pickFirst = false }: { d: CmpData; /** The second município is not chosen yet : the page is the field. */ pickOnly?: boolean; /** No município at all : the page is the first field (2026-09-18, l'adresse nue répondait 404). */ pickFirst?: boolean }) {
  const t = useT();
  const { locale } = useLocale();
  if (pickFirst) {
    return (
      <main id="main-content" tabIndex={-1}>
        <div className="fx-sec fx-v3">
          <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={CITY}>{t("br.mun.kicker_root")}</Link> › {t("br.cmp.kicker")}</div>
          <div className="fx-sec-grid" data-layout="dette-lite">
            <div className="fx-sec-a-hero">
              <header className="fx-sec-hero" data-section="hero">
                <h1>{t("br.cmp.pick_a")}</h1>
                <p className="fx-sec-cap">{t("br.cmp.pick_a_sub")}</p>
              </header>
              <div className="fx-sec-lieux-search">
                <MunicipioSearch placeholder={t("br.mun.compare_ph")} label={t("br.mun.compare_h")} hrefFor={(slug) => `${CITY}/comparar?a=${slug}`} />
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const int = new Intl.NumberFormat(locale === "en" ? "en-US" : "pt-BR", { maximumFractionDigits: 0 });
  const perHab = (v: number | null, side: CmpSide) => (v == null || !side.pop ? null : v / side.pop);
  const names = new Map<string, string>();
  for (const f of [...d.a.funcoes, ...d.b.funcoes]) names.set(f.funcao, titleCasePt(f.funcao));
  const fa = new Map(d.a.funcoes.map((f) => [f.funcao, f.pago]));
  const fb = new Map(d.b.funcoes.map((f) => [f.funcao, f.pago]));
  // Every function either side declared, ordered by the larger per-resident amount.
  const lines = [...names.keys()]
    .map((k) => ({ key: k, label: names.get(k) ?? k, a: perHab(fa.get(k) ?? null, d.a), b: perHab(fb.get(k) ?? null, d.b) }))
    .filter((l) => (l.a ?? 0) > 0 || (l.b ?? 0) > 0)
    .sort((x, y) => Math.max(y.a ?? 0, y.b ?? 0) - Math.max(x.a ?? 0, x.b ?? 0));
  const head = [
    { key: "total", label: t("br.cmp.total"), a: perHab(d.a.pago, d.a), b: perHab(d.b.pago, d.b), strong: true },
    ...(d.a.receita != null || d.b.receita != null ? [{ key: "rec", label: t("br.cmp.rec"), a: perHab(d.a.receita, d.a), b: perHab(d.b.receita, d.b), strong: true }] : []),
  ];
  const Row = ({ label, a, b, strong }: { label: string; a: number | null; b: number | null; strong?: boolean }) => {
    const m = Math.max(a ?? 0, b ?? 0, 1);
    const cell = (v: number | null) => (
      <span className="fx-cmp-cell">
        <i className="bar" style={{ width: `${v == null ? 0 : Math.max(2, Math.round((v / m) * 100))}%` }} aria-hidden="true" />
        <span className="fx-v3-amt tnum">{v == null ? "—" : fmtBrl(Math.round(v))}</span>
      </span>
    );
    return (
      <div className={`fx-cmp-row${strong ? " fx-cmp-row--strong" : ""}`}>
        <span className="n">{label}</span>
        {cell(a)}
        {cell(b)}
      </div>
    );
  };
  const side = (s: CmpSide) => (
    <span className="fx-cmp-head">
      <Link href={`${CITY}/${s.slug}`}>{s.nome} ({s.uf})</Link>
      <small>{fill(t("br.cmp.pop"), { n: int.format(s.pop), y: s.popAno })}</small>
    </span>
  );

  if (pickOnly) {
    return (
      <main id="main-content" tabIndex={-1}>
        <div className="fx-sec fx-v3">
          <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={CITY}>{t("br.mun.kicker_root")}</Link> › <Link href={`${CITY}/${d.a.slug}`}>{d.a.nome}</Link> › {t("br.cmp.kicker")}</div>
          <div className="fx-sec-grid" data-layout="dette-lite">
            <div className="fx-sec-a-hero">
              <header className="fx-sec-hero" data-section="hero">
                <h1>{t("br.cmp.pick_b")}</h1>
                <p className="fx-sec-cap">{fill(t("br.cmp.pick_b_sub"), { a: d.a.nome })}</p>
              </header>
              <div className="fx-sec-lieux-search">
                <MunicipioSearch placeholder={t("br.mun.compare_ph")} label={t("br.mun.compare_h")} hrefFor={(slug) => `${CITY}/comparar?a=${d.a.slug}&b=${slug}`} />
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }
  return (
    <main id="main-content" tabIndex={-1}>
      <div className="fx-sec fx-v3">
        <div className="fx-sec-kicker fx-page-kicker fx-page-kicker--links"><Link href={CITY}>{t("br.mun.kicker_root")}</Link> › {t("br.cmp.kicker")}</div>
        <div className="fx-sec-grid" data-layout="dette-lite">
          <div className="fx-sec-a-hero">
            <header className="fx-sec-hero" data-section="hero">
              <h1>{fill(t("br.cmp.title"), { a: d.a.nome, b: d.b.nome })}</h1>
              <p className="fx-sec-cap">{fill(t("br.cmp.sub"), { y: d.year })}</p>
            </header>
          </div>
          <div className="fx-sec-a-related">
            <V3Section id="pick" title={fill(t("br.cmp.change_b"), { a: d.a.nome })}>
              <div className="fx-sec-lieux-search">
                <MunicipioSearch placeholder={t("br.mun.compare_ph")} label={t("br.mun.compare_h")} hrefFor={(slug) => `${CITY}/comparar?a=${d.a.slug}&b=${slug}`} />
              </div>
              <p className="fx-v3-note"><Link href={`${CITY}/comparar?a=${d.b.slug}&b=${d.a.slug}`}>{fill(t("br.cmp.change_a"), { a: d.a.nome })} ›</Link></p>
            </V3Section>
          </div>
          <div className="fx-sec-a-understand" style={{ gridColumn: "1 / -1" }}>
            <V3Section id="rows" title={fill(t("br.cmp.h.rows"), { y: d.year })}>
              <div className="fx-cmp">
                <div className="fx-cmp-row fx-cmp-row--head">
                  <span className="n" />
                  {side(d.a)}
                  {side(d.b)}
                </div>
                {head.map((h) => <Row key={h.key} label={h.label} a={h.a} b={h.b} strong={h.strong} />)}
                {lines.map((l) => <Row key={l.key} label={l.label} a={l.a} b={l.b} />)}
              </div>
            </V3Section>
            <V3Section id="understand" title={t("fx.sec.understand")}>
              <V3Fold id="how" label={t("br.cmp.u.how")}><p className="fx-v3-sentence">{t("br.cmp.u.how_body")}</p></V3Fold>
            </V3Section>
          </div>
          <div className="fx-sec-a-foot">
            <V3Foot>{fill(t("br.cmp.foot"), { y: d.year })}</V3Foot>
          </div>
        </div>
      </div>
    </main>
  );
}
