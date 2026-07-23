"use client";

import Link from "next/link";
import { useT } from "@/lib/localeContext";
import { FicheSection } from "@/components/fiche";
import FicheKpis from "@/components/fusion/FicheKpis";
import type { PlaceIndexEntry, PlacesSource, PlaceObras } from "@/lib/br/recife-places-data";
import { fmtBrlCompact, fmtInt } from "@/lib/br/format";

const SMALL = new Set(["e", "de", "da", "do", "dos", "das", "a", "o", "à", "em", "para"]);
function titleCase(s: string) {
  return s.toLocaleLowerCase("pt-BR").split(/\s+/)
    .map((w, i) => (i > 0 && SMALL.has(w)) ? w : w ? w[0].toLocaleUpperCase("pt-BR") + w.slice(1) : w).join(" ");
}

/** Civic-place fiche — identity/geo (Phase 1). Money-per-place is a later
 *  contract-crosswalk enrichment. Composed from the neutral fiche primitives. */
export default function RecifeLugarFiche({
  place, source, obras,
}: {
  place: PlaceIndexEntry;
  source: PlacesSource;
  obras?: PlaceObras | null;
}) {
  const t = useT();
  const mapUrl = `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=17/${place.lat}/${place.lon}`;
  const hasObras = !!obras && obras.contratos.length > 0;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <span className="fx-sm-tag">{place.familia}</span>
        {place.tipo && <span className="fx-sm-tag">{titleCase(place.tipo)}</span>}
      </div>

      {place.detalhe && (
        <div className="fx-fiche-lead">
          <p className="fx-fiche-lead-main">{titleCase(place.detalhe)}</p>
        </div>
      )}

      <FicheSection title={t("br.recife.lugares.onde")}>
        <table className="fx-fiche-table">
          <tbody>
            {place.bairro && (<tr><td>{t("br.recife.lugares.bairro")}</td><td>{titleCase(place.bairro)}</td></tr>)}
            {place.endereco && (<tr><td>{t("br.recife.lugares.endereco")}</td><td>{titleCase(place.endereco)}</td></tr>)}
            <tr>
              <td>{t("br.recife.lugares.coords")}</td>
              <td className="mono">
                {place.lat.toFixed(5)}, {place.lon.toFixed(5)} ·{" "}
                <a href={mapUrl} target="_blank" rel="noopener noreferrer">{t("br.recife.lugares.ver_mapa")} ↗</a>
              </td>
            </tr>
          </tbody>
        </table>
      </FicheSection>

      {hasObras ? (
        <FicheSection
          title={t("br.recife.lugares.obras_h")}
          sub={t("br.recife.lugares.obras_sub")}
        >
          {obras!.obras_total > 0 && (
            <FicheKpis
              items={[
                { label: t("br.recife.lugares.obras_total"), value: fmtBrlCompact(obras!.obras_total) },
                { label: t("br.recife.lugares.obras_n"), value: fmtInt(obras!.n_obras) },
              ]}
            />
          )}
          <table className="fx-fiche-table">
            <tbody>
              {obras!.contratos.map((c) => (
                <tr key={c.contrato_id}>
                  <td>
                    <Link href={`/br/city/recife/contratos/${c.contrato_id}`}>{c.numero}</Link>
                    <div className="fx-fiche-sub">{c.objeto}</div>
                  </td>
                  <td className="num mono">{c.valor != null ? fmtBrlCompact(c.valor) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </FicheSection>
      ) : (
        <p className="fx-fiche-sub" style={{ marginTop: 12 }}>{t("br.recife.lugares.money_soon")}</p>
      )}

      <footer className="fx-fiche-sources">
        <p className="fx-footer-sources-meta">
          <b>{t("br.recife.source")}</b>:{" "}
          {source.source_url && (
            <a href={source.source_url} target="_blank" rel="noopener noreferrer">{source.name ?? t("br.recife.portal")} ↗</a>
          )}
        </p>
      </footer>
    </div>
  );
}
