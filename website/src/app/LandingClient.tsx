"use client";

import Link from "next/link";
// Direct imports — the barrel pulls in server-only components (ProjetThumb,
// ProjetFiche) that fail to bundle for the client (they read node:fs via
// fusion-data).
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Button from "@/components/fusion/Button";
import ScopeDropdown from "@/components/fusion/ScopeDropdown";
import BarRow from "@/components/fusion/BarRow";
import TileCard from "@/components/fusion/TileCard";
import BrandMark from "@/components/fusion/BrandMark";
import HeroBg from "@/components/fusion/HeroBg";
import { fmtDec, fmtInt, fmtBillions } from "@/lib/fmt";
import type { LandingStats } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { trLabel } from "@/lib/label-translate";

type Props = { stats: LandingStats };

export default function LandingClient({ stats }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const deltaPct = stats.deltaVsLastExecutedPct;
  const direction: "up" | "down" | "flat" =
    deltaPct > 0.1 ? "up" : deltaPct < -0.1 ? "down" : "flat";
  const arrow = direction === "down" ? "↓" : direction === "flat" ? "→" : "↑";
  const deltaEurPerMonthAbs = Math.abs(stats.deltaVsLastExecutedPerMonth);

  const fill = (key: string, vars: Record<string, string | number>) => {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };

  return (
    <div className="theme-fusion">
      <Navbar />

      {/* HERO */}
      <section className="fx-hero" id="hero">
        <HeroBg />
        <div className="fx-wrap">
          <h1>
            {t("fx.land.h1.before")}<em>{t("fx.land.h1.em")}</em>
            <br />{t("fx.land.h1.mid")}
            <ScopeDropdown variant="h1" />
            {t("fx.land.h1.after")}
          </h1>
          <p className="fx-lede">{t("fx.land.lede")}</p>
          <div className="fx-ctas">
            <Button variant="primary" href="/budget">
              {fill("fx.land.cta.explore", { year: stats.year })}
            </Button>
          </div>
        </div>
      </section>

      {/* SCALE */}
      <section className="fx-scale" id="scale">
        <div className="fx-wrap">
          <p className="fx-hero-num-line">{t("fx.land.scale.line")}</p>
          <p className="fx-hero-num-big tnum">
            {fmtInt(stats.perCapitaMonth)}
            <span className="fx-hero-num-u">€</span>
            <span className="fx-hero-num-per">{t("fx.land.scale.per_inhabitant")}</span>
          </p>
          <p className="fx-hero-num-delta">
            <span className={`fx-hero-num-arrow fx-hero-num-arrow-${direction}`}>
              {arrow} {fmtDec(Math.abs(deltaPct), 1)} %
            </span>
            <span className="fx-hero-num-sep">·</span>
            <span className="fx-hero-num-base">
              {direction === "down" ? "−" : "+"} {fmtInt(deltaEurPerMonthAbs)} €
            </span>
            <span>{fill("fx.land.scale.vs_fiscal", { year: stats.lastExecutedYear })}</span>
          </p>
          <p className="fx-hero-num-cap">
            {t("fx.land.scale.cap.soit")}
            <b>{fill("fx.land.scale.cap.per_year", { amount: fmtInt(stats.perCapitaYear) })}</b>
            {fill("fx.land.scale.cap.budget", { year: stats.year })}
            <b>{t("fx.land.scale.cap.pop")}</b>
            {t("fx.land.scale.cap.suffix")}
          </p>

          <BarRow
            header={{
              left: (
                <>
                  {t("fx.land.scale.bar.left_before")}
                  <b>{t("fx.land.scale.bar.left_em")}</b>
                </>
              ),
              right: (
                <>
                  {t("fx.land.scale.bar.right_label")}
                  <b>{fmtInt(stats.perCapitaMonth)} €</b>
                </>
              ),
            }}
            items={stats.breakdown.map((b) => ({
              label: b.label === "Autres (D)" ? t("fx.land.scale.autres") : trLabel(b.label, locale),
              value: b.perMonth,
              unit: "€",
              display: fmtInt(b.perMonth),
              href: `/budget?year=${stats.year}#sec-flux`,
            }))}
          />
        </div>
      </section>

      {/* INSIDE — tiles */}
      <section className="fx-inside" id="inside">
        <div className="fx-wrap">
          <h2>
            {t("fx.land.inside.h2.a")}
            <br />
            {t("fx.land.inside.h2.b.des")}<em>{t("fx.land.inside.h2.b.em")}</em>{t("fx.land.inside.h2.b.dot")}
          </h2>
          <p className="fx-sub">{t("fx.land.inside.sub")}</p>

          <div className="fx-grid-tiles">
            <TileCard
              href="/budget"
              kind={t("fx.land.tile.01.kind")}
              title={t("fx.land.tile.01.title")}
              description={t("fx.land.tile.01.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <path d="M 6 22 C 70 22 90 46 94 46" className="stroke" stroke="#0a0a0a" strokeWidth="10" fill="none" />
                  <path d="M 6 46 C 70 46 90 50 94 50" className="stroke" stroke="#0a0a0a" strokeWidth="7" fill="none" />
                  <path d="M 6 70 C 70 70 90 54 94 54" className="stroke" stroke="#0a0a0a" strokeWidth="5" fill="none" />
                  <rect x="92" y="36" width="16" height="28" className="fill" fill="#0a0a0a" />
                  <path d="M 108 44 C 140 44 160 26 194 26" className="stroke" stroke="#0a0a0a" strokeWidth="9" fill="none" />
                  <path d="M 108 50 C 140 50 160 52 194 52" className="stroke" stroke="#0a0a0a" strokeWidth="6" fill="none" />
                  <path d="M 108 58 C 140 58 160 82 194 82" className="stroke-sig" stroke="#5f6672" strokeWidth="7" fill="none" />
                </svg>
              }
              kpi={fmtBillions(stats.totalDepenses)}
              kpiUnit="Md €"
              kpiDelta={
                <>
                  {arrow} <b>{fmtDec(Math.abs(deltaPct), 1)} %</b> {t("fx.land.tile.vs")}{stats.lastExecutedYear}
                </>
              }
            />

            <TileCard
              href="/investissements"
              kind={t("fx.land.tile.03.kind")}
              title={t("fx.land.tile.03.title")}
              description={t("fx.land.tile.03.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <path d="M 28 30 Q 36 14 70 12 Q 110 10 140 18 Q 172 26 184 48 Q 188 72 168 86 Q 130 94 90 92 Q 50 90 28 72 Q 18 52 28 30 Z" className="stroke" fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
                  <path d="M 22 58 Q 60 50 90 60 Q 120 70 160 58 Q 180 52 190 48" className="stroke" stroke="#0a0a0a" strokeWidth="2" fill="none" opacity=".55" />
                  {[[60,34],[86,42],[110,30],[140,36],[72,70],[104,78],[132,72],[158,68]].map(([x,y]) => (
                    <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" className="fill" fill="#0a0a0a" />
                  ))}
                  <circle cx="118" cy="54" r="4" className="fill-sig" fill="#5f6672" />
                </svg>
              }
              kpi="2,6"
              kpiUnit="Md €"
              kpiDelta={<>↑ <b>8,4 %</b> {t("fx.land.tile.vs")}{stats.lastExecutedYear}</>}
            />

            <TileCard
              href="/qui-recoit"
              kind={t("fx.land.tile.04.kind")}
              title={t("fx.land.tile.04.title")}
              description={t("fx.land.tile.04.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  {[14, 28, 42, 56, 70, 84].map((y, i) => (
                    <g key={y}>
                      <rect x="10" y={y - 1} width="4" height="4" className="fill-muted" fill="#9099a6" />
                      <rect x="20" y={y - 1} width={90 - i * 12} height="6" className="fill" fill="#0a0a0a" />
                      <rect x="160" y={y - 1} width="30" height="6" className="fill-muted" fill="#9099a6" />
                    </g>
                  ))}
                </svg>
              }
              kpi="312"
              kpiUnit="M €"
              kpiDelta={<>↑ <b>3,3 %</b> {t("fx.land.tile.vs")}2023</>}
            />

            <TileCard
              href="/budget"
              kind={t("fx.land.tile.02.kind")}
              title={t("fx.land.tile.02.title")}
              description={t("fx.land.tile.02.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <line x1="10" y1="85" x2="190" y2="85" className="stroke-muted" stroke="#9099a6" strokeWidth="1" />
                  <polyline points="10,70 40,62 70,55 100,46 130,34 160,24 190,14" className="stroke" stroke="#0a0a0a" strokeWidth="2.5" fill="none" />
                  {[[10,70],[40,62],[70,55],[100,46],[130,34],[160,24]].map(([x,y]) => (
                    <circle key={`${x}-${y}`} cx={x} cy={y} r="3" className="fill" fill="#0a0a0a" />
                  ))}
                  <circle cx="190" cy="14" r="5" className="fill-sig" fill="#5f6672" />
                </svg>
              }
              kpi="+ 14,2"
              kpiUnit="%"
              kpiDelta={<>{t("fx.land.tile.02.delta.before")}<b>{t("fx.land.tile.02.delta.em")}</b></>}
            />

            <TileCard
              href="/dette-patrimoine"
              kind={t("fx.land.tile.05.kind")}
              title={t("fx.land.tile.05.title")}
              description={t("fx.land.tile.05.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <text x="62" y="98" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" className="fill-muted" fill="#9099a6" letterSpacing="1">ACTIF</text>
                  <text x="138" y="98" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" className="fill-muted" fill="#9099a6" letterSpacing="1">PASSIF</text>
                  <rect x="32" y="6"  width="60" height="40" className="fill" fill="#0a0a0a" />
                  <rect x="32" y="48" width="60" height="24" className="fill" fill="#0a0a0a" opacity=".75" />
                  <rect x="32" y="74" width="60" height="12" className="fill" fill="#0a0a0a" opacity=".5" />
                  <rect x="108" y="6"  width="60" height="46" className="fill" fill="#0a0a0a" />
                  <rect x="108" y="54" width="60" height="32" className="fill-sig" fill="#5f6672" />
                </svg>
              }
              kpi="26"
              kpiUnit="Md €"
              kpiDelta={
                <>
                  {t("fx.land.tile.05.delta.before")}
                  <b>{t("fx.land.tile.05.delta.em")}</b>
                  {t("fx.land.tile.05.delta.after")}
                </>
              }
            />

            <TileCard
              href="/budget"
              kind={t("fx.land.tile.06.kind")}
              title={t("fx.land.tile.06.title")}
              description={t("fx.land.tile.06.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <line x1="6" y1="90" x2="194" y2="90" className="stroke-muted" stroke="#9099a6" strokeWidth="1" />
                  <rect x="18"  y="22" width="14" height="68" className="stroke" fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
                  <rect x="34"  y="34" width="14" height="56" className="fill" fill="#0a0a0a" />
                  <rect x="58"  y="38" width="14" height="52" className="stroke" fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
                  <rect x="74"  y="44" width="14" height="46" className="fill" fill="#0a0a0a" />
                  <rect x="98"  y="48" width="14" height="42" className="stroke" fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
                  <rect x="114" y="30" width="14" height="60" className="fill-sig" fill="#5f6672" />
                  <rect x="138" y="26" width="14" height="64" className="stroke" fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
                  <rect x="154" y="36" width="14" height="54" className="fill" fill="#0a0a0a" />
                </svg>
              }
              kpi="± 3,8"
              kpiUnit="%"
              kpiDelta={<>{t("fx.land.tile.06.delta.before")}<b>{t("fx.land.tile.06.delta.em")}</b></>}
            />

            <TileCard
              href="/dette-patrimoine/stress-test"
              kind={t("fx.land.tile.stress.kind")}
              title={t("fx.land.tile.stress.title")}
              description={t("fx.land.tile.stress.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <line x1="10" y1="80" x2="190" y2="80" stroke="#9099a6" strokeWidth="1" />
                  <line x1="10" y1="80" x2="190" y2="80" stroke="#0a0a0a" strokeWidth="2" strokeDasharray="1" strokeDashoffset="0" />
                  <rect x="10" y="70" width="95" height="12" fill="#0a0a0a" opacity="0.15" />
                  <rect x="105" y="70" width="85" height="12" fill="#e11d1d" opacity="0.22" />
                  <line x1="108" y1="62" x2="108" y2="90" stroke="#a67638" strokeWidth="2" />
                  <line x1="60" y1="58" x2="60" y2="94" stroke="#0a0a0a" strokeWidth="3" />
                  <circle cx="60" cy="52" r="4" fill="#0a0a0a" />
                  <text x="60" y="42" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#0a0a0a" fontWeight="700">10,8</text>
                  <text x="108" y="42" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" fill="#a67638">seuil 12</text>
                </svg>
              }
              kpi="10,8"
              kpiUnit="ans"
              kpiDelta={<>{t("fx.land.tile.stress.delta")}</>}
            />

            <TileCard
              href="/logement-social"
              kind={t("fx.land.tile.07.kind")}
              title={t("fx.land.tile.07.title")}
              description={t("fx.land.tile.07.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <line x1="10" y1="90" x2="190" y2="90" className="stroke-muted" stroke="#9099a6" strokeWidth="1" />
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => {
                    const x = 14 + i * 14;
                    const isYou = i === 8;
                    return (
                      <rect
                        key={i}
                        x={x}
                        y={isYou ? 40 : 56}
                        width="10"
                        height={isYou ? 48 : 32}
                        className={isYou ? "fill-sig" : "fill"}
                        fill={isYou ? "#a67638" : "#0a0a0a"}
                        opacity={isYou ? 1 : 0.85 - i * 0.05}
                      />
                    );
                  })}
                  <text x="126" y="32" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill="#a67638" fontWeight="700">vous</text>
                </svg>
              }
              kpi="4,2"
              kpiUnit="ans"
              kpiDelta={<>{t("fx.land.tile.07.delta")}</>}
            />

            <TileCard
              href="/marches-publics"
              kind={t("fx.land.tile.08.kind")}
              title={t("fx.land.tile.08.title")}
              description={t("fx.land.tile.08.desc")}
              preview={
                <svg viewBox="0 0 200 100">
                  <line x1="10" y1="88" x2="190" y2="88" className="stroke-muted" stroke="#9099a6" strokeWidth="1" />
                  {[62, 52, 44, 38, 34, 30, 27, 24, 21, 19, 17, 15, 13, 12, 11].map((h, i) => {
                    const x = 12 + i * 12;
                    const isTop = i === 0;
                    return (
                      <rect
                        key={i}
                        x={x}
                        y={88 - h}
                        width="9"
                        height={h}
                        className={isTop ? "fill-sig" : "fill"}
                        fill={isTop ? "#5f6672" : "#0a0a0a"}
                      />
                    );
                  })}
                </svg>
              }
              kpi="2,5"
              kpiUnit="Md €"
              kpiDelta={
                <>
                  {t("fx.land.tile.08.delta.before")}
                  <b>{t("fx.land.tile.08.delta.em")}</b>
                </>
              }
            />
          </div>

          <div className="fx-grid-foot">
            <Link href="/budget">{t("fx.land.inside.see_all")}</Link>
          </div>
        </div>
      </section>

      {/* MÉTHODE */}
      <section className="fx-meth" id="meth">
        <div className="fx-wrap">
          <h2>
            {t("fx.land.meth.h2.before")}<em>{t("fx.land.meth.h2.em")}</em>{t("fx.land.meth.h2.dot")}
          </h2>
          <div className="fx-meth-cols">
            <div className="fx-meth-c">
              <div className="fx-meth-n">{t("fx.land.meth.01.n")}</div>
              <h3>{t("fx.land.meth.01.h")}</h3>
              <p>{t("fx.land.meth.01.p")}</p>
              <Link href="/methode">{t("fx.land.meth.01.cta")}</Link>
            </div>
            <div className="fx-meth-c">
              <div className="fx-meth-n">{t("fx.land.meth.02.n")}</div>
              <h3>{t("fx.land.meth.02.h")}</h3>
              <p>{t("fx.land.meth.02.p")}</p>
              <Link href="/methode">{t("fx.land.meth.02.cta")}</Link>
            </div>
            <div className="fx-meth-c">
              <div className="fx-meth-n">{t("fx.land.meth.03.n")}</div>
              <h3>{t("fx.land.meth.03.h")}</h3>
              <p>{t("fx.land.meth.03.p")}</p>
              <a href="https://github.com/Nuttux/open-public-data" target="_blank" rel="noopener noreferrer">
                {t("fx.land.meth.03.cta")}
              </a>
            </div>
          </div>

          <div className="fx-byline">
            <div className="fx-byline-left">
              <span className="fx-byline-mark">
                <BrandMark size={54} />
              </span>
              <div className="fx-byline-text">
                <div className="fx-byline-name">
                  <b>{t("fx.land.byline.name")}</b>{t("fx.land.byline.name_suffix")}
                </div>
                <div className="fx-byline-meta">{t("fx.land.byline.meta")}</div>
              </div>
            </div>
            <div className="fx-byline-actions">
              <a className="fx-btn fx-btn-small" href="/analyses">
                {t("fx.land.byline.docs")}
              </a>
              <a className="fx-btn fx-btn-small" href="/methode">
                {t("fx.land.byline.methode")}
              </a>
              <a
                className="fx-btn fx-btn-small"
                href="https://github.com/Nuttux/open-public-data"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("fx.land.byline.github")}
              </a>
              <a className="fx-btn fx-btn-small" href="mailto:contact@franceopendata.org">
                {t("fx.land.byline.contact")}
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
