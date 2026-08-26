"use client";

/**
 * The GL page's shell.
 *
 * Deliberately the SAME shell as `TheCityClient`: the same entry plate, the
 * same one-line note with the method behind a disclosure, the same source
 * footer, the same `fx-city-*` classes and the same stage height. Every string
 * comes from the same `us.sf.thecity.*` keys.
 *
 * That is not laziness, it is the only way the comparison means anything. If
 * this page had its own copy, its own layout or its own counts, a reader
 * putting the two side by side would be comparing two PAGES. Holding
 * everything else identical makes the difference between them exactly one
 * thing: who draws the city.
 */

import dynamic from "next/dynamic";
import { useCallback, useRef, useState } from "react";

import SfSourceFooter from "@/components/us/SfSourceFooter";
import CityEntry from "@/components/us/city/CityEntry";
import type { TheCityPageData } from "@/app/us/city/sf/the-city/TheCityClient";
import type { CityDescriptor } from "@/lib/citygl/descriptor";
import type { FilmScript } from "@/lib/citygl/film";
import { DEFAULT_LOOK } from "@/lib/citygl/descriptor";
import type { CityEngine } from "@/lib/citygl/engine";
import { useT } from "@/lib/localeContext";

const CityGLMap = dynamic(() => import("@/components/us/citygl/CityGLMap"), {
  ssr: false,
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

/* ── THE FILM, 96,900 ms, PORTED ONE FOR ONE ────────────────────────────
   Not a new piece. Every framing, duration and year here is read out of the
   published Canvas film — `SCRIPT` in `lib/city/film.ts` for the act order and
   lengths, `public/data/us/sf/city/film/film.json` for the framings and the
   running times. Eleven shots: a 3,200 ms title, 90,700 ms of shots, a 3,000 ms
   end card. (That file's own header still says "ten moments, 2 minutes 14
   seconds" and is stale; both totals here were re-derived from the payload.)

   `z` is a multiple of the whole-city fit; `ox`/`oy` offset the target by that
   fraction of the viewport; scale interpolates geometrically and the centre
   linearly, which is what keeps a zoom feeling even. Two shots are worth
   knowing about:

     `rebuild`  is a MATCH CUT on shot 1's exact framing — nine years running
                under a camera that does not budge.
     `bridges`  is the one shot with two framings and a hard cut between them.
                Its two subjects are 9 km apart: at the zoom where one reads as
                a bridge the other is off frame. The cut lands on the first
                frame of the 1936 -> 1937 run, so the second framing opens on
                empty water and the counter crosses while you watch. */
const SF_FILM: FilmScript = {
  titleMs: 3200,
  endMs: 3000,
  openYear: 1906,
  shots: [
    {
      id: "burn",
      cam: {
        z: 3.0,
        ox: -0.16,
        oy: 0.12,
        at: [2552.222, 2560.36],
      },
      moveMs: 0,
      shotMs: 11200,
      acts: [
        {
          k: "build",
          ms: 1400,
          what: "burnLine",
          curve: "enter",
        },
        {
          k: "fire",
          ms: 6600,
          curve: "even",
        },
        {
          k: "hold",
          ms: 3200,
        },
      ],
    },
    {
      id: "rebuild",
      cam: {
        z: 3.0,
        ox: -0.16,
        oy: 0.12,
        at: [2552.222, 2560.36],
      },
      moveMs: 0,
      shotMs: 5600,
      acts: [
        {
          k: "run",
          ms: 5600,
          to: 1915,
          curve: "even",
        },
      ],
    },
    {
      id: "palace",
      cam: {
        z: 60.0,
        ox: 0.0,
        oy: -0.06,
        at: [-915.544, 4778.3],
      },
      moveMs: 1200,
      shotMs: 6800,
      acts: [
        {
          k: "build",
          ms: 1200,
          what: "placemark",
          of: "palace-of-fine-arts",
          curve: "settle",
        },
        {
          k: "hold",
          ms: 4400,
        },
      ],
    },
    {
      id: "bridges",
      cam: {
        z: 3.4,
        ox: 0.1,
        oy: 0.1,
        at: [5217.711, 4163.257],
      },
      cam2: {
        z: 6.0,
        ox: 0.06,
        oy: -0.04,
        at: [-3563.518, 6598.827],
      },
      moveMs: 1200,
      shotMs: 9800,
      acts: [
        {
          k: "run",
          ms: 1400,
          to: 1936,
          curve: "even",
        },
        {
          k: "build",
          ms: 1400,
          what: "bridge",
          curve: "travel",
        },
        {
          k: "hold",
          ms: 1400,
        },
        {
          k: "run",
          ms: 1000,
          to: 1937,
          curve: "even",
          cam: 2,
        },
        {
          k: "hold",
          ms: 3400,
          cam: 2,
        },
      ],
    },
    {
      id: "japantown",
      cam: {
        z: 10.0,
        ox: -0.1,
        oy: 0.05,
        at: [786.26, 2911.241],
      },
      moveMs: 1800,
      shotMs: 10800,
      acts: [
        {
          k: "run",
          ms: 2400,
          to: 1942,
          curve: "even",
        },
        {
          k: "build",
          ms: 1400,
          what: "outline",
          of: "japantown-1942",
          curve: "enter",
        },
        {
          k: "hold",
          ms: 5200,
        },
      ],
    },
    {
      id: "charter",
      cam: {
        z: 44.0,
        ox: -0.04,
        oy: -0.16,
        at: [1506.603, 2066.099],
      },
      moveMs: 1200,
      shotMs: 6200,
      acts: [
        {
          k: "run",
          ms: 1000,
          to: 1945,
          curve: "even",
        },
        {
          k: "build",
          ms: 1200,
          what: "placemark",
          of: "united-nations-charter-1945",
          curve: "settle",
        },
        {
          k: "hold",
          ms: 2800,
        },
      ],
    },
    {
      id: "freeways",
      cam: {
        z: 2.1,
        ox: 0.1,
        oy: -0.02,
      },
      moveMs: 1200,
      shotMs: 8000,
      acts: [
        {
          k: "run",
          ms: 2400,
          to: 1959,
          curve: "even",
        },
        {
          k: "hold",
          ms: 4400,
        },
      ],
    },
    {
      id: "pyramid",
      cam: {
        z: 24.0,
        ox: 0.12,
        oy: -0.3,
        at: [3106.055, 3926.702],
      },
      moveMs: 1200,
      shotMs: 7200,
      acts: [
        {
          k: "run",
          ms: 1400,
          to: 1972,
          curve: "even",
        },
        {
          k: "build",
          ms: 1200,
          what: "placemark",
          of: "transamerica-pyramid",
          curve: "settle",
        },
        {
          k: "hold",
          ms: 3400,
        },
      ],
    },
    {
      id: "embarcadero",
      cam: {
        z: 5.5,
        ox: 0.02,
        oy: 0.22,
        at: [3564.311, 4063.18],
      },
      moveMs: 1200,
      shotMs: 9000,
      acts: [
        {
          k: "run",
          ms: 1400,
          to: 1989,
          curve: "even",
        },
        {
          k: "run",
          ms: 1000,
          to: 1991,
          curve: "even",
        },
        {
          k: "hold",
          ms: 5400,
        },
      ],
    },
    {
      id: "mission-bay",
      cam: {
        z: 3.6,
        ox: 0.12,
        oy: -0.06,
        at: [3771.921, 1433.579],
      },
      moveMs: 1200,
      shotMs: 8100,
      acts: [
        {
          k: "run",
          ms: 3600,
          to: 2018,
          curve: "even",
        },
        {
          k: "build",
          ms: 900,
          what: "ring",
          of: "mission-bay",
          curve: "settle",
        },
        {
          k: "hold",
          ms: 2400,
        },
      ],
    },
    {
      id: "face",
      cam: {
        z: 1.1,
        ox: 0.0,
        oy: 0.0,
      },
      moveMs: 1200,
      shotMs: 8000,
      acts: [
        {
          k: "run",
          ms: 1000,
          to: 2019,
          curve: "even",
        },
        {
          k: "hold",
          ms: 5800,
        },
      ],
    },
  ],
};

/** SAN FRANCISCO, AND THIS IS THE ONLY PLACE IT IS NAMED. */
const SF: CityDescriptor = {
  id: "us-sf",
  dataBaseUrl: "/data/us/sf/city",
  look: DEFAULT_LOOK,
  stops: [
    { label: "Whole city", spanM: 14000 },
    { label: "District", spanM: 4200 },
    { label: "Block", spanM: 1400 },
    { label: "Street", spanM: 420 },
  ],
  film: SF_FILM,
};

export default function TheCityGLClient({ data }: { data: TheCityPageData }) {
  const t = useT();
  const [intro, setIntro] = useState(true);
  const engineRef = useRef<CityEngine | null>(null);
  const noteRef = useRef<HTMLDetailsElement | null>(null);

  const openNote = useCallback(() => {
    const el = noteRef.current;
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <main className="theme-fusion">
      <div className="fx-city-shell">
        <CityGLMap
          descriptor={SF}
          onReady={(engine: CityEngine) => {
            engineRef.current = engine;
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
              /* THE PORT SAYS WHAT IT IS, ON THE PLATE. A work surface that
                 looks exactly like the published page and does not say so is
                 a way to mislead yourself as much as anybody else. */
              <>
                {t("us.sf.thecity.entry.meta")
                  .replace("{buildings}", nfInt.format(data.buildings))
                  .replace("{decisions}", nfInt.format(data.decisions))}
                {" · drawn by the GPU (work in progress)"}
              </>
            }
            primary={{
              label: t("us.sf.thecity.entry.start"),
              onClick: () => setIntro(false),
            }}
            alt={{
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
              <span className="fx-city-note-line">
                {t("us.sf.thecity.note.line")}
              </span>
              <span className="fx-city-note-more">
                {t("us.sf.thecity.note.more")}
              </span>
            </summary>

            <div className="fx-city-note-body">
              <h3>{t("us.sf.thecity.note.shapes.title")}</h3>
              <p>{t("us.sf.thecity.note.shapes")}</p>
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
          {
            label: "block-index.json",
            href: "/data/us/sf/city/blocks/block-index.json",
          },
          {
            label: "accuracy.json",
            href: "/data/us/sf/city/blocks/accuracy.json",
          },
        ]}
      />
    </main>
  );
}
