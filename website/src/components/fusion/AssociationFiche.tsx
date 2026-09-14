"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AssociationFiche as AssociationFicheType, BeneficiaireGrounded, SubventionVulgarization } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { citySlugFromPathname } from "@/lib/methodology";
import { cap, fill, sufOrdinal } from "@/lib/fmt";
import { useFmtEur } from "@/lib/use-fmt";
import { slugifyLabel } from "@/lib/projet-utils";
import { trLabel } from "@/lib/label-translate";
import { FicheBreakdown } from "@/components/fiche";
import type { FicheBreakdownRow } from "@/components/fiche";
import { V3Amt, V3Fold, V3Foot, V3Hero, V3Lead, V3Row, V3Section, foldRest } from "@/components/fiche/v3";
import YearBars from "./YearBars";
import AnneesRail, { RAIL_MIN } from "./AnneesRail";
import { displayOrgName } from "@/lib/fournisseur-display";

/** Source réelle des subventions : dataset "versées annexe CA" (les noms de
 * l'export en sont issus verbatim, le refine matche donc exactement).
 * Exception 2020-2021 : ces exercices viennent du PDF B8.1.1 du compte
 * administratif (le dataset opendata ne contient que les prestations en
 * nature sur ces deux années). */
const SUBV_DATASET =
  "https://opendata.paris.fr/explore/dataset/subventions-versees-annexe-compte-administratif-a-partir-de-2018/table/";
const B811_PDF: Record<number, string> = {
  2020: "https://cdn.paris.fr/paris/2021/06/29/6af66b077794b1079d192c1d50df98f4.pdf",
  2021: "https://cdn.paris.fr/paris/2022/06/28/358d098a9a8a7bc4feb74399c61fd634.pdf",
};

function subvSourceUrl(name: string, year?: number): { href: string; isPdf: boolean } {
  if (year != null && B811_PDF[year]) return { href: B811_PDF[year], isPdf: true };
  const nom = `refine.nom_de_l_organisme_beneficiaire=${encodeURIComponent(name)}`;
  if (year == null) return { href: `${SUBV_DATASET}?${nom}`, isPdf: false };
  const pub = year >= 2022 ? String(year) : `CA ${year}`;
  return { href: `${SUBV_DATASET}?refine.publication=${encodeURIComponent(pub)}&${nom}`, isPdf: false };
}

/** `secteurs` arrive parfois sérialisé (`["Culture & Arts"]`) : on le lit. */
function secteursTxt(s?: string | null): string | null {
  if (!s) return null;
  const t = s.trim();
  if (t.startsWith("[")) {
    try { const arr = JSON.parse(t); if (Array.isArray(arr)) return arr.filter(Boolean).join(", ") || null; } catch { /* brut */ }
  }
  return t || null;
}

const LIGNES_CAP = 5;

/**
 * Fiche association v3 (2026-09-03) — sur le kit `fiche/v3` : une phrase
 * (activité vérifiée, sinon vulgarisation), UN chiffre (cumul versé) avec
 * son rang dans le thème en lien, puis « Année par année », « Qui verse »,
 * « Pour quoi » (cliquable vers le thème) et « Le détail, ligne par ligne »
 * en rangées au lieu d'un tableau. Le bandeau KPI à quatre cellules et les
 * encadrés disparaissent ; tous les liens de navigation restent.
 */
