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
import { useEffect, useRef, useState } from "react";

import SfSourceFooter from "@/components/us/SfSourceFooter";
import CityEntryStrip from "@/components/us/city/CityEntryStrip";
import type { TheCityPageData } from "./data";
import type { CityDescriptor } from "@/lib/citygl/descriptor";
import type { FilmScript } from "@/lib/citygl/film";
import { DEFAULT_LOOK } from "@/lib/citygl/descriptor";
import type { CityEngine } from "@/lib/citygl/engine";
import type { FilmPlayer } from "@/lib/citygl/film";
import CityGLFilmChrome, { useFilmDoor } from "@/components/us/citygl/CityGLFilmChrome";
import { useT } from "@/lib/localeContext";
import { wantsTiles } from "@/lib/citygl/tile-plane";

const MapSkeleton = () => (
  <div className="fx-city-wrap">
    <div className="fx-city-frame">
      <div className="fx-city-stage" />
      <div className="fx-city-ledger" />
    </div>
  </div>
);
const CityGLMap = dynamic(() => import("@/components/us/citygl/CityGLMap"), {
  ssr: false,
  loading: MapSkeleton,
});
/* THE PHONE'S RENDERER. Same page, same chrome, a different map under it —
   `CityTileMap.tsx` says why. Chosen on the client (`wantsTiles`), after
   mount, so a phone never starts building the GPU city it cannot hold. */
