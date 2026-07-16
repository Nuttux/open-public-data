"use client";

import Link from "next/link";
import type { MarchesPageData } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";

type SigItem = MarchesPageData["signature"][number];

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

/** Statut de vie du contrat, précision au jour UTC (cf. ContratFiche :
 *  une milliseconde de différence SSR/client casse l'hydratation). */
function statut(dateNotification: string, dureeJours: number): "encours" | "termine" | null {
  if (!dateNotification || !(dureeJours > 0)) return null;
  const startMs = Date.parse(dateNotification);
  if (Number.isNaN(startMs)) return null;
  const DAY = 86400000;
  const nowMs = Math.floor(Date.now() / DAY) * DAY;
  return nowMs < startMs + dureeJours * DAY ? "encours" : "termine";
}

export default function MarchesSignature({ items }: { items: SigItem[] }) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";

  if (items.length === 0) return null;

  const fmtEur = (n: number) => {
    if (n >= 1e6) return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 1 }).format(n / 1e6), u: t("fx.s.m_eur") };
    return { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 0 }).format(n / 1e3), u: "k €" };
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 18,
      }}
    >
      {items.map((it) => {
        const { v, u } = fmtEur(it.montant);
        const st = statut(it.dateNotification, it.dureeJours);
        const label = locale === "en" && it.labelEn ? it.labelEn : it.label;
        const mono = it.kind === "mono";
        return (
          <Link
            key={it.numero}
            href={`/ville/paris/marches/contrat/${encodeURIComponent(it.numero)}`}
            scroll={false}
            className="fx-row-link"
            style={{
              display: "flex",
              flexDirection: "column",
              border: "1px solid var(--rule)",
              background: "var(--bg)",
              textDecoration: "none",
              overflow: "hidden",
            }}
          >
            {it.photoUrl && (
              <figure style={{ margin: 0, position: "relative" }}>
                <img
                  src={it.photoUrl}
                  alt=""
                  loading="lazy"
                  style={{ width: "100%", height: 150, objectFit: "cover", display: "block" }}
                />
                {it.photoCredit && (
                  <figcaption
                    style={{ position: "absolute", right: 6, bottom: 6, fontFamily: "var(--f-mono)", fontSize: 9, color: "#fff", background: "rgba(0,0,0,.55)", padding: "2px 6px" }}
                  >
                    © {it.photoCredit}
                  </figcaption>
                )}
              </figure>
            )}
            <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 8, flexGrow: 1 }}>
              <div
                style={{
                  fontFamily: "var(--f-mono)",
                  fontSize: 10,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: mono ? "var(--ocre)" : "var(--muted)",
                  fontWeight: mono ? 600 : undefined,
                }}
              >
                {t(`fx.mp.sig.k.${it.kind}`)}
              </div>
              <div style={{ fontFamily: "var(--f-ui)", fontSize: 14.5, fontWeight: 600, color: "var(--ink)", lineHeight: 1.4 }}>
                {label.length > 110 ? label.slice(0, 110) + "…" : label}
              </div>
              <div style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--muted)" }}>
                {it.fournisseur.slice(0, 38)}
              </div>
              <div style={{ marginTop: "auto", display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, paddingTop: 6 }}>
                <span className="tnum" style={{ fontFamily: "var(--f-disp)", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--ink)" }}>
                  {v}
                  <span style={{ fontSize: ".55em", color: "var(--muted)", fontWeight: 500 }}> {u}</span>
                </span>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--muted)", textAlign: "right" }}>
                  {it.offres != null && it.offres > 0 && (
                    <span style={it.offres === 1 ? { color: "var(--ocre)", fontWeight: 600 } : undefined}>
                      <span aria-hidden="true" style={{ fontSize: 8 }}>●</span>{" "}
                      {it.offres === 1
                        ? t("fx.fiche.contrat.conc.offre_one")
                        : fill(t("fx.fiche.contrat.conc.offres_n"), { n: it.offres })}
                    </span>
                  )}
                  {st && (
                    <span style={{ display: "block", color: st === "encours" ? "var(--bleu)" : "var(--muted)", fontWeight: st === "encours" ? 600 : undefined }}>
                      {t(st === "encours" ? "fx.fiche.contrat.tl.en_cours" : "fx.fiche.contrat.tl.termine")}
                    </span>
                  )}
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