export default function AssociationFiche({
  asso,
  vulgarization,
  grounded,
  lieu,
}: {
  asso: AssociationFicheType;
  vulgarization?: SubventionVulgarization | null;
  grounded?: BeneficiaireGrounded | null;
  /** Carte du lieu que ce bénéficiaire exploite, posée sous le chiffre. */
  lieu?: React.ReactNode;
}) {
  const t = useT();
  const { locale } = useLocale();
  const en = locale === "en";
  const fmtEur = useFmtEur();
  const citySlug = citySlugFromPathname(usePathname());
  const isParis = citySlug === "paris";
  const cityDatagouvUrl = `https://www.data.gouv.fr/fr/datasets/?q=${encodeURIComponent(`${citySlug} subventions`)}`;

  const { v: vTot, u: uTot } = fmtEur(asso.totalAmount);
  const firstYear = asso.yearsActive[0];
  const lastYear = asso.yearsActive[asso.yearsActive.length - 1];
  const maxByYear = Math.max(...asso.byYear.map((y) => y.amount), 1);
  const eurTxt = (n: number) => { const f = fmtEur(n); return `${f.v} ${f.u}`; };

  /* ── La phrase de tête : activité vérifiée (grounded) sinon vulgarisation ── */
  const useGrounded = !!grounded && (grounded.confiance ?? 0) >= 0.6 && !!grounded.activite_verifiee;
  const leadText = useGrounded
    ? cap(en && grounded!.activite_verifiee_en ? grounded!.activite_verifiee_en : grounded!.activite_verifiee)
    : vulgarization
      ? [cap(en && vulgarization.activite_claire_en ? vulgarization.activite_claire_en : vulgarization.activite_claire),
         cap(en && vulgarization.pourquoi_subvention_en ? vulgarization.pourquoi_subvention_en : vulgarization.pourquoi_subvention)]
          .filter(Boolean).join(" ")
      : null;
  const srcBits: React.ReactNode[] = [];
  if (asso.natureJuridique) srcBits.push(<span key="nj">{asso.natureJuridique}</span>);
  if (useGrounded && grounded!.perimetre_geographique) {
    srcBits.push(<span key="pg">{t("fx.fiche.asso.scope_label")} : {en && grounded!.perimetre_geographique_en ? grounded!.perimetre_geographique_en : grounded!.perimetre_geographique}</span>);
  }
  // Le titre met le nom en casse lisible ; la graphie de la source reste dite ici.
  if (displayOrgName(asso.name) !== asso.name) {
    srcBits.push(<span key="nom">{fill(t("fx.fiche.asso.nom_source"), { nom: asso.name })}</span>);
  }
  if (useGrounded && grounded!.sources && grounded!.sources.length > 0) {
    srcBits.push(
      <span key="src">
        {t("fx.fiche.asso.sources_label")} :{" "}
        {grounded!.sources.map((src, i) => {
          const s = typeof src === "string" ? { title: src } : src;
          const label = s.title || s.url || "";
          const href = s.url || (label.includes(".") ? `https://${label.replace(/^https?:\/\//, "")}` : undefined);
          return (
            <span key={i}>
              {i > 0 ? ", " : ""}
              {href ? <a href={href} target="_blank" rel="noopener noreferrer">{label}</a> : label}
            </span>
          );
        })}
      </span>,
    );
  }

  /* ── Répartitions ─────────────────────────────────────────────────────── */
  const byDirection: FicheBreakdownRow[] = (() => {
    const m = new Map<string, number>();
    for (const l of asso.lignes) { if (l.direction) m.set(l.direction, (m.get(l.direction) ?? 0) + l.amount); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ key: label, label, value }));
  })();
  const directionKnown = byDirection.reduce((s, r) => s + r.value, 0);
  const directionUnknown = Math.max(0, asso.totalAmount - directionKnown);
  const themeHref = (theme: string) => `/fr/city/${citySlug}/subventions/theme/${slugifyLabel(theme)}`;
  const byTheme: FicheBreakdownRow[] = asso.byTheme.slice().sort((a, b) => b.amount - a.amount)
    .map((th) => ({ key: th.theme, label: trLabel(th.theme, locale), value: th.amount, href: themeHref(th.theme) }));

  /* ── Le détail : un tableau qui redit les barres n'apporte rien ─────────
   * (la fiche CASVP affichait cinq fois le même motif sous cinq barres qui
   * portaient déjà les montants). Quand rien ne varie, une phrase suffit. */
  const motifOf = (l: AssociationFicheType["lignes"][number]) => l.objet || l.subCategory || null;
  const motifs = new Set(asso.lignes.map(motifOf).filter(Boolean) as string[]);
  // Une année à deux lignes agrégées (nb > 1) ne change pas le motif : elle
  // ne justifie pas un tableau. Seuls un motif qui varie ou des secteurs
  // renseignés apportent quelque chose que les barres n'ont pas.
  const tableIsRepetition =
    asso.lignes.length > 1 && asso.lignes.length === asso.byYear.length &&
    !asso.lignes.some((l) => secteursTxt(l.secteurs)) && motifs.size <= 1;
  const singleMotif = tableIsRepetition ? ([...motifs][0] ?? null) : null;
  const singleDirection = byDirection.length === 1 ? byDirection[0].key : null;

  const yearsDesc = asso.byYear.slice().reverse();
  const lignes = foldRest(asso.lignes, LIGNES_CAP);
  const LigneRow = (l: AssociationFicheType["lignes"][number], i: number) => {
    const src = isParis ? subvSourceUrl(asso.name, l.year) : { href: cityDatagouvUrl, isPdf: false };
    const motif = l.objet || l.subCategory || null;
    const bits = [String(l.year), l.direction, l.nb > 1 ? fill(t("fx.fiche.asso.lignes_n"), { n: l.nb }) : null, secteursTxt(l.secteurs)].filter(Boolean);
    return (
      <V3Row key={i} href={src.href} external label={motif ? (motif.length > 110 ? motif.slice(0, 110) + "…" : motif) : <span className="muted">—</span>}
        subText={bits.join(" · ")} amount={<V3Amt {...fmtEur(l.amount)} />} />
    );
  };

  const yearBars = (rows: typeof yearsDesc) => (
    <YearBars rows={rows} max={maxByYear} countLabel={(y) => ((y.count ?? 0) > 1 ? <span className="muted">{y.count} {t("fx.fiche.asso.sub")}</span> : null)} />
  );

  return (
    <div className="fx-v3">
      {leadText && <V3Lead src={srcBits.length ? srcBits.map((b, i) => <span key={i}>{i > 0 ? " · " : ""}{b}</span>) : undefined}>{leadText}</V3Lead>}
      {!leadText && srcBits.length > 0 && <p className="fx-v3-lead-src">{srcBits.map((b, i) => <span key={i}>{i > 0 ? " · " : ""}{b}</span>)}</p>}

      <V3Hero
        v={vTot} u={uTot}
        caption={firstYear && lastYear && firstYear !== lastYear
          ? fill(t("fx.fiche.asso.hero_cap"), { from: firstYear, to: lastYear })
          : fill(t("fx.fiche.asso.hero_cap_one"), { year: lastYear ?? "—" })}
        meta={
          <>
            {fill(t(asso.subventionCount === 1 ? "fx.fiche.asso.meta_n1" : "fx.fiche.asso.meta_n"), { n: asso.subventionCount })}
            {asso.themeRank && (
              <>
                {" · "}
                <Link href={themeHref(asso.themeRank.theme)} scroll={false}>
                  {fill(t("fx.fiche.asso.meta_rank"), { rank: `${asso.themeRank.rank}${sufOrdinal(asso.themeRank.rank, locale)}`, total: asso.themeRank.total, theme: trLabel(asso.themeRank.theme, locale) })} →
                </Link>
              </>
            )}
          </>
        }
      />

      {lieu ? <div className="fx-v3-lieu-slot">{lieu}</div> : null}

      {asso.byYear.length > 1 && (
        <V3Section title={t("fx.fiche.asso.h.annees")}>
          {/* Le rail porte les montants (bouts de l'axe, survol, clic) : la liste
              année par année le redoublait. Elle ne reste que là où il n'y a
              pas assez d'exercices pour dessiner une forme. */}
          {yearsDesc.length >= RAIL_MIN ? (
            <AnneesRail rows={yearsDesc.map((y) => ({ year: y.year, amount: y.amount, count: y.count }))}
                        delibs={asso.delibsParAnnee ?? null}
                        countText={(r) => ((r.count ?? 0) > 1 ? fill(t("fx.fiche.theme.subv_n"), { n: r.count ?? 0 }) : null)} />
          ) : yearBars(yearsDesc)}
        </V3Section>
      )}

      {byDirection.length > 1 && (
        <V3Section title={t("fx.fiche.asso.h.qui")}>
          <FicheBreakdown rows={byDirection} format={eurTxt}
            footer={directionUnknown > 0 ? fill(t("fx.fiche.asso.direction_unknown"), { amount: eurTxt(directionUnknown) }) : undefined} />
        </V3Section>
      )}

      {byTheme.length > 1 && (
        <V3Section title={t("fx.fiche.asso.h.pourquoi")} sub={t("fx.fiche.asso.h.pourquoi_sub")}>
          <FicheBreakdown rows={byTheme} format={eurTxt} />
        </V3Section>
      )}

      {(tableIsRepetition && singleMotif) ? (
        <V3Section title={t("fx.fiche.asso.h.detail")}>
          <p className="fx-v3-sentence">
            {fill(t("fx.fiche.asso.objet_identique"), { n: asso.lignes.length })} <b>{singleMotif}</b>
            {singleDirection ? <> · {fill(t("fx.fiche.asso.verse_par"), { d: singleDirection })}</> : null}
          </p>
        </V3Section>
      ) : asso.lignes.length === 1 ? (
        // Une seule ligne : une rangée redirait le chiffre héros. Une phrase
        // avec le motif et le lien source suffit.
        <V3Section title={t("fx.fiche.asso.h.detail")}>
          <p className="fx-v3-sentence">
            {fill(t("fx.fiche.asso.ligne_unique"), { y: asso.lignes[0].year })} <b>{motifOf(asso.lignes[0]) ?? "—"}</b>
            {asso.lignes[0].direction ? <> · {fill(t("fx.fiche.asso.verse_par"), { d: asso.lignes[0].direction })}</> : null}
            {" · "}
            <a href={(isParis ? subvSourceUrl(asso.name, asso.lignes[0].year) : { href: cityDatagouvUrl }).href} target="_blank" rel="noopener noreferrer">{t("fx.fiche.asso.source_lien")}</a>
          </p>
        </V3Section>
      ) : asso.lignes.length > 0 && (
        <V3Section title={t("fx.fiche.asso.h.detail")} sub={t("fx.fiche.asso.h.detail_sub")}>
          {lignes.shown.map(LigneRow)}
          {lignes.rest.length > 0 && (
            <V3Fold text label={fill(t("fx.fiche.asso.fold_lignes"), { n: lignes.rest.length })}>{lignes.rest.map((l, i) => LigneRow(l, i + LIGNES_CAP))}</V3Fold>
          )}
        </V3Section>
      )}

      <V3Foot>
        {isParis ? t("fx.fiche.asso.note") : t("fx.fiche.asso.note.generic")}{" "}
        {(() => {
          const pdfOnly = isParis && asso.yearsActive.every((y) => B811_PDF[y]);
          const href = !isParis ? cityDatagouvUrl : pdfOnly ? B811_PDF[Math.max(...asso.yearsActive)] : subvSourceUrl(asso.name).href;
          const label = !isParis ? "data.gouv.fr ↗" : pdfOnly ? "cdn.paris.fr (PDF) ↗" : "opendata.paris.fr ↗";
          return <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>;
        })()}.
      </V3Foot>
    </div>
  );
}
