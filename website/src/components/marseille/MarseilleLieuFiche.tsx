"use client";

import Link from "next/link";
import { useLocale } from "@/lib/localeContext";
import { FicheSection } from "@/components/fiche";
import FicheKpis from "@/components/fusion/FicheKpis";
import { fmtInt } from "@/lib/fmt";
import type { MarseillePlace, PlacesSource } from "@/lib/marseille/marseille-places-data";

const eur = (n: number) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(1).replace(".", ",")} M€`
    : n >= 1000
      ? `${fmtInt(Math.round(n / 1e3))} k€`
      : `${fmtInt(Math.round(n))} €`;

const FAMILY_LABEL: Record<string, { fr: string; en: string }> = {
  culture: { fr: "Culture", en: "Culture" },
  sport: { fr: "Sport", en: "Sports" },
  vert: { fr: "Espaces verts", en: "Parks & green" },
  urbain: { fr: "Patrimoine urbain", en: "Urban heritage" },
  services: { fr: "Services publics", en: "Public services" },
};

const arrSuffix = (n: number, en: boolean) =>
  en ? `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}` : `${n}${n === 1 ? "ᵉʳ" : "ᵉ"}`;

const SUBV_HREF = (beneficiaire: string) =>
  `/fr/city/marseille/subventions/association/${encodeURIComponent(beneficiaire)}`;

/**
 * Marseille civic-place fiche — mirrors a Paris lieu (deliberations aside): a
 * credited free-licence photo, an encyclopaedic lead (Wikipedia FR/EN), the
 * operator grant with its annual détail, residents (orgs whose grant objet names
 * the place), location, and per-relation sources. Every money link leads to the
 * beneficiary's full record, closing the place → grant → recipient loop.
 */
export default function MarseilleLieuFiche({
  place,
}: {
  place: MarseillePlace & { source: PlacesSource };
}) {
  const { locale } = useLocale();
  const en = locale === "en";
  const kind = en ? place.kind_en : place.kind_fr;
  const fam = FAMILY_LABEL[place.famille];
  const famLabel = fam ? (en ? fam.en : fam.fr) : place.famille;
  const arrLabel = place.arrondissement ? arrSuffix(place.arrondissement, en) : null;
  const mapUrl = `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=17/${place.lat}/${place.lon}`;
  const cr = place.photo_credit;

  // Lead = Wikipedia extract (Paris parity): first sentence bold, the rest muted,
  // Wikipedia link trailing. Falls back to the short civic description.
  const wiki = place.wiki;
  const extract = ((en && wiki?.extract_en) || wiki?.extract || "").trim();
  const wikiUrl = (en && wiki?.url_en) || wiki?.url || null;
  const cut = extract.indexOf(". ");
  const leadMain = extract ? (cut > 0 ? extract.slice(0, cut + 1) : extract) : en ? place.desc_en : place.desc_fr;
  const leadSub = extract && cut > 0 ? extract.slice(cut + 2) : null;

  const subv = place.subvention;
  const residents = place.residents ?? [];
  const noMoney = !subv && residents.length === 0;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <span className="fx-sm-tag">{famLabel}</span>
        {kind && <span className="fx-sm-tag">{kind}</span>}
        {arrLabel && <span className="fx-sm-tag">{arrLabel} {en ? "district" : "arr."}</span>}
      </div>

      {place.photo && (
        <figure style={{ margin: "0 0 18px" }}>
          <img
            src={place.photo}
            alt={place.name}
            width={1200}
            height={675}
            style={{ width: "100%", height: "auto", borderRadius: 6, display: "block" }}
          />
          {cr && (
            <figcaption className="fx-chart-source" style={{ marginTop: 6 }}>
              Photo © {cr.author || (en ? "Unknown" : "Inconnu")}
              {cr.license ? ` · ${cr.license}` : ""}
              {cr.file_url && (
                <>
                  {" · "}
                  <a href={cr.file_url} target="_blank" rel="noopener noreferrer">
                    {cr.source || "Wikimedia Commons"} ↗
                  </a>
                </>
              )}
            </figcaption>
          )}
        </figure>
      )}

      {leadMain && (
        <div className="fx-fiche-lead">
          <p className="fx-fiche-lead-main">{leadMain}</p>
          {(leadSub || wikiUrl) && (
            <p className="fx-fiche-lead-sub">
              {leadSub}{leadSub ? " " : ""}
              {wikiUrl && (
                <a
                  href={wikiUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}
                >
                  {en ? "Wikipedia ↗" : "Wikipédia ↗"}
                </a>
              )}
            </p>
          )}
        </div>
      )}

      {/* Absence d'argent rattachable ≠ lieu gratuit : le fonctionnement courant
          n'est pas ventilé par lieu dans l'open data. On le dit, sinon le vide se
          lit comme « ne coûte rien ». */}
      {noMoney && (
        <p className="fx-fiche-note">
          {en
            ? "No grant is directly attached to this place. Day-to-day running costs (upkeep, staff) are not broken down by place in the open data."
            : "Aucune subvention n'est directement rattachée à ce lieu. Le fonctionnement courant (entretien, personnel) n'est pas ventilé par lieu dans l'open data."}
        </p>
      )}

      {subv && (
        <FicheSection
          title={en ? "Grants from the City" : "Subventions de la Ville"}
          sub={
            en
              ? "This place is itself a beneficiary of Ville de Marseille grants."
              : "Ce lieu est lui-même bénéficiaire de subventions de la Ville de Marseille."
          }
        >
          <FicheKpis
            items={[
              { label: en ? "Total received" : "Cumul reçu", value: eur(subv.montant_total) },
              { label: en ? "Grants" : "Subventions", value: fmtInt(subv.nb_subventions) },
            ]}
          />
          <p style={{ marginTop: 8 }}>
            <Link
              href={SUBV_HREF(subv.beneficiaire)}
              style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)", fontWeight: 600 }}
            >
              {subv.beneficiaire} →
            </Link>
            {subv.annees.length === 2 && (
              <span style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--muted)", marginLeft: 8 }}>
                {subv.annees[0] === subv.annees[1] ? subv.annees[0] : `${subv.annees[0]}–${subv.annees[1]}`}
              </span>
            )}
          </p>
          {subv.rows.length > 1 && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".07em", textTransform: "uppercase", color: "var(--bleu)", cursor: "pointer", padding: "8px 0" }}>
                {en ? `Yearly detail (${subv.rows.length})` : `Détail annuel (${subv.rows.length})`}
              </summary>
              {[...subv.rows].sort((a, b) => b.annee - a.annee).map((r) => (
                <div key={r.annee} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 4px", borderBottom: "1px solid var(--rule)", alignItems: "baseline" }}>
                  <span style={{ fontFamily: "var(--f-mono)", fontSize: 10.5, color: "var(--muted)" }}>{r.annee}</span>
                  <span className="tnum" style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 13 }}>{eur(r.montant)}</span>
                </div>
              ))}
            </details>
          )}
        </FicheSection>
      )}

      {residents.length > 0 && (
        <FicheSection
          title={en ? "Hosted here" : "Accueillis ici"}
          sub={
            en
              ? "Organisations whose grant purpose names this place — e.g. lent its rooms by the City."
              : "Organisations dont l'objet de la subvention nomme ce lieu — par exemple des salles mises à disposition par la Ville."
          }
        >
          {residents.map((r, i) => (
            <Link
              key={i}
              href={SUBV_HREF(r.beneficiaire)}
              style={{ display: "block", padding: "10px 4px", borderBottom: "1px solid var(--rule)", textDecoration: "none" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <span style={{ fontSize: 13, color: "var(--ink-2)", fontWeight: 600 }}>{r.beneficiaire} →</span>
                {r.montant_total > 0 && (
                  <span className="tnum" style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 12.5 }}>{eur(r.montant_total)}</span>
                )}
              </div>
              {r.preuve && (
                <span style={{ display: "block", fontFamily: "var(--f-mono)", fontSize: 10, letterSpacing: ".02em", color: "var(--muted)", marginTop: 3 }}>
                  {en ? "Purpose" : "Objet"} : « {r.preuve} »
                </span>
              )}
            </Link>
          ))}
        </FicheSection>
      )}

      <FicheSection title={en ? "Where" : "Où"}>
        <table className="fx-fiche-table">
          <tbody>
            {arrLabel && (
              <tr>
                <td>{en ? "District" : "Arrondissement"}</td>
                <td>{arrLabel} {en ? "district" : "arrondissement"}</td>
              </tr>
            )}
            <tr>
              <td>{en ? "Coordinates" : "Coordonnées"}</td>
              <td className="mono">
                {place.lat.toFixed(5)}, {place.lon.toFixed(5)} ·{" "}
                <a href={mapUrl} target="_blank" rel="noopener noreferrer">
                  {en ? "View on map" : "Voir sur la carte"} ↗
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </FicheSection>

      <FicheSection title={en ? "Sources" : "Sources"}>
        <p className="fx-fiche-note" style={{ marginTop: 0 }}>
          {(subv || residents.length > 0) && (
            <>
              <a
                href="https://www.data.gouv.fr/fr/datasets/subventions-versees-aux-associations-1/"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}
              >
                {en ? "City grants (data.gouv.fr) ↗" : "Subventions de la Ville (data.gouv.fr) ↗"}
              </a>
              {wikiUrl ? " · " : ""}
            </>
          )}
          {wikiUrl && (
            <a href={wikiUrl} target="_blank" rel="noopener noreferrer" style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}>
              {en ? "Wikipedia ↗" : "Wikipédia ↗"}
            </a>
          )}
          {cr?.file_url && (
            <>
              {" · "}
              <a href={cr.file_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--bleu)", borderBottom: "1px solid var(--bleu)" }}>
                Photo (Wikimedia) ↗
              </a>
            </>
          )}
        </p>
      </FicheSection>

      <p className="fx-fiche-note" style={{ marginTop: 12 }}>
        {en
          ? "Editorial selection of public and heritage places. Encyclopaedic text and photo under free Wikipedia / Wikimedia Commons licences."
          : "Sélection éditoriale de lieux publics et patrimoniaux. Texte encyclopédique et photo sous licences libres Wikipédia / Wikimedia Commons."}
      </p>
    </div>
  );
}
