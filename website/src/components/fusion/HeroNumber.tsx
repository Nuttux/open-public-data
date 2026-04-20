import type { ReactNode } from "react";

type Props = {
  label?: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  per?: ReactNode;
  delta?: {
    direction?: "up" | "down" | "flat";
    value: ReactNode;
    base?: ReactNode;
    note?: ReactNode;
  };
  caption?: ReactNode;
  className?: string;
};

/**
 * Oversized display number used on landing + overview sections.
 * The `per` slot renders "/ habitant" style qualifiers next to the unit.
 */
export default function HeroNumber({ label, value, unit, per, delta, caption, className }: Props) {
  return (
    <div className={["fx-hero-num", className ?? ""].filter(Boolean).join(" ")}>
      {label && <p className="fx-hero-num-line">{label}</p>}
      <p className="fx-hero-num-big tnum">
        {value}
        {unit && <span className="fx-hero-num-u">{unit}</span>}
        {per && <span className="fx-hero-num-per">{per}</span>}
      </p>
      {delta && (
        <p className="fx-hero-num-delta">
          <span className={`fx-hero-num-arrow fx-hero-num-arrow-${delta.direction ?? "flat"}`}>
            {delta.direction === "down" ? "↓" : delta.direction === "flat" ? "→" : "↑"} {delta.value}
          </span>
          {delta.base && <><span className="fx-hero-num-sep">·</span><span className="fx-hero-num-base">{delta.base}</span></>}
          {delta.note && <span>{delta.note}</span>}
        </p>
      )}
      {caption && <p className="fx-hero-num-cap">{caption}</p>}
    </div>
  );
}
