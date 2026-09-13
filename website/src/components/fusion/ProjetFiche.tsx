"use client";

import Link from "@/components/LocalizedLink";
import type { ProjetFiche as ProjetFicheType, ProjetPhotoResolved } from "@/lib/fusion-data";
import { useCity } from "./CityContext";
import ProjetThumb from "./ProjetThumb";
import { useT, useLocale } from "@/lib/localeContext";
import { cap, fill, sufOrdinal } from "@/lib/fmt";
import { useFmtEur } from "@/lib/use-fmt";
import { trLabel } from "@/lib/label-translate";
import { normalizeObjet } from "@/lib/objet-normalizer";
import { V3Amt, V3Foot, V3Hero, V3Lead, V3Row, V3Section } from "@/components/fiche/v3";

const TYPOLOGIE_LABELS_FR: Record<string, string> = {
  ecole: "École", college: "Collège", lycee: "Lycée", creche: "Crèche", gymnase: "Gymnase", piscine: "Piscine",
  bibliotheque: "Bibliothèque", "espace-vert": "Espace vert", voirie: "Voirie", "logement-social": "Logement social",
  "equipement-culturel": "Équipement culturel", "equipement-sante": "Équipement santé", administration: "Administration", autre: "Autre",
};
const TYPOLOGIE_LABELS_EN: Record<string, string> = {
  ecole: "School", college: "Secondary school", lycee: "High school", creche: "Nursery", gymnase: "Gym", piscine: "Swimming pool",
  bibliotheque: "Library", "espace-vert": "Green space", voirie: "Roads", "logement-social": "Social housing",
  "equipement-culturel": "Cultural facility", "equipement-sante": "Health facility", administration: "Administration", autre: "Other",
};

/**
 * Fiche projet v3 (2026-09-03) — sur le kit `fiche/v3` : photo, la phrase
 * de vulgarisation, UN chiffre (le montant voté) avec l'exercice, le chapitre
 * et le rang dans l'arrondissement en lien, puis « Les entreprises qui y
 * travaillent » (rangées qui ouvrent chaque contrat, titulaire en titre) et
 * « Autres projets du même type ». « ID interne » et « fiabilité extraction »
 * ne sont plus des rangées : une phrase de prudence en pied quand la lecture
 * du PDF est jugée fragile, et la page source reste liée.
 */
