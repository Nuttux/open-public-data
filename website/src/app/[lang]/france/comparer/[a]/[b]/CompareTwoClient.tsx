"use client";

import Link from "@/components/LocalizedLink";
import { useState } from "react";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import ChartSource from "@/components/fusion/ChartSource";
import { useT, useLocale } from "@/lib/localeContext";
import { deNom } from "@/lib/nom-commune";

export type CompareTwoEntry = { slug: string; nom: string; dep_name: string; pop: number; kpis: Record<string, number | null>; taux?: { annee: number; tfb: number | null; mediane: number | null } | null };

export default function CompareTwoClient({ a, b, keys, year, sourceUrl }: { a: CompareTwoEntry; b: CompareTwoEntry; keys: string[]; year: number; sourceUrl: string }) {
  const t = useT();
  const { locale } = useLocale();
  const int = new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 0 });
  const fill = (key: string, vars: Record<string, string | number>) => {
    let s = t(key);
    for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
  const [ok, setOk] = useState(false);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: fill("fx.cmp2.title", { a: a.nom, b: b.nom }), url });
      else { await navigator.clipboard.writeText(url); setOk(true); setTimeout(() => setOk(false), 2000); }
    } catch { /* annulé */ }
  };
  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <div className="fx-wrap fx-v3 fx-pv" style={{ paddingTop: 48, paddingBottom: 48 }}>
          <p className="fx-pv-kicker">{a.dep_name}{a.dep_name !== b.dep_name ? ` · ${b.dep_name}` : ""} · {t("fx.pv.par_hab")}</p>
          <h1 className="fx-pv-title">{fill("fx.cmp2.title", { a: a.nom, b: b.nom })}</h1>
          <p className="fx-v3-h2sub">{fill("fx.cmp2.lede", { year })}</p>
          <div className="fx-pv-vs" style={{ marginTop: 20 }}>
            <div className="legend">
              <span><i className="a" />{a.nom} · {int.format(a.pop)} {t("fx.cmp2.hab")}</span>
              <span><i className="b" />{b.nom} · {int.format(b.pop)} {t("fx.cmp2.hab")}</span>
            </div>
            {keys.map((k) => {
              const va = a.kpis[k];
              const vb = b.kpis[k];
              const max = Math.max(Math.abs(va ?? 0), Math.abs(vb ?? 0), 1);
              return (
                <div key={k} className="row">
                  <span className="lab">{t(`fx.cmp2.kpi.${k}`)}</span>
                  <div className="track">
                    <span className="a" style={{ width: `${(Math.abs(va ?? 0) / max) * 100}%` }} />
                    <span className="b" style={{ width: `${(Math.abs(vb ?? 0) / max) * 100}%` }} />
                  </div>
                  <span className="val tnum"><b>{va != null ? int.format(Math.round(va)) : "—"} €</b> · {vb != null ? int.format(Math.round(vb)) : "—"} €</span>
                </div>
              );
            })}
            {a.taux?.tfb != null && b.taux?.tfb != null ? (
              <div className="row">
                <span className="lab">{t("fx.pv.kpi_tfb")}</span>
                <div className="track">
                  <span className="a" style={{ width: `${(a.taux.tfb / Math.max(a.taux.tfb, b.taux.tfb, 0.01)) * 100}%` }} />
                  <span className="b" style={{ width: `${(b.taux.tfb / Math.max(a.taux.tfb, b.taux.tfb, 0.01)) * 100}%` }} />
                </div>
                <span className="val tnum"><b>{a.taux.tfb.toLocaleString(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 2 })} %</b> · {b.taux.tfb.toLocaleString(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 2 })} % {fill("fx.pv.taux_annee", { y: a.taux.annee })}</span>
              </div>
            ) : null}
          </div>
          <button type="button" className="fx-pv-share" onClick={share}><i aria-hidden="true" />{ok ? t("fx.pv.share_done") : t("fx.cmp2.share")}</button>
          <p className="fx-v3-foot">{t("fx.cmp2.note")}{a.taux ? ` ${t("fx.pv.taux_note")}` : ""}</p>
          <p className="fx-v3-sentence">
            <Link className="fx-pv-link" href={`/france/${a.slug}`}>{fill("fx.cmp2.back", { nom: a.nom, denom: deNom(a.nom) })}<i className="fx-pv-arrow" aria-hidden="true" /></Link>
            {" · "}
            <Link className="fx-pv-link" href={`/france/${b.slug}`}>{fill("fx.cmp2.back", { nom: b.nom, denom: deNom(b.nom) })}<i className="fx-pv-arrow" aria-hidden="true" /></Link>
          </p>
          <ChartSource source={`${t("fx.natcmp.source")} · ${year}`} dataHref={sourceUrl} methodAnchor="c-villes" />
        </div>
      </main>
      <Footer />
    </div>
  );
}
