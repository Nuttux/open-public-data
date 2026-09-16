"use client";

import Link from "@/components/LocalizedLink";
import type { ProjetFiche as ProjetFicheType, ProjetPhotoResolved } from "@/lib/fusion-data";
import { useCity } from "./CityContext";
import ProjetThumb from "./ProjetThumb";
import { useT, useLocale } from "@/lib/localeContext";
import { cap, fill, sufOrdinal } from "@/lib/fmt";
import { useFmtEur } from "@/lib/use-fmt";
import { trLabel } from "@/lib/label-translate";
import { rowObjet } from "@/lib/objet-normalizer";
import { V3Amt, V3Foot, V3Hero, V3Lead, V3Row, V3Section } from "@/components/fiche/v3";
import { NextDoor } from "@/components/fiche/Doors";
import { displayOrgName } from "@/lib/fournisseur-display";

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
export default function ProjetFiche({ projet, photo, lieu }: { projet: ProjetFicheType; photo?: ProjetPhotoResolved; lieu?: React.ReactNode }) {
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
      {/* Le premier écran, comme la fiche lieu : le chiffre et sa phrase à
       *  gauche, la photo à droite. Photo, phrase et chiffre s'empilaient et
       *  le chiffre arrivait sous le premier écran (962 px sur un portable). */}
      <div className="fx-lieu-hero fx-projet-hero">
        <div className="fx-lieu-hero-txt">
          <V3Hero
            v={v} u={u}
            caption={fill(t("fx.fiche.projet.hero_cap"), { year: projet.year })}
            meta={
              <>
                {projet.arrondissement > 0 ? (
                  <Link href={`${basePath}/investissements/arrondissement/${projet.arrondissement}`} scroll={false}>{arrTxt} {t("fx.fiche.projet.meta_arr")}</Link>
                ) : arrTxt}
                {/* Every word of this line that names something opens it: the rank
                 *  the arrondissement's list of the year, the chapter its fiche. */}
                {projet.arrRank && projet.arrondissement > 0 ? (
                  <> · <Link href={`${basePath}/investissements/projets/${projet.year}/${projet.arrondissement}`}>{fill(t("fx.fiche.projet.meta_rank"), { rank: `${projet.arrRank.rank}${sufOrdinal(projet.arrRank.rank, locale)}`, total: projet.arrRank.total })}</Link></>
                ) : null}
                {projet.chapitre && projet.chapitre !== "—" ? (
                  <> · {projet.chapitreSlug ? <Link href={`${basePath}/investissements/chapitre/${projet.chapitreSlug}`} scroll={false}>{trLabel(projet.chapitre, locale)}</Link> : trLabel(projet.chapitre, locale)}</>
                ) : null}
              </>
            }
          />
          {/* The way up to the section, in the first screen: readers arrive
           *  here from a search engine and leave without a second page. */}
          {projet.section ? (
            <p className="fx-fiche-secline">
              <Link href={`${basePath}/investissements?year=${projet.section.year}`}>
                {fill(t("fx.fiche.projet.section_line"), { n: numFmt(projet.section.nb), year: projet.section.year, total: `${fmtEur(projet.section.total).v} ${fmtEur(projet.section.total).u}` })}
                <span aria-hidden="true" className="muted">{" ›"}</span>
              </Link>
            </p>
          ) : null}
          {lead ? <V3Lead src={ctx || undefined}>{lead}</V3Lead> : ctx ? <p className="fx-v3-lead-src">{ctx}</p> : null}
        </div>
        <div className="fx-projet-hero-photo">
          <ProjetThumb photo={photo?.photo} generic={photo?.generic} typologie={photo?.typologie ?? vulg?.typologie_normalisee ?? null} aspectRatio="3 / 2" fallbackLabel={projet.name} className="fx-fiche-thumb" />
        </div>
      </div>

      {lieu ? <div className="fx-v3-lieu-slot">{lieu}</div> : null}

      {marches.length > 0 ? (
        <V3Section title={t("fx.fiche.projet.h.entreprises")} sub={t("fx.fiche.projet.h.entreprises_sub")}>
          {marches.map((m) => {
            const clair = en ? m.objet_clair_en || m.objet_clair : m.objet_clair;
            const clean = clair || rowObjet(m.objet, 96).title;
            const bits = [
              clean.length > 120 ? clean.slice(0, 120) + "…" : clean,
              [m.annee, m.label === "confirmed" ? t("fx.fiche.projet.confidence.confirmed").toLowerCase() : t("fx.fiche.projet.confidence.probable").toLowerCase(),
               m.offres_recues != null && m.offres_recues > 0 ? (m.offres_recues === 1 ? t("fx.fiche.contrat.conc.offre_one") : fill(t("fx.fiche.contrat.conc.offres_n"), { n: m.offres_recues })) : null,
              ].filter(Boolean).join(" · "),
            ];
            // La rangée ouvre le contrat : son libellé est donc le contrat, le
            // titulaire passe en sous-ligne. On cliquait « Bouygues » et on
            // arrivait sur un contrat, pas sur l'entreprise.
            return (
              <V3Row key={m.numero_marche} href={`${basePath}/marches/contrat/${encodeURIComponent(m.numero_marche)}`}
                label={bits[0]}
                subText={[m.fournisseur_nom ? displayOrgName(m.fournisseur_nom) : t("fx.fiche.projet.fournisseur_unknown"), bits[1]].filter(Boolean).join(" · ")}
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
          {/* Rows with their image: on this site the photos are what get clicked. */}
          <div className="fx-fiche-thumbrows">
            {projet.similaires.map((s) => (
              <Link key={s.id} href={`${basePath}/investissements/projet/${encodeURIComponent(s.id)}`} scroll={false} className="fx-fiche-thumbrow">
                <span className="im"><ProjetThumb photo={s.photo.photo} generic={s.photo.generic} typologie={s.photo.typologie ?? s.typologie} aspectRatio="4 / 3" sizes="88px" fallbackLabel={s.name} /></span>
                <span className="tx">
                  <span className="t">{en && s.name_en ? s.name_en : s.name} <span aria-hidden="true" className="muted">›</span></span>
                  {s.arrondissement > 0 ? <span className="s">{s.arrondissement}{sufOrdinal(s.arrondissement, locale)}</span> : null}
                </span>
                <V3Amt {...fmtEur(s.montant)} />
              </Link>
            ))}
          </div>
        </V3Section>
      )}

      {/* The way out that is not the footer: the next project of the same
       *  arrondissement, like the next section at the foot of a page. */}
      {projet.next ? (
        <NextDoor
          href={`${basePath}/investissements/projet/${encodeURIComponent(projet.next.id)}`}
          kicker={fill(t("fx.fiche.projet.next_kicker"), { arr: `${projet.next.arrondissement}${sufOrdinal(projet.next.arrondissement, locale)}` })}
          title={en && projet.next.name_en ? projet.next.name_en : projet.next.name}
          sub={fill(t("fx.fiche.projet.meta_rank"), { rank: `${projet.next.rank}${sufOrdinal(projet.next.rank, locale)}`, total: projet.next.total })}
          value={fmtEur(projet.next.montant).v}
          unit={fmtEur(projet.next.montant).u}
        />
      ) : null}

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
