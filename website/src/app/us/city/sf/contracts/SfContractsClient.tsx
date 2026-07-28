"use client";

import { useState } from "react";
import SectionHead from "@/components/fusion/SectionHead";
import PageTOC from "@/components/fusion/PageTOC";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import AnimatedNumber from "@/components/fusion/AnimatedNumber";
import SfMoneyBar from "@/components/us/SfMoneyBar";
import Tip from "@/components/fusion/Tip";
import { useT } from "@/lib/localeContext";
import { fmtUsdCompact } from "@/lib/us/format";
import SfContractsSearch from "./SfContractsSearch";
import ChartSource from "@/components/fusion/ChartSource";
import SfSourceFooter from "@/components/us/SfSourceFooter";
import { deptSlug } from "@/lib/us/sf-budget-slugs";
import { FAMILY_LABELS, contractLabel, deptDisplayName, typeLabel, typeSlug } from "./us-sf-contracts-types";
import type { SfContractsActive, SfContractsOverview } from "./us-sf-contracts-types";
import type { SfDeptBar, SfPrimesData } from "./data";

/**
 * /us/city/sf/contracts — EN-only (ADR-0010 D3): every string goes through
 * `us.sf.contracts.*` keys whose EN and FR values are identical English.
 * Every number comes from the exports or from a server-side sum over their
 * rows (see data.ts); the only client arithmetic is shares already present
 * in the files.
 *
 * TWO sections, down from six: the money (one bar, five lenses) and the
 * search. The page used to be organised around register mechanics — types,
 * authorities, flags, perimeters — as six stacked lists of 10-12 rows, and
 * compensated for unreadable rows with free-floating explanatory boxes.
 *   · "who it buys from" and "which departments sign" were two sections
 *     reading the same $43.4B; they are one section with a toggle.
 *   · sole-source was its own headline section opening on a near-flat line
 *     (2.7 %→6.5 % across thirteen years, promising a trend the data has not
 *     got). It survives as the "by how it was awarded" lens, alongside the
 *     register's own authority families — where a lawful waiver path reads as
 *     one route among several rather than as an accusation.
 *   · the "$4.4B paid past agreed" material is gone rather than demoted. The
 *     register's payments column runs a median 3.1x above the City's own
 *     voucher ledger on multi-phase contracts and the cause is undetermined,
 *     so the figure could not carry a section.
 *
 * KNOWN GAP: with those cuts the page states nothing. It is a good instrument
 * — every slice opens a fiche — but it has no scene and no claim, and four of
 * the five cuts sit behind a click nobody is obliged to make. The lens buttons
 * are also untracked, so we cannot yet tell whether they are used.
 */

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

const nfInt = new Intl.NumberFormat("en-US");