export default function ProjetFiche({ projet, photo }: { projet: ProjetFicheType; photo?: ProjetPhotoResolved }) {
  const t = useT();
  const { locale } = useLocale();
  const { basePath } = useCity();
  const en = locale === "en";
  const TYPOLOGIE_LABELS = en ? TYPOLOGIE_LABELS_EN : TYPOLOGIE_LABELS_FR;
  const fmtEur = useFmtEur();
  const { v, u } = fmtEur(projet.montant);
  const mapUrl = projet.lat && projet.lon ? `https://www.openstreetmap.org/?mlat=${projet.lat}&mlon=${projet.lon}#map=17/${projet.lat}/${projet.lon}` : null;
  const vulg = projet.vulgarization;
  const typoLabel = vulg?.typologie_normalisee ? TYPOLOGIE_LABELS[vulg.typologie_normalisee] ?? vulg.typologie_normalisee : null;
  const descClair = vulg ? cap(en && vulg.description_claire_en ? vulg.description_claire_en : vulg.description_claire) : null;
  const quoi = vulg ? cap(en && vulg.quoi_concretement_en ? vulg.quoi_concretement_en : vulg.quoi_concretement) : null;
  const lead = [descClair, quoi].filter(Boolean).join(" ");
  const ctx = [typoLabel, projet.typeAp ? trLabel(projet.typeAp, locale).replace(/_/g, " ") : null].filter(Boolean).join(" · ");
  const arrTxt = projet.arrondissement > 0 ? `${projet.arrondissement}${sufOrdinal(projet.arrondissement, locale)}` : t("fx.fiche.projet.transverse");
  const marches = [...projet.marches].sort((a, b) => (b.montant_max ?? 0) - (a.montant_max ?? 0));
  const fragile = projet.confidence != null && projet.confidence < 0.7;
  const numFmt = (n: number) => new Intl.NumberFormat(en ? "en-GB" : "fr-FR").format(n);

  return (
    <div className="fx-v3">
      <div className="fx-fiche-thumb-wrap">
        <ProjetThumb photo={photo?.photo} generic={photo?.generic} typologie={photo?.typologie ?? vulg?.typologie_normalisee ?? null} aspectRatio="2.2 / 1" fallbackLabel={projet.name} className="fx-fiche-thumb" />
      </div>

      {lead ? <V3Lead src={ctx || undefined}>{lead}</V3Lead> : ctx ? <p className="fx-v3-lead-src">{ctx}</p> : null}

      <V3Hero
        v={v} u={u}
        caption={fill(t("fx.fiche.projet.hero_cap"), { year: projet.year })}
        meta={
          <>
            {projet.arrondissement > 0 ? (
              <Link href={`${basePath}/investissements/arrondissement/${projet.arrondissement}`} scroll={false}>{arrTxt} {t("fx.fiche.projet.meta_arr")}</Link>
            ) : arrTxt}
            {projet.arrRank && projet.arrondissement > 0 ? ` · ${fill(t("fx.fiche.projet.meta_rank"), { rank: `${projet.arrRank.rank}${sufOrdinal(projet.arrRank.rank, locale)}`, total: projet.arrRank.total })}` : ""}
            {projet.chapitre ? ` · ${trLabel(projet.chapitre, locale)}` : ""}
          </>
        }
      />

      {marches.length > 0 ? (
        <V3Section title={t("fx.fiche.projet.h.entreprises")} sub={t("fx.fiche.projet.h.entreprises_sub")}>
          {marches.map((m) => {
            const clair = en ? m.objet_clair_en || m.objet_clair : m.objet_clair;
            const clean = clair || normalizeObjet(m.objet);
            const bits = [
              clean.length > 120 ? clean.slice(0, 120) + "…" : clean,
              [m.annee, m.label === "confirmed" ? t("fx.fiche.projet.confidence.confirmed").toLowerCase() : t("fx.fiche.projet.confidence.probable").toLowerCase(),
               m.offres_recues != null && m.offres_recues > 0 ? (m.offres_recues === 1 ? t("fx.fiche.contrat.conc.offre_one") : fill(t("fx.fiche.contrat.conc.offres_n"), { n: m.offres_recues })) : null,
              ].filter(Boolean).join(" · "),
            ];
            return (
              <V3Row key={m.numero_marche} href={`${basePath}/marches/contrat/${encodeURIComponent(m.numero_marche)}`}
                label={<span style={{ fontWeight: 600, color: "var(--ink)" }}>{m.fournisseur_nom || t("fx.fiche.projet.fournisseur_unknown")}</span>}
                subText={<>{bits[0]}<br />{bits[1]}</>}
                amount={<V3Amt {...fmtEur(m.montant_max)} />} />
            );
          })}
        </V3Section>
      ) : projet.marchesCoverage.total > 0 && (
        <V3Section title={t("fx.fiche.projet.h.entreprises")}>
          <p className="fx-v3-sentence" style={{ color: "var(--muted)" }}>
            {fill(t("fx.fiche.projet.entreprises_empty_body"), { pct: projet.marchesCoverage.pct.toFixed(0), matched: numFmt(projet.marchesCoverage.matched), total: numFmt(projet.marchesCoverage.total), minYear: projet.marchesCoverage.scopeYears[0], maxYear: projet.marchesCoverage.scopeYears[1] })}
          </p>
        </V3Section>
      )}

      {projet.similaires.length > 0 && typoLabel && (
        <V3Section title={fill(t("fx.fiche.projet.similaires"), { typo: typoLabel.toLowerCase(), year: projet.year })}>
          {projet.similaires.map((s) => (
            <V3Row key={s.id} href={`${basePath}/investissements/projet/${encodeURIComponent(s.id)}`}
              label={en && s.name_en ? s.name_en : s.name}
              sub={s.arrondissement > 0 ? `${s.arrondissement}${sufOrdinal(s.arrondissement, locale)}` : undefined}
              amount={<V3Amt {...fmtEur(s.montant)} />} />
          ))}
        </V3Section>
      )}

      <V3Foot>
        {projet.geoLabel && <>{projet.geoLabel}{mapUrl ? " · " : ""}</>}
        {mapUrl && <a href={mapUrl} target="_blank" rel="noopener noreferrer">{t("fx.fiche.projet.voir_osm")}</a>}
        {(projet.geoLabel || mapUrl) && <br />}
        {t("fx.fiche.projet.note_surcout_v3")}{" "}
        {projet.sourcePdf && (
          <a href={projet.sourcePdf} target="_blank" rel="noopener noreferrer">
            {fill(t("fx.fiche.projet.annexe"), { year: projet.year })}{projet.sourcePage ? ` ${fill(t("fx.fiche.projet.pdf_page"), { n: projet.sourcePage })}` : ""} ↗
          </a>
        )}
        {fragile && <> {fill(t("fx.fiche.projet.fragile"), { n: ((projet.confidence ?? 0) * 100).toFixed(0) })}</>}
      </V3Foot>
    </div>
  );
}