const CityTileMap = dynamic(() => import("@/components/us/citygl/CityTileMap"), {
  ssr: false,
  loading: MapSkeleton,
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
                empty water and the counter crosses while you watch.

   ── AND WHAT EVERY SHOT SAYS ──────────────────────────────────────────────
   `plate` is the same payload's own `title`, `copy`, `cite`, `also`, `links`
   and `note`, transcribed by script rather than by hand so the words on
   screen cannot drift from the words that were checked at build time. The
   payload's own note on them: *"Every line of copy and every citation here is
   checked at build time against the entries: a line on screen is a beat's own
   headline, or a verbatim run of a beat's quote, at the volume and BookReader
   leaf the shot cites."*

   Three of the eight cited items have no reader-facing volume name anywhere
   in the payload, and `volumeLabel()` in `lib/city/film.ts` — which is what
   the published plate prints — falls through on all three and prints the raw
   Internet Archive identifier. `journalofproceed85julydecsanfrich` on a plate
   reads as a bug rather than as a citation, so the three are written out here
   from the identifier itself and from the crop payload, which names one of
   them in full. Nothing is asserted that the identifier beside it does not
   already say, and the link under each one opens the page.

   `pinYear`, `yearRuns` and `sayFromAct` are the payload's `pin`, `yrun` and
   `say`. They decide the year the PLATE prints, which is not the year the
   city is drawn at — see `film-plate.ts` §plateYearAt for why those are two
   different questions and what happened when they were one. */
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
      plate: {
        title: "The earthquake, and the fire that followed",
        copy: "The fire burned for three days, destroyed some 28,000 buildings, left 225,000 of the city's 400,000 people homeless, and the city recorded 478 dead.",
        cite: {
          vol: "San Francisco Municipal Reports, 1906-07",
          leaf: 8,
          url: "https://archive.org/details/excerptsfromsanf1908sanf/page/n8/mode/1up",
        },
        also: [
          {
            t: "Three days, 28,000 buildings — USGS",
            u: "https://earthquake.usgs.gov/earthquakes/events/1906calif/18april/casualties.php",
            k: "data",
          },
          {
            t: "478 recorded dead — Municipal Reports, 1906-07, p. 703",
            u: "https://archive.org/details/excerptsfromsanf1908sanf/page/n6/mode/1up",
            k: "scan",
          },
        ],
        scan: 1,
      },
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
      yearRuns: true,
      plate: {
        title: "The city rebuilds",
        copy: "The city rebuilt more than it lost within nine years.",
        cite: {
          vol: "Journal of Proceedings, vol. 1",
          leaf: 8,
          url: "https://archive.org/details/journalofproceed01sanfrich/page/n8/mode/1up",
        },
        also: [
          {
            t: "The city's own building permits — Municipal Reports, p. 367",
            u: "https://archive.org/details/munisanfrancisco63sanfrich/page/n384/mode/1up",
            k: "scan",
          },
          {
            t: "28,188 buildings lost — USGS",
            u: "https://earthquake.usgs.gov/earthquakes/events/1906calif/18april/casualties.php",
            k: "data",
          },
        ],
        note: "28,559 new-building permits by June 1914, against 28,188 lost. Permits granted are not buildings completed, and the eight-year total is a sum of the city's own annual tables that none of them states.",
      },
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
      plate: {
        title: "The Panama-Pacific Exposition opens",
        copy: "San Francisco pulled down the Exposition's palaces when the fair closed and kept the Palace of Fine Arts.",
        cite: {
          vol: "Journal of Proceedings, 1915",
          leaf: 352,
          url: "https://archive.org/details/journalofproceed1915sanfrich/page/n352/mode/1up",
        },
      },
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
      yearRuns: true,
      sayFromAct: 1,
      plate: {
        title: "Two bridges open",
        copy: "The Bay Bridge and the Golden Gate opened six months apart.",
        cite: {
          vol: "Journal of Proceedings, vol. 31",
          leaf: 46,
          url: "https://archive.org/details/journalofproceed31sanfrich/page/n46/mode/1up",
        },
      },
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
      plate: {
        title: "Japantown is emptied",
        copy: "In 1942 the government removed everyone of Japanese descent from Japantown, and before the removal was finished the Board urged Washington to clear the quarter.",
        cite: {
          vol: "Journal of Proceedings, vol. 37",
          leaf: 713,
          url: "https://archive.org/details/journalofproceed37sanfrich/page/n713/mode/1up",
        },
        scan: 5,
      },
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
      plate: {
        title: "The UN Charter is signed",
        copy: "Fifty nations sign the charter at the city's war memorial.",
        cite: {
          vol: "Journal of Proceedings, vol. 40, part 3",
          leaf: 726,
          url: "https://archive.org/details/journalofproceed40part3sanfrich/page/n726/mode/1up",
        },
      },
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
      plate: {
        title: "The freeway revolt",
        copy: "The Board voted down seven of the ten freeways in the city's own master plan.",
        cite: {
          vol: "Journal of Proceedings, vol. 54",
          leaf: 48,
          url: "https://archive.org/details/journalofproceed54sanfrich/page/n48/mode/1up",
        },
        scan: 7,
      },
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
      plate: {
        title: "The Pyramid goes up",
        copy: "The Transamerica Pyramid went up in 1972 and stayed the tallest building in San Francisco for forty-six years.",
        also: [
          {
            t: "853 feet, fifty floors, 1972 — DataSF Tall Building Inventory",
            u: "https://data.sfgov.org/d/5kya-mfst",
            k: "data",
          },
          {
            t: "Salesforce Tower, 1,070 feet, opened 2018 — same register",
            u: "https://data.sfgov.org/d/5kya-mfst",
            k: "data",
          },
        ],
      },
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
      pinYear: 1989,
      plate: {
        title: "The earthquake of 1989",
        copy: "The earthquake killed sixty-three people, and the Board voted to demolish the Embarcadero Freeway rather than repair it.",
        cite: {
          vol: "Journal of Proceedings, vol. 85, July–December",
          leaf: 374,
          url: "https://archive.org/details/journalofproceed85julydecsanfrich/page/n374/mode/1up",
        },
      },
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
      yearRuns: true,
      plate: {
        title: "A rail yard becomes a neighbourhood",
        copy: "The Mission Bay rail yards became a neighbourhood of sixteen thousand people.",
        also: [
          {
            t: "16,710 residents — DataSF neighborhood demographics, ACS 2019–2023",
            u: "https://data.sfgov.org/d/4qbq-hvtt",
            k: "data",
          },
          {
            t: "“formerly-underutilized Southern Pacific railyards” — OCII",
            u: "https://sfocii.org/projects/mission-bay-south/overview",
            k: "data",
          },
        ],
      },
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
      plate: {
        title: "San Francisco bans police use of facial recognition",
        copy: "The city was the first in the United States to vote such a ban.",
        also: [
          {
            t: "Ordinance No. 103-19, File 190110, finally passed 10 to 1 on 21 May 2019",
            u: "https://sfgov.legistar.com/View.ashx?M=F&ID=7226786&GUID=78A20A6B-F1D1-4044-AA15-82AF55D98040",
            k: "data",
          },
          {
            t: "Board minutes, 21 May 2019 — the vote",
            u: "https://sfbos.org/sites/default/files/bag052119_minutes.pdf",
            k: "data",
          },
        ],
        scan: 11,
      },
    },
  ],
  titleCard: {
    head: "San Francisco builds itself",
    sub: "Eleven moments from the city's own record, 1906 to 2019",
    note: "Everything here comes from the city's own records.",
  },
  endCard: {
    head: "Every line in that film is a page you can open — and so is every block on the map",
    sub: "Click anywhere and the record opens: 41 neighbourhoods, 5,404 blocks, 2,197 named places.",
  },
  scansUrl: "/data/us/sf/city/film/scans.json",
};