export default function SfContractsClient({
  overview,
  active,
  primes,
  deptBars,
}: {
  overview: SfContractsOverview;
  active: SfContractsActive;
  primes: SfPrimesData;
  deptBars: SfDeptBar[];
}) {
  const t = useT();
  const hero = overview.hero;
  const dq = overview.data_quality;



  // One graphic, three readings. The page used to render these as three
  // separate lists of 10-12 rows each; a 100% stacked bar answers "where does
  // it go" at a glance and each slice opens the fiche for that slice, which is
  // what Paris (StackedBarTheme on marchés categories) and Recife (temas) do.
  const [lens, setLens] = useState<"type" | "supplier" | "dept" | "contract" | "authority">("type");


  // Slices are sums over the exported active rows — the same arithmetic the
  // BarRow lists did, rendered as one bar instead of three lists.
  const activeAgreed = primes.active_agreed_usd;
  const typeSlices = (() => {
    const by = new Map<string, { amount: number; count: number }>();
    for (const r of active.rows) {
      if (!r.contract_type) continue;
      const cur = by.get(r.contract_type) ?? { amount: 0, count: 0 };
      cur.amount += r.agreed_usd;
      cur.count += 1;
      by.set(r.contract_type, cur);
    }
    return [...by.entries()].map(([k, v]) => ({ theme: typeLabel(k), raw: k, ...v }));
  })();
  const deptSlices = deptBars.map((d) => ({
    theme: deptDisplayName(d.name),
    raw: d.code,
    amount: d.agreed_usd,
    count: d.n_contracts,
  }));
  // "By contract" — the biggest individual commitments. This replaces the
  // separate "largest sole-source contracts" list: one breakdown at the top
  // answers "which contracts are the big ones", and the sole-source ones are
  // reachable through the search filter rather than their own section.
  const contractSlices = (() => {
    const top = [...active.rows].sort((a, b) => b.agreed_usd - a.agreed_usd).slice(0, 8);
    // Two different contracts can share a plain-English title (both McKesson
    // pharmaceutical agreements read "Pharmaceuticals purchasing"), so add the
    // supplier where a title repeats — otherwise the reader sees the same row
    // twice with no way to tell them apart.
    const seen = new Map<string, number>();
    for (const r of top) {
      const l = contractLabel(r);
      seen.set(l, (seen.get(l) ?? 0) + 1);
    }
    return top.map((r) => {
      const base = contractLabel(r);
      const dup = (seen.get(base) ?? 0) > 1 && r.prime;
      return {
        theme: dup ? `${base} — ${r.prime}` : base,
        raw: r.contract_no,
        amount: r.agreed_usd,
        count: 1,
      };
    });
  })();

  const supplierSlices = primes.rows.map((p) => ({
    theme: p.name,
    raw: p.name,
    amount: p.agreed_usd,
    count: p.n_contracts,
  }));

  // "How it was awarded" — a lens, not the section it used to be. That section
  // read the register-wide aggregate ($93.1B over 31,860 contracts, 26,362 of
  // them expired) directly under a breakdown of ACTIVE contracts ($43.4B over
  // 5,128), with nothing on screen saying the population had changed.
  //
  // So it is recomputed here from the active rows rather than reusing
  // overview.authority_families: a toggle whose total jumps from $43B to $93B
  // is telling the reader two different things while looking like one.
  // `authority_family` is on every active row, so this is the same arithmetic
  // as typeSlices and deptSlices, over the same denominator.
  const authoritySlices = (() => {
    const by = new Map<string, { amount: number; count: number }>();
    for (const r of active.rows) {
      const fam = r.authority_family;
      if (!fam) continue;
      const cur = by.get(fam) ?? { amount: 0, count: 0 };
      cur.amount += r.agreed_usd;
      cur.count += 1;
      by.set(fam, cur);
    }
    return [...by.entries()].map(([fam, v]) => ({
      theme: FAMILY_LABELS[fam] ?? fam,
      raw: fam,
      ...v,
    }));
  })();

  // StackedBarTheme draws at most 8 segments but legends up to 12, and folds
  // whatever it was not given into "Other" using `total`. Handing it exactly 8
  // keeps the bar's Other and the legend's Other the same number — otherwise
  // the same bucket reads 75% on the bar and 69% in the legend.
  const BAR_SLICES = 8;
  const cap = <T extends { amount: number }>(list: T[]) =>
    [...list].sort((a, b) => b.amount - a.amount).slice(0, BAR_SLICES);

  // theme label -> destination fiche. Returns null for the "others" bucket and
  // anything without a fiche, which StackedBarTheme renders un-clickable.
  const typeHref = new Map(typeSlices.map((s2) => [s2.theme, `/us/city/sf/contracts/type/${typeSlug(s2.raw)}`]));
  const deptHref = new Map(deptSlices.map((s2) => [s2.theme, `/us/city/sf/contracts/dept/${deptSlug(s2.raw)}`]));
  const contractHref = new Map(
    contractSlices.map((c) => [c.theme, `/us/city/sf/contracts/contract/${c.raw}`]),
  );
  const supplierHref = new Map(
    primes.rows.map((p) => [
      p.name,
      p.payee_slug
        ? `/us/city/sf/who-gets-paid/payee/${p.payee_slug}`
        : `/us/city/sf/contracts/contract/${p.top_contract_no}`,
    ]),
  );

  const authorityHref = new Map(
    authoritySlices.map((s2) => [s2.theme, `/us/city/sf/contracts/authority/${s2.raw}`]),
  );

  const lensConfig = {
    type: { slices: typeSlices, hrefs: typeHref, kicker: "money.kicker.type", other: "money.other.type" },
    supplier: { slices: supplierSlices, hrefs: supplierHref, kicker: "money.kicker.supplier", other: "money.other.supplier" },
    dept: { slices: deptSlices, hrefs: deptHref, kicker: "money.kicker.dept", other: "money.other.dept" },
    contract: { slices: contractSlices, hrefs: contractHref, kicker: "money.kicker.contract", other: "money.other.contract" },
    authority: { slices: authoritySlices, hrefs: authorityHref, kicker: "how.auth.kicker", other: "how.auth.other" },
  }[lens];

  return (
    <div>
      <main id="main-content" tabIndex={-1}>
        <PageTOC
          items={[
            { id: "sec-money", label: t("us.sf.contracts.toc.what") },
            { id: "sec-search", label: t("us.sf.contracts.toc.search") },
          ]}
        />

        <PageIntro
          title={
            <>
              {t("us.sf.contracts.title.before")}
              <em>{t("us.sf.contracts.title.em")}</em>
            </>
          }
          lede={fill(t("us.sf.contracts.lede"), {
            n: nfInt.format(hero.register.n_contracts),
            nActive: nfInt.format(hero.active.n_contracts),
          })}
          stats={
            <>
              <IntroStat
                value={<AnimatedNumber value={hero.active.agreed_usd} format={(n) => fmtUsdCompact(n)} />}
                label={t("us.sf.contracts.s01.hero_label")}
              />
              <IntroStat
                value={<AnimatedNumber value={hero.active.paid_usd} format={(n) => fmtUsdCompact(n)} />}
                label={t("us.sf.contracts.s01.kpi.paid")}
              />
              <IntroStat
                value={<AnimatedNumber value={primes.n_primes} format={(n) => nfInt.format(Math.round(n))} />}
                label={
                  <Tip label={t("us.sf.contracts.s01.kpi.suppliers.tip")}>
                    {t("us.sf.contracts.s01.kpi.suppliers")}
                  </Tip>
                }
              />
              <IntroStat
                value={<AnimatedNumber value={hero.register.n_contracts} format={(n) => nfInt.format(Math.round(n))} />}
                label={
                  <Tip label={t("us.sf.contracts.s01.kpi.register.tip")}>
                    {t("us.sf.contracts.s01.kpi.register")}
                  </Tip>
                }
              />
            </>
          }
        >
          <ChartSource
            source={overview.source.name}
            dataHref={overview.source.source_url}
            methodHref="/us/city/sf/sources#sec-contracts"
          />
        </PageIntro>

        {/* ── Where the money goes: one stacked bar, three lenses ──
          *  Replaces three sections of 10-12 ranked rows each (suppliers,
          *  contract types, departments). Same arithmetic, but the shape of
          *  the portfolio is legible at a glance and every slice opens the
          *  fiche for that slice — the Paris StackedBarTheme / Recife temas
          *  pattern, which is what makes those pages navigable rather than
          *  something to read top to bottom. ── */}
        <section className="fx-section" id="sec-money">
          <div className="fx-wrap">
            <SectionHead
              title={
                <>
                  {t("us.sf.contracts.money.title.before")}
                  <em>{t("us.sf.contracts.money.title.em")}</em>
                </>
              }
              subtitle={fill(t("us.sf.contracts.money.sub"), {
                agreed: fmtUsdCompact(activeAgreed),
                n: nfInt.format(hero.active.n_contracts),
              })}
            />
            <div className="fx-lensbar" role="group" aria-label="Breakdown lens">
              {([
                ["type", t("us.sf.contracts.money.by.type")],
                ["dept", t("us.sf.contracts.money.by.dept")],
                ["supplier", t("us.sf.contracts.money.by.supplier")],
                ["contract", t("us.sf.contracts.money.by.contract")],
                ["authority", "By how it was awarded"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLens(key)}
                  aria-pressed={lens === key}
                >
                  {label}
                </button>
              ))}
            </div>

            <SfMoneyBar
              key={lens}
              slices={cap(lensConfig.slices).map((sl) => ({
                id: sl.raw,
                label: sl.theme,
                amount: sl.amount,
                count: sl.count,
                href: lensConfig.hrefs.get(sl.theme) ?? null,
              }))}
              total={activeAgreed}
              kicker={t(`us.sf.contracts.${lensConfig.kicker}`)}
              otherLabel={t(`us.sf.contracts.${lensConfig.other}`)}
            />

            <ChartSource
              source={overview.source.name}
              dataHref={overview.source.source_url}
              methodHref="/us/city/sf/sources#sec-contracts"
            />
          </div>
        </section>

        {/* ── Search ── */}
        <section className="fx-section" id="sec-search">
          <div className="fx-wrap">
            <SectionHead
              title={
                <>
                  {t("us.sf.contracts.s05.title.before")}
                  <em>{t("us.sf.contracts.s05.title.em")}</em>
                </>
              }
              subtitle={fill(t("us.sf.contracts.s05.sub"), { n: nfInt.format(active.n_rows) })}
            />
            <SfContractsSearch rows={active.rows} />
            <p className="fx-note" style={{ marginTop: 16 }}>
              {fill(t("us.sf.contracts.s05.note"), {
                // dq.n_paid_exceeds_agreed counts the whole register; the table
                // above it shows only active contracts. Both numbers, labelled.
                n: nfInt.format(dq.n_paid_exceeds_agreed),
                nActive: nfInt.format(active.rows.filter((r) => r.paid_exceeds_agreed).length),
                // Only these few can be read as a real gap; on the rest the
                // register fails its own agreed = paid + remaining identity.
                nRecon: nfInt.format(
                  active.rows.filter(
                    (r) => r.paid_exceeds_agreed && r.src_arithmetic_consistent === true,
                  ).length,
                ),
              })}
            </p>
            <ChartSource
              source={overview.source.name}
              dataHref={overview.source.source_url}
              methodHref="/us/city/sf/sources#sec-contracts"
            />
          </div>
        </section>

        <SfSourceFooter
          perimeter={overview.perimeter}
          coverage={fill(t("us.sf.contracts.footer.coverage"), {
            n: nfInt.format(dq.n_paid_exceeds_agreed),
            // Say plainly how far the generated text reaches. It is partial and
            // the reader should know that without having to notice it.
            nGen: nfInt.format(active.rows.filter((r) => r.title_clear).length),
          })}
          source={{ name: overview.source.name, href: overview.source.source_url }}
          sourcesAnchor="sec-contracts"
          exports={[
            { label: "contracts_overview.json", href: "/data/us/sf/contracts_overview.json" },
            { label: "contracts_active.json", href: "/data/us/sf/contracts_active.json" },
          ]}
        />
      </main>
    </div>
  );
}
