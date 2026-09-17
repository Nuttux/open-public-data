"use client";

import type { ReactNode } from "react";
import { useRouter } from "@/lib/navigation";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import ShareButton from "./ShareButton";

/**
 * The head of a section page, on the grammar of the fiches: where we are
 * (kicker with links), the title, ONE number with its unit, a caption that
 * says what it measures with the year as a menu, a meta line, an optional
 * movement line (ocre: the only accent), and « Partager ce chiffre ».
 *
 * Replaces PageIntro + YearPicker + the four-figure strip: on a phone those
 * filled the first screen before any data (measured 2026-09-14).
 */
export default function SectionHero({
  kicker,
  title,
  value,
  unit,
  captionBefore,
  captionAfter,
  years,
  year,
  basePath,
  meta,
  move,
  shareTitle,
  yearLabel,
}: {
  /** Where we are; the section page renders it above the grid instead, so both columns start on the same line. */
  kicker?: ReactNode;
  title: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  /** « de plafonds signés en » */
  captionBefore: ReactNode;
  captionAfter?: ReactNode;
  /** Empty when the number has no year (San Francisco's places : contract payments with no year on file). */
  years: number[];
  year: number;
  /** Logical path the year menu navigates to, e.g. /france/paris/marches */
  basePath: string;
  meta?: ReactNode;
  move?: ReactNode;
  shareTitle: string;
  /** How a year reads in the menu, e.g. « 2025 · voté » for a budget not yet executed. */
  yearLabel?: (y: number) => string;
}) {
  const t = useT();
  const router = useRouter();
  const track = useTrack();
  const onYear = (to: string) => {
    track("year_change", { page: basePath, year_from: year, year_to: Number(to), surface: "menu" });
    router.push(`${basePath}?year=${to}`, { scroll: false });
  };
  return (
    <header className="fx-sec-hero" data-section="hero">
      {kicker ? <div className="fx-page-kicker fx-page-kicker--links">{kicker}</div> : null}
      <h1>{title}</h1>
      <div className="fx-v3-hero-num tnum">
        {value}
        {unit ? <span className="u">{unit}</span> : null}
      </div>
      <div className="fx-sec-cap">
        {captionBefore}{years.length > 0 ? " " : null}
        {years.length === 0 ? null : years.length > 1 ? (
          <select className="fx-pv-yearsel" aria-label={t("fx.sec.year_label")} value={year} onChange={(e) => onYear(e.target.value)}>
            {years.slice().sort((a, b) => b - a).map((y) => (
              <option key={y} value={y}>{yearLabel ? yearLabel(y) : y}</option>
            ))}
          </select>
        ) : (
          <b>{year}</b>
        )}
        {captionAfter ? <> {captionAfter}</> : null}
      </div>
      {meta ? <div className="fx-sec-hero-meta">{meta}</div> : null}
      {move ? <div className="fx-sec-move">{move}</div> : null}
      <div className="fx-sec-hero-line">
        <ShareButton label={t("fx.sec.share_number")} done={t("fx.sec.shared")} title={shareTitle} object="hero" />
      </div>
    </header>
  );
}