/** SAN FRANCISCO, AND THIS IS THE ONLY PLACE IT IS NAMED. */
const SF: CityDescriptor = {
  id: "us-sf",
  dataBaseUrl: "/data/us/sf/city",
  /* the pyramids `scripts/render-city-tiles.mjs` writes; storage in prod,
     the dev server's `public/` locally (gitignored) */
  tilesBaseUrl: process.env.NEXT_PUBLIC_CITY_TILES_BASE ?? "/tiles/us/sf/city",
  look: DEFAULT_LOOK,
  /* ── WHAT EACH SYSTEM LAYER HOLDS, IN KILOMETRES ────────────────────────
     `systems.ts` describes what a KIND of system is; these are San Francisco's
     own figures, and they live here because the engine may not hold a fact
     about one city — `engine-is-city-free.test.ts` enforces that, and caught
     these sitting in it.

     Measured against the same DataSF centreline file the bikeways are resolved
     onto (`3psu-pn9h`, 17,170 pieces, 2,154 km), and against the shipped
     `base/bikeways.json` and `base/rail.json`:

         the bikeway register       720 km   33.4 % of every street
           path / lane / separated  382 km   17.7 %
           shared lane              338 km   15.7 %
         the rail register           69 km    3.2 %

     And the transit register is bigger than the rail in it. `9exe-acju` holds
     135 route patterns over 68 lines: ten are rail, 188 km of pattern, and the
     other 58 are bus and trolleybus, 1,354 km. The layer draws the ten. That
     is why the button says Rail and the note says what is missing rather than
     letting "public transport" stand for an eighth of one operator.

     The middle rows are why the bike view looked like the street view: a third
     of San Francisco's streets are in that register, and nearly half of what
     is in it is a picture of a bicycle painted on a road. */
  systemNotes: {
    transport:
      "69 km of track — the three cable car lines, the F, and J K L M N T. " +
      "Each piece is drawn from the year the Board is recorded paying to lay " +
      "it, and the routes it later ordered torn up appear and are then taken " +
      "up again. NOT the whole of public transport: Muni's 58 bus and " +
      "trolleybus lines are in the same register and are not drawn, and BART, " +
      "Caltrain and the ferries are other operators the City does not publish " +
      "here.",
    bike:
      "382 km of path, painted lane and separated way — 18 % of the city's " +
      "streets — plus 338 km of SHARED LANE, which is a road with a bicycle " +
      "painted on it and no lane at all, drawn thin and dashed because that " +
      "is what it is. DataSF dates 81 % of the pieces itself.",
    streets:
      "2,154 km of street, arriving as the record dates it: the Board's " +
      "Journal and the earliest building on each frontage. A street exists " +
      "before its first house, so these dates run late.",
  },
  stops: [
    { label: "Whole city", spanM: 14000 },
    { label: "District", spanM: 4200 },
    { label: "A few streets", spanM: 1400 },
    { label: "Street", spanM: 420 },
  ],
  film: SF_FILM,
};

/** the data files behind this page, offered as plain links in the method note */
const CITY_FILES = [
  { label: "manifest.json", href: "/data/us/sf/city/manifest.json" },
  { label: "block-index.json", href: "/data/us/sf/city/blocks/block-index.json" },
  { label: "accuracy.json", href: "/data/us/sf/city/blocks/accuracy.json" },
];

