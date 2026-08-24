"use client";

/**
 * /us/city/sf/the-city — the client shell.
 *
 * The map is the page. It runs the full width of the window, the entry plate
 * sits on it, and everything that explains it is UNDER it: one line, with the
 * rest behind a disclosure a reader has to open. Provenance is not deleted
 * here, it is demoted — the note carries where the shapes and the decisions
 * come from, and `SfSourceFooter` closes the page with the perimeter and the
 * files, the same way every other page in this section does.
 *
 * ── WHERE THE FILM DROPS IN ──────────────────────────────────────────────
 * `film.ts` / `time.ts` and the transport are another block's work. When they
 * land, nothing here has to be rearranged:
 *
 *   - the play button replaces `primary` on `<CityEntry>` ("Watch the
 *     century"), and `meta` becomes its running time and beat count;
 *   - the transport goes in `<CityMap transport={…}>`, the row under the
 *     stage that draws nothing while it is empty;
 *   - the year and the beat card go in `<CityMap hud={…}>`, over the canvas;
 *   - the "recently built" list goes in `<CityMap ledger={…}>`, which takes
 *     over the idle content of the record margin and nothing else;
 *   - the camera comes from `onReady` below, which is called once with the
 *     renderer — `setYear`, `goToPreset`, `home`, `invalidate`.
 *
 * See `components/us/city/PAGE.md`.
 *
 * EN-only (ADR-0010 D3): copy flows through `us.sf.thecity.*` keys whose EN
 * and FR values are identical English, like the rest of the SF surface.
 */

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import SfSourceFooter from "@/components/us/SfSourceFooter";
import CityEntry from "@/components/us/city/CityEntry";
import { prefersReducedMotion } from "@/components/us/city/CityMap";
import type { CityMapHandle } from "@/components/us/city/CityMap";
import { useCityFilm } from "@/components/us/city/CityFilm";
import { useCityScrub } from "@/components/us/city/CityScrub";
import type { CityRenderer } from "@/components/us/city/renderer";
import { useT } from "@/lib/localeContext";

const CityMap = dynamic(() => import("@/components/us/city/CityMap"), {
  ssr: false,
  // The placeholder is the stage at its real height, so the entry plate over
  // it does not move when the canvas module arrives.
  loading: () => (
    <div className="fx-city-wrap">
      <div className="fx-city-frame">
        <div className="fx-city-stage" />
        <div className="fx-city-ledger" />
      </div>
    </div>
  ),
});

const nfInt = new Intl.NumberFormat("en-US");

export interface TheCityPageData {
  buildings: number;
  blocks: number;
  streets: number;
  trees: number;
  /** decisions the record places on a block or on a street it fronts */
  decisions: number;
  /** decisions that name a street and nothing narrower */
  streetOnly: number;
  /** decisions in the corpus that name no place we could resolve */
  unplaced: number;
  /** blocks the record says something about */
  blocksWithRecord: number;
  /** scanned volumes the decisions were read from */
  volumes: number;
  /** first and last year the record places on a block, e.g. "1906–2013" */
  span: string;
  accuracy: { n: number; exact: number };
  /** who publishes what this map is drawn from, out of the manifest */
  publishers: { name: string; datasets: number; url: string | null }[];
}

