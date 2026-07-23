import type { Metadata } from "next";
import Link from "next/link";
import "@/app/fusion.css";
import PageIntro, { IntroStat } from "@/components/fusion/PageIntro";
import SfBudgetTimeline from "@/components/us/SfBudgetTimeline";
import SfBudgetComposition from "@/components/us/SfBudgetComposition";
import { loadSfTimeline } from "@/lib/us/sf-budget-data";
import { fmtUsdCompact } from "@/lib/us/format";

/**
 * /us/city/sf/budget/timeline — the SF 150-year financial time machine. Server
 * component (EN-only, ADR-0010 D3): loads timeline.json (export_sf_timeline.py)
 * and hands it to the client chart. No France brand template on US routes.
 */
export const metadata: Metadata = {
  title: "San Francisco — 150 years of city money",
  description:
    "A scrubbable timeline of total San Francisco city finances from the 1880s to today — fusing the modern budget with figures transcribed verbatim from Internet-Archive-scanned municipal reports, every point traceable to its source and readable in today's dollars.",
};

export default function SfBudgetTimelinePage() {
  const data = loadSfTimeline();
  const pts = [...data.points].sort((a, b) => a.year - b.year);
  const first = pts[0];
  const last = pts[pts.length - 1];
  const archiveCount = pts.filter((p) => p.source_type === "archive").length;
  const growth = last.value_real_per_capita / first.value_real_per_capita;

  return (
    <main id="main-content" tabIndex={-1} style={{ overflowX: "clip" }}>
      <PageIntro
        kicker={<Link href="/us/city/sf/budget">San Francisco · Budget</Link>}
        title={
          <>
            150 years of city money, <em>one timeline</em>
          </>
        }
        lede={
          <>
            Total city finances from the 1880s to today, on a single scrubbable axis. The modern years
            come straight from the adopted budget; the older ones are transcribed <em>verbatim</em> from
            scanned municipal reports held at the Internet Archive — every figure linked to the exact
            scanned page, and readable in today&rsquo;s dollars.
          </>
        }
        stats={
          <>
            <IntroStat value={`${first.year}–${last.year}`} label="span" />
            <IntroStat value={fmtUsdCompact(first.value_nominal)} label={`oldest figure (${first.label})`} />
            <IntroStat value={`${growth.toFixed(0)}×`} label={`real spending per resident, ${first.year}→${last.year}`} />
            <IntroStat value={archiveCount} label="figures read from scans" />
          </>
        }
      />

      <section className="fx-section">
        <div className="fx-wrap">
          <SfBudgetTimeline data={data} />
        </div>
      </section>

      <SfBudgetComposition comp={data.composition} />

      <section className="fx-section">
        <div className="fx-wrap">
          <div className="fx-fiche-h">How to read this</div>
          <p className="fx-place-sub" style={{ maxWidth: 640 }}>{data.archive_note}</p>
          <p className="fx-fiche-note" style={{ marginTop: 10 }}>
            The figure as printed is the untouched anchor; &ldquo;today&rsquo;s dollars&rdquo; and &ldquo;per
            resident&rdquo; are labelled derived transforms you toggle above — they never replace or hide the
            printed number. Live budget totals come from{" "}
            <Link href="/us/city/sf/budget">the SF adopted budget</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