export default function TheCityGLClient({ data }: { data: TheCityPageData }) {
  const t = useT();
  const [intro, setIntro] = useState(true);
  const engineRef = useRef<CityEngine | null>(null);
  /* null until mounted: the choice needs the window, and rendering EITHER map
     on the server would start the wrong one on a phone */
  const [tiles, setTiles] = useState<boolean | null>(null);
  useEffect(() => {
    setTiles(
      wantsTiles(
        window.location.search,
        { coarse: window.matchMedia("(pointer: coarse)").matches, width: window.innerWidth },
        !!SF.tilesBaseUrl,
      ),
    );
  }, []);
  const noteRef = useRef<HTMLDetailsElement | null>(null);
  /* THE FILM, ONCE THE MAP HAS BUILT ONE. It is created inside `CityGLMap`'s
     own async effect — the engine, the framings and the interrupt binding all
     live there — and handed back on `onReady`. It is state and not a ref
     because two things on this page are rendered off it: the front door's
     label, and the chrome. */
  const [film, setFilm] = useState<FilmPlayer | null>(null);
  /* the film's own door. The entry no longer offers it — the century strip
     does, where a reader who is already inside can choose it — so nothing
     here reads this any more. Kept because `useFilmDoor` is what tracks
     whether the film can play at all. */
  void useFilmDoor(film);
  const shellRef = useRef<HTMLDivElement | null>(null);

  /* ── §THE STRIP GOES WHEN THE READER STARTS ───────────────────────────
     Daniel: *"i also like having more map size when the strip is Xed but
     nobody would click that is weird with it"*. He is right — an × is a
     control almost nobody uses, so the strip would sit there costing 113 px
     of city for the whole session.

     It does not need to be clicked. The strip exists to make one claim to
     somebody who has not started yet, and the moment they grab the map,
     turn the wheel or press a key they HAVE started: the claim has either
     landed or it has not, and either way it is now in the way. So the first
     interaction closes it, and the × stays for a reader who wants it gone
     before touching anything.

     Capture phase, so it fires whatever the pointer lands on — the canvas,
     a chip, the year rail — and `once` per listener, since one is enough. */
  useEffect(() => {
    if (!intro) return;
    const el = shellRef.current;
    if (!el) return;
    const go = () => setIntro(false);
    const opts = { capture: true, once: true } as const;
    el.addEventListener("pointerdown", go, opts);
    el.addEventListener("wheel", go, opts);
    el.addEventListener("keydown", go, opts);
    return () => {
      el.removeEventListener("pointerdown", go, opts);
      el.removeEventListener("wheel", go, opts);
      el.removeEventListener("keydown", go, opts);
    };
  }, [intro]);

  /* The entry plate and the proof line both used to open the method from
     here. Neither does now — the plate is a strip that makes one claim and
     offers nothing, and the numbers sit directly above the `<details>` that
     opens it on its own. The `<summary>` is the only way in, which is one
     way rather than three. */

  return (
    <main className="theme-fusion">
      <div className="fx-city-shell" ref={shellRef}>
        {tiles === null ? (
          <MapSkeleton />
        ) : tiles ? (
          <CityTileMap descriptor={SF} />
        ) : (
          <CityGLMap
            descriptor={SF}
            /* TWO ARGUMENTS. `CityGLMap` hands back the engine and the film it
               built from the descriptor above — the map owns the film's clock
               and camera, this page owns the chrome that reads it. */
            onReady={(engine, f) => {
              engineRef.current = engine;
              setFilm(f ?? null);
            }}
          />
        )}

        {/* ── THE FILM'S CHROME ──────────────────────────────────────────
            Rendered HERE and not inside the map, for the same reason the
            entry plate is: the map is `ssr:false`, and everything that is
            words rather than pixels belongs to the page. It positions itself
            against `.fx-city-shell` over the stage's own box and is invisible
            until the film plays. */}
        <CityGLFilmChrome script={SF.film} film={film} />

        {/* ── THE NUMBERS ARE PROOF, NOT INVITATION ────────────────────
            They were on the entry plate, where nobody enters because of
            them. They sit here instead, directly above the note that says
            what the map leaves out and opens the method — because the
            numbers and that caveat are two halves of one question: is this
            thing what it says it is.

            AND WITHOUT A LINK OF THEIR OWN. The first version put a
            "Methodology" button on this line, three centimetres above the
            summary that already says HOW THIS MAP IS MADE and already opens
            it. Two links to one page, adjacent, is a reader wondering
            whether they go to different places. */}
        <p className="fx-city-proof">
          {t("us.sf.thecity.entry.meta")
            .replace("{buildings}", nfInt.format(data.buildings))
            .replace("{decisions}", nfInt.format(data.decisions))
            .replace("{span}", data.span)}
        </p>

        {/* ── THE ENTRY IS A STRIP, NOT A PLATE ────────────────────────
            `CityEntryStrip.tsx` carries the reasoning. The short version:
            the entry has one job, which is to say that none of this was
            drawn by hand, and the plate was doing five. */}
        {intro ? (
          <CityEntryStrip
            kicker={t("us.sf.thecity.entry.kicker")}
            title={
              <>
                {t("us.sf.thecity.title.before")}
                <em>{t("us.sf.thecity.title.em")}</em>
              </>
            }
            claim={t("us.sf.thecity.lede")}
            closeLabel={t("us.sf.thecity.entry.dismiss")}
            onClose={() => setIntro(false)}
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
              <p className="fx-city-files">
                {t("us.sf.thecity.note.files")}{" "}
                {CITY_FILES.map((f, i) => (
                  <span key={f.href}>
                    {i ? " · " : ""}
                    <a href={f.href} download>{f.label}</a>
                  </span>
                ))}
              </p>
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
        /* the three JSON files were the biggest buttons on the page — the
           audit of 2026-09-09 found a visitor scrolling from the map into
           "manifest.json". They are links in the method note above now. */
        exports={[]}
      />
    </main>
  );
}
