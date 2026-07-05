"use client";
/**
 * La frise des chantiers — bandeau photo immersif, pleine largeur.
 * Un segment par exercice budgétaire (millésime géant en filigrane), les
 * plus gros chantiers de l'année en cartes photo cliquables → fiche projet.
 * Défilement horizontal natif + drag à la souris + flèches ; snap par carte.
 * L'axe est l'exercice (inscription au CA), pas une date de livraison —
 * l'honnêteté de ce choix est portée par la note sous la frise.
 */
import { useRef, useState } from "react";
import Link from "next/link";
import ProjetThumb from "@/components/fusion/ProjetThumb";
import { useLocale, useT } from "@/lib/localeContext";
import type { FriseChantiersData } from "@/lib/fusion-data";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

function fmtMeur(v: number, locale: string): string {
  const loc = locale === "en" ? "en-GB" : "fr-FR";
  if (v >= 1e9) return `${(v / 1e9).toLocaleString(loc, { maximumFractionDigits: 2 })} Md€`;
  return `${Math.round(v / 1e6).toLocaleString(loc)} M€`;
}

export default function FriseChantiers({
  data,
  ficheBase,
}: {
  data: FriseChantiersData;
  /** e.g. /ville/paris/investissements — fiche = `${ficheBase}/projet/${id}` */
  ficheBase: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ down: false, moved: false, startX: 0, startLeft: 0 });
  const [grabbing, setGrabbing] = useState(false);

  const scrollByPage = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: reduced ? "auto" : "smooth" });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el || e.pointerType !== "mouse") return;
    dragRef.current = { down: true, moved: false, startX: e.clientX, startLeft: el.scrollLeft };
    setGrabbing(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    const d = dragRef.current;
    if (!el || !d.down) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 5) d.moved = true;
    el.scrollLeft = d.startLeft - dx;
  };
  const endDrag = () => {
    dragRef.current.down = false;
    setGrabbing(false);
  };
  // Un drag ne doit pas déclencher la navigation de la carte relâchée.
  const onClickCapture = (e: React.MouseEvent) => {
    if (dragRef.current.moved) {
      e.preventDefault();
      e.stopPropagation();
      dragRef.current.moved = false;
    }
  };

  return (
    <div className="fx-frise-bleed">
      <button
        type="button"
        className="fx-frise-nav fx-frise-nav-prev"
        aria-label={t("fx.inv.frise.prev")}
        onClick={() => scrollByPage(-1)}
      >
        ‹
      </button>
      <button
        type="button"
        className="fx-frise-nav fx-frise-nav-next"
        aria-label={t("fx.inv.frise.next")}
        onClick={() => scrollByPage(1)}
      >
        ›
      </button>
      <div
        ref={scrollRef}
        className="fx-frise-scroll"
        style={{ cursor: grabbing ? "grabbing" : "grab" }}
        tabIndex={0}
        role="region"
        aria-label={fill(t("fx.inv.frise.aria"), { from: data.from, to: data.to })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") scrollByPage(1);
          if (e.key === "ArrowLeft") scrollByPage(-1);
        }}
      >
        <div className="fx-frise-track">
          {data.years.map((y) => (
            <section key={y.year} className="fx-frise-year" aria-label={String(y.year)}>
              <span className="fx-frise-watermark" aria-hidden>
                {y.year}
              </span>
              <header className="fx-frise-yearhead">
                <span className="fx-frise-yearlabel">{y.year}</span>
                <span className="fx-frise-yeartotal">
                  {fill(t("fx.inv.frise.total"), { total: fmtMeur(y.total, locale) })}
                </span>
              </header>
              <div className="fx-frise-cards">
                {y.projets.map((p) => (
                  <Link
                    key={p.id}
                    href={`${ficheBase}/projet/${encodeURIComponent(p.id)}`}
                    scroll={false}
                    className="fx-frise-card"
                    draggable={false}
                  >
                    <div className="fx-frise-photo">
                      <ProjetThumb
                        photo={p.photo.photo}
                        generic={p.photo.generic}
                        typologie={p.photo.typologie}
                        aspectRatio="16 / 10"
                        fallbackLabel={p.name}
                      />
                      {p.isJO && <span className="fx-frise-jo">JO 2024</span>}
                    </div>
                    <div className="fx-frise-cardbody">
                      <div className="fx-frise-cardname">
                        {(locale === "en" && p.name_en ? p.name_en : p.name).slice(0, 90)}
                      </div>
                      <div className="fx-frise-cardmeta">
                        <b>{fmtMeur(p.amount, locale)}</b>
                        {p.arr > 0 && (
                          <span>
                            {" · "}
                            {p.arr}
                            {locale === "en" ? (p.arr === 1 ? "st" : p.arr === 2 ? "nd" : p.arr === 3 ? "rd" : "th") : p.arr === 1 ? "ᵉʳ" : "ᵉ"}
                          </span>
                        )}
                        <span className="fx-frise-chap"> · {p.chapitre}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="fx-frise-tick" aria-hidden />
            </section>
          ))}
        </div>
      </div>
      <p className="fx-frise-hint" aria-hidden>
        {t("fx.inv.frise.hint")}
      </p>
    </div>
  );
}