export default function TheCityClient({ data }: { data: TheCityPageData }) {
  const t = useT();
  const [intro, setIntro] = useState(true);
  const mapRef = useRef<CityMapHandle | null>(null);
  /* THE FILM DROPS IN EXACTLY WHERE THE HEADER SAID IT WOULD: its chrome in
     `hud`, its play control on the entry plate, and its camera out of
     `onReady`. Nothing else on this page moved. */
  const [renderer, setRenderer] = useState<CityRenderer | null>(null);
  const film = useCityFilm(renderer);
  /* THE YEAR RAIL. It goes in `transport`, the row under the stage that draws
     nothing while it is empty, exactly where PAGE.md §4 said it would. The
     film hides the whole row while it runs and hands the year back on the way
     out, so the two never hold the clock at once. */
  const scrub = useCityScrub(renderer, {
    payload: film.payload,
    filmOn: film.on,
    handoff: film.exitYear,
    onEngage: () => setIntro(false),
  });
  const noteRef = useRef<HTMLDetailsElement>(null);

  const openNote = (): void => {
    const el = noteRef.current;
    if (!el) return;
    el.open = true;
    /* a smooth scroll of most of a screen is large-field motion; under
       `prefers-reduced-motion` the page is simply already there */
    el.scrollIntoView({
      behavior: prefersReducedMotion() ? "auto" : "smooth",
      block: "center",
    });
  };

  return (
    <main id="main-content" tabIndex={-1} style={{ overflowX: "clip" }}>
      {/* ── the map, full width, with the plate on it ── */}
      <div
        className="fx-city-shell"
        onPointerDown={(e) => {
          // A reader who reaches past the plate and grabs the city has said
          // what they want more clearly than any button could.
          if (intro && (e.target as HTMLElement).tagName === "CANVAS") {
            setIntro(false);
          }
        }}
      >
        <CityMap
          hud={film.hud}
          transport={scrub.transport}
          record={{
            blocks: data.blocks,
            withRecord: data.blocksWithRecord,
            decisions: data.decisions,
            span: data.span,
          }}
          onReady={(handle) => {
            mapRef.current = handle;
            setRenderer(handle.renderer);
          }}
        />

        {intro ? (
          <CityEntry
            kicker={t("us.sf.thecity.entry.kicker")}
            title={
              <>
                {t("us.sf.thecity.title.before")}
                <em>{t("us.sf.thecity.title.em")}</em>
              </>
            }
            lede={t("us.sf.thecity.lede")}
            ledeShort={t("us.sf.thecity.entry.lede_short")}
            meta={
              film.ready
                ? `${t("us.sf.thecity.film.entry_meta")} ${film.runtimeLabel}`
                : t("us.sf.thecity.entry.meta")
                    .replace("{buildings}", nfInt.format(data.buildings))
                    .replace("{decisions}", nfInt.format(data.decisions))
            }
            primary={{
              label: film.ready
                ? t(
                    film.resumeLabel === "resume"
                      ? "us.sf.thecity.film.resume_film"
                      : "us.sf.thecity.film.watch",
                  )
                : t("us.sf.thecity.entry.start"),
              onClick: () => {
                setIntro(false);
                if (film.ready) film.play();
                else mapRef.current?.focus();
              },
            }}
            secondary={{
              label: t("us.sf.thecity.entry.method"),
              onClick: () => {
                setIntro(false);
                openNote();
              },
            }}
          />
        ) : null}
      </div>

      {/* ── one line, and the method behind it ── */}
      <section className="fx-city-note" id="sec-method">
        <div className="fx-wrap">
          <details ref={noteRef}>
            <summary>
              <span className="fx-city-note-line">{t("us.sf.thecity.note.line")}</span>
              <span className="fx-city-note-more">{t("us.sf.thecity.note.more")}</span>
            </summary>

            <div className="fx-city-note-body">
              <h3>{t("us.sf.thecity.note.shapes.title")}</h3>
              <p>{t("us.sf.thecity.note.shapes")}</p>
              {/* what the closest view means, and why it is the same view on
                  every screen — see `camera.ts` §THE DETAIL CEILING */}
              <p>{t("us.sf.thecity.note.closest")}</p>

              <h3>{t("us.sf.thecity.note.standing.title")}</h3>
              <p>{t("us.sf.thecity.note.standing")}</p>
              <p>{t("us.sf.thecity.note.year")}</p>

              <h3>{t("us.sf.thecity.note.record.title")}</h3>
              <p>
                {t("us.sf.thecity.note.record")
                  .replace("{volumes}", nfInt.format(data.volumes))
                  .replace("{span}", data.span)
                  .replace("{placed}", nfInt.format(data.decisions))
                  .replace("{street}", nfInt.format(data.streetOnly))
                  .replace("{unplaced}", nfInt.format(data.unplaced))}
              </p>
              <p>
                {t("us.sf.thecity.note.accuracy")
                  .replace("{n}", nfInt.format(data.accuracy.n))
                  .replace("{exact}", data.accuracy.exact.toFixed(1))}
              </p>

              <h3>{t("us.sf.thecity.note.sources.title")}</h3>
              <p>{t("us.sf.thecity.note.sources")}</p>
              <ul className="fx-city-sources">
                {data.publishers.map((p) => (
                  <li key={p.name}>
                    {p.url ? (
                      <a href={p.url} target="_blank" rel="noopener noreferrer">
                        {p.name} ↗
                      </a>
                    ) : (
                      p.name
                    )}
                    {p.datasets > 0 ? (
                      <span>
                        {" · "}
                        {t(
                          p.datasets === 1
                            ? "us.sf.thecity.note.dataset_one"
                            : "us.sf.thecity.note.datasets",
                        ).replace("{n}", String(p.datasets))}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          </details>
        </div>
      </section>

      <SfSourceFooter
        perimeter={t("us.sf.thecity.footer.perimeter")
          .replace("{buildings}", nfInt.format(data.buildings))
          .replace("{blocks}", nfInt.format(data.blocks))
          .replace("{streets}", nfInt.format(data.streets))
          .replace("{trees}", nfInt.format(data.trees))}
        coverage={t("us.sf.thecity.footer.coverage")
          .replace("{decisions}", nfInt.format(data.decisions))
          .replace("{unplaced}", nfInt.format(data.unplaced))}
        source={{
          name: "DataSF · Internet Archive · USGS · US Census",
          href: "https://datasf.org/opendata/",
        }}
        exports={[
          { label: "manifest.json", href: "/data/us/sf/city/manifest.json" },
          { label: "block-index.json", href: "/data/us/sf/city/blocks/block-index.json" },
          { label: "accuracy.json", href: "/data/us/sf/city/blocks/accuracy.json" },
        ]}
      />
    </main>
  );
}
