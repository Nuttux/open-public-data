import type { SfTimelineComposition } from "@/lib/us/sf-budget-data";
import { fmtUsdCompact } from "@/lib/us/format";

/**
 * "What changed" — the grounded companion to the timeline chart. Answers *why*
 * the number grew, on two evidence tiers that never bluff:
 *   - Modern (from the budget marts): spending growth by service area FY2010→FY2025,
 *     compared only on dimensions that survive the FY2018 chart-of-accounts break
 *     (service areas + personnel). The narrative is templated from those exact
 *     numbers — no free-form claims.
 *   - Archive (verbatim OCR): what the city funded then, each line transcribed
 *     from the scan with a page-level deep link. Framed honestly as ledger lines /
 *     department totals, not a ranking.
 *
 * Server-rendered, display-only (no client JS). Every figure a reader sees traces
 * to a mart cell or a scanned page.
 */
export default function SfBudgetComposition({ comp }: { comp: SfTimelineComposition }) {
  const areas = comp.modern.service_areas;
  const maxY1 = Math.max(...areas.map((a) => a.y1_usd));
  const p = comp.modern.personnel;

  return (
    <section className="fx-section">
      <div className="fx-wrap">
        <div className="fx-fiche-h">What changed — and what drove it</div>

        {/* ── modern: service-area growth ── */}
        <p className="fx-place-sub" style={{ maxWidth: 680, marginTop: 4 }}>{comp.modern.narrative}</p>

        <div style={{ marginTop: 18 }}>
          <div className="fx-doc-source" style={{ marginBottom: 10 }}>
            City spending by service area · {comp.modern.window} ·{" "}
            <span style={{ color: "var(--muted)" }}>▮ FY2010</span>{" "}
            <span style={{ color: "var(--bleu)" }}>▮ growth to FY2025</span>
          </div>
          {areas.map((a) => {
            const w0 = (a.y0_usd / maxY1) * 100;
            const wg = (a.growth_usd / maxY1) * 100;
            return (
              <div key={a.name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 3, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "var(--f-disp)", fontWeight: 600, fontSize: 13.5 }}>{a.name}</span>
                  <span className="fx-doc-source tnum">
                    {fmtUsdCompact(a.y0_usd)} → {fmtUsdCompact(a.y1_usd)}
                    <b style={{ color: "var(--bleu)" }}> +{fmtUsdCompact(a.growth_usd)}</b>
                    {a.mult ? ` · ${a.mult.toFixed(1)}×` : ""}
                  </span>
                </div>
                <div style={{ display: "flex", height: 12, background: "var(--bg-warm, #f2efe9)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${w0}%`, background: "var(--muted)" }} />
                  <div style={{ width: `${wg}%`, background: "var(--bleu, #1f5fbf)" }} />
                </div>
              </div>
            );
          })}
        </div>

        <p className="fx-place-money-line" style={{ marginTop: 6 }}>
          Staff pay is the biggest single force: <b>salaries and mandatory fringe benefits</b> went from{" "}
          <span className="tnum" style={{ fontWeight: 700 }}>{fmtUsdCompact(p.y0_usd)}</span> to{" "}
          <span className="tnum" style={{ fontWeight: 700 }}>{fmtUsdCompact(p.y1_usd)}</span> — about{" "}
          {(p.y1_usd / p.y0_usd).toFixed(1)}× — over the same span.
        </p>
        <p className="fx-fiche-note" style={{ marginTop: 8 }}>{comp.modern.note}</p>

        {/* ── archive: what the city funded, then ── */}
        {comp.archive.length > 0 && (
          <div style={{ marginTop: 26, borderTop: "1px solid var(--rule)", paddingTop: 18 }}>
            <div className="fx-fiche-h fx-fiche-h--moments">What the city funded, then</div>
            <p className="fx-place-sub" style={{ maxWidth: 680 }}>{comp.archive_note}</p>
            <div style={{ display: "flex", gap: 26, flexWrap: "wrap", marginTop: 12 }}>
              {comp.archive.map((era) => (
                <div key={era.year} style={{ flex: "1 1 280px", minWidth: 0 }}>
                  <div className="tnum" style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 18 }}>{era.year}</div>
                  <div className="fx-doc-source" style={{ marginBottom: 8 }}>{era.framing}</div>
                  <ul className="fx-place-contracts">
                    {era.items.map((it, i) => (
                      <li key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                        <span style={{ flex: 1 }}>
                          {it.label}
                          <span className="fx-doc-source" style={{ display: "block" }}>
                            &ldquo;{it.quote}&rdquo; ·{" "}
                            <a href={it.url} target="_blank" rel="noopener noreferrer">{it.page_label} ↗</a>
                          </span>
                        </span>
                        <span className="tnum" style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 13, whiteSpace: "nowrap" }}>
                          {fmtUsdCompact(it.value_nominal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
