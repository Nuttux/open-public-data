"use client";

import { useState } from "react";
import Link from "@/components/LocalizedLink";
import type { BudgetPosteFiche, BudgetPosteSubPoste, PosteLink } from "@/lib/fusion-data";
import { useT, useLocale } from "@/lib/localeContext";
import { fill, numLocale, sufOrdinal } from "@/lib/fmt";
import { V3Foot, V3Fold, V3Section } from "@/components/fiche/v3";
import posteLabels from "@/data/poste-labels.json";
import fonctionLabels from "@/data/budget-fonction-labels.json";
import { NATURE_GROUPS, natureOfFlow, type NatureKey } from "@/lib/budget-natures";

type Props = { poste: BudgetPosteFiche };
type FonctionLabel = { fr: string; en: string; sub_fr?: string; sub_en?: string };
const FONCTIONS: Record<string, FonctionLabel> = fonctionLabels as Record<string, FonctionLabel>;
const FLOW_SHORT_FR: Record<string, string> = posteLabels.FLOW_SHORT_FR;
const FLOW_SHORT_EN: Record<string, string> = posteLabels.FLOW_SHORT_EN;
const LABEL_PREFIX_EN: Record<string, string> = posteLabels.LABEL_PREFIX_EN;
const LABEL_LEAF_EN: Record<string, string> = posteLabels.LABEL_LEAF_EN;

const MISSIONS_CAP = 6;
const KEEP_CAPS = new Set(["Paris", "France", "Île-de-France", "État", "Etat", "Conseil", "FNGIR", "RSA", "APA", "PMI", "URSSAF", "U.R.S.S.A.F."]);
/** Met en minuscule les mots capitalisés d'un libellé (« Fiscalité Directe » →
 *  « fiscalité directe ») en gardant sigles et noms propres, pour l'insérer
 *  dans une phrase. */
function inSentence(label: string): string {
  return label.replace(/[A-ZÀ-Ý][a-zà-ÿ'’]+/g, (w) => (KEEP_CAPS.has(w) ? w : w.toLowerCase()));
}
/** Sous-ligne automatique : la plus grosse ligne, coupée à son premier tiret
 *  et à 70 caractères, jamais quand elle redit la mission elle-même. */
function autoSub(name: string, mission: string): string | null {
  let n = name.split(" - ")[0].replace(/:\s*/, " : ").trim();
  if (n.length > 70) n = n.slice(0, 70).replace(/\s+\S*$/, "") + "…";
  const bare = n.replace(/^.*? : /, "");
  if (!bare || bare.toLowerCase() === mission.toLowerCase() || mission.toLowerCase().includes(bare.toLowerCase())) return null;
  return inSentence(n);
}

function labelEn(label: string): string {
  if (LABEL_LEAF_EN[label]) return LABEL_LEAF_EN[label];
  const i = label.indexOf(": ");
  if (i > 0) return `${LABEL_PREFIX_EN[label.slice(0, i)] ?? label.slice(0, i)}: ${labelEn(label.slice(i + 2))}`;
  return label;
}

type Line = { name: string; value: number; flow?: string; original?: string };
type Mission = { key: string; label: string; sub: string | null; total: number; items: Line[]; imputed: boolean };

/**
 * Regroupe les lignes par mission (fonction M57) côté dépenses, par préfixe
 * « Fiscalité directe : … » côté recettes. Libellé clair depuis la table
 * `budget-fonction-labels.json`, repli sur le libellé officiel ; sous-ligne
 * de la table quand on l'a écrite, sinon « dont {plus grosse ligne} ».
 */
function groupMissions(poste: BudgetPosteFiche, locale: "fr" | "en", fmt: (n: number) => string, t: (k: string) => string): Mission[] {
  const byFonction = poste.kind === "depense" && poste.subPostes.some((s) => s.fonction);
  const map = new Map<string, Mission>();
  const prefix = `${poste.label}: `;
  poste.subPostes.forEach((it: BudgetPosteSubPoste) => {
    let key: string; let name: string;
    if (byFonction) {
      key = it.fonction === "Non spécifié" && it.flow_category ? it.flow_category : it.fonction || "Autres";
      name = it.name.startsWith(prefix) ? it.name.slice(prefix.length) : it.name;
    } else {
      const i = it.name.indexOf(":");
      key = i > 0 ? it.name.slice(0, i).trim() : "—";
      name = i > 0 ? it.name.slice(i + 1).trim() : it.name.trim();
    }
    // Le préfixe technique d'une ligne (« Invest. Aménagement: … ») n'est pas
    // toujours celui du poste ; on le retire dans tous les cas, la nature à
    // droite (« subv. invest. ») dit déjà de quoi il s'agit.
    if (byFonction) { const j = name.indexOf(": "); if (j > 0) name = name.slice(j + 2); }
    let m = map.get(key);
    if (!m) {
      const fl = FONCTIONS[key];
      m = { key, label: fl ? (locale === "en" ? fl.en : fl.fr) : (locale === "en" ? (posteLabels.FONCTION_EN as Record<string, string>)[key] ?? key : key), sub: fl ? (locale === "en" ? fl.sub_en ?? null : fl.sub_fr ?? null) : null, total: 0, items: [], imputed: false };
      map.set(key, m);
    }
    m.total += it.value;
    let original: string | undefined;
    if (it.name_original && it.name_original !== it.name) original = it.name_original.startsWith(prefix) ? it.name_original.slice(prefix.length) : it.name_original;
    m.items.push({ name: locale === "en" ? labelEn(name) : name, value: it.value, flow: byFonction ? it.flow_category : undefined, original });
    if (it.fonction_imputed) m.imputed = true;
  });
  const missions = [...map.values()].sort((a, b) => b.total - a.total);
  // « Opérations non ventilables » ne dit rien : quand 80 % des lignes sont
  // d'un même flux (péréquation, dette…), la mission prend le nom du flux.
  const FLOW_MISSION: Record<string, { fr: string; en: string }> = {
    "Reversements péréquation": { fr: "Reversements à l'État et aux autres collectivités", en: "Transfers to the State and other local authorities" },
    "Remboursement dette": { fr: "Remboursement de la dette", en: "Debt repayment" },
    "Charges financières": { fr: "Intérêts de la dette", en: "Debt interest" },
    "Dotations arrondissements": { fr: "Dotations aux arrondissements", en: "Allocations to the arrondissements" },
  };
  for (const m of missions) {
    if (m.key === "Opérations non ventilable" && m.total > 0) {
      const byFlow = new Map<string, number>();
      for (const it of m.items) byFlow.set(it.flow ?? "", (byFlow.get(it.flow ?? "") ?? 0) + it.value);
      const [flow, v] = [...byFlow.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
      const fm = FLOW_MISSION[flow];
      if (fm && v / m.total >= 0.8) m.label = locale === "en" ? fm.en : fm.fr;
    }
    m.items.sort((a, b) => b.value - a.value);
    if (!m.sub && m.items.length > 1 && m.items[0].value / m.total >= 0.5) {
      const l = autoSub(m.items[0].name, m.label);
      // Redite quand la ligne porte le même mot que sa nature (« subventions
      // d'investissement » sous « subv. invest. ») : on garde quand même, c'est
      // le montant qui informe ; mais jamais si la ligne redit la mission.
      if (l) m.sub = fill(t("fx.poste.v3.dont"), { l, m: fmt(m.items[0].value) });
    }
  }
  return missions;
}

/**
 * Fiche de poste budgétaire v3 (2026-09-04) — pensée depuis les trois
 * questions d'un lecteur qui clique un poste : c'est quoi (une phrase tirée
 * des missions), c'est beaucoup et ça monte (le chiffre, deux repères, la
 * tendance en barres), ça sert à quoi (les missions en barres, dépliables).
 * Puis les pages du site où le même argent se retrouve, bénéficiaire par
 * bénéficiaire — vérifiées, jamais déduites (budget-poste-links.ts).
 */
export default function PosteFiche({ poste }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const fl: "fr" | "en" = locale === "en" ? "en" : "fr";
  const locStr = numLocale(fl);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const fmtM = (n: number) => `${Math.round(n / 1e6).toLocaleString(locStr)} M €`;
  const fmtAmt = (n: number): { v: string; u: string } =>
    n >= 1e9 ? { v: new Intl.NumberFormat(locStr, { maximumFractionDigits: 2 }).format(n / 1e9), u: t("fx.s.md_eur") } : { v: Math.round(n / 1e6).toLocaleString(locStr), u: t("fx.s.m_eur") };
  const pct1 = (n: number) => n.toFixed(1).replace(".", fl === "en" ? "." : ",");
  const dep = poste.kind === "depense";

  const missions = groupMissions(poste, fl, fmtM, t);
  const shown = missions.slice(0, MISSIONS_CAP);
  const rest = missions.slice(MISSIONS_CAP);
  const shownPct = poste.total > 0 ? Math.round((shown.reduce((s, m) => s + m.total, 0) / poste.total) * 100) : 0;
  const maxMission = Math.max(...missions.map((m) => m.total), 1);
  const hasImputed = missions.some((m) => m.imputed);
  // Recettes à deux groupes ou moins (Impôts, Dotations, Emprunts) : les vraies
  // lignes — taxe foncière, droits de mutation — ne doivent pas être derrière
  // un clic. On les montre à plat, le groupe en sous-ligne.
  // … et un poste de dépense à mission unique (« Reversements à l'État et
  // aux communes » : tout est péréquation) montre ses lignes directement.
  const isFlat = (missions.length === 1 && missions[0].key === "—") || (!dep && missions.length <= 2) || (dep && missions.length === 1);
  const flatLines = isFlat ? missions.flatMap((m) => m.items.map((it) => ({ ...it, group: m.key === "—" ? null : m.label }))).sort((a, b) => b.value - a.value) : [];
  const flatShown = flatLines.slice(0, 8);
  const flatRest = flatLines.slice(8);

  const { v, u } = fmtAmt(poste.total);
  // Sous quelle forme ce poste sort : les lignes du poste par nature, la même
  // table que le ruban de la page budget. Chaque nature ouvre sa fiche.
  const natureRows = (() => {
    if (!dep || !poste.subPostes.some((s) => s.flow_category)) return [];
    const acc = new Map<NatureKey, number>();
    for (const it of poste.subPostes) { const k = natureOfFlow(it.flow_category); acc.set(k, (acc.get(k) ?? 0) + it.value); }
    const tot = [...acc.values()].reduce((a, b) => a + b, 0);
    return NATURE_GROUPS.map((g) => ({ key: g.key, color: g.color, value: acc.get(g.key) ?? 0 }))
      .filter((g) => g.value > 0)
      .map((g) => ({ ...g, pct: tot > 0 ? Math.round((g.value / tot) * 100) : 0 }))
      .filter((g) => g.pct >= 1);
  })();
  const first = poste.series[0];
  const deltaSince = first && first.year !== poste.year && first.value > 0 ? ((poste.total - first.value) / first.value) * 100 : null;
  const signed = (x: number) => `${x >= 0 ? "+" : "−"}${pct1(Math.abs(x))} %`;
  const maxSeries = Math.max(...poste.series.map((s) => s.value), 1);
  const leadRaw = missions.slice(0, 4).map((m) => inSentence(m.label)).join(", ");
  const lead = leadRaw.charAt(0).toUpperCase() + leadRaw.slice(1);
  const rankTxt = `${poste.rank}${sufOrdinal(poste.rank, fl)}`;

  const Row = (m: Mission) => {
    const isOpen = open.has(m.key);
    return (
      <div key={m.key}>
        <button type="button" className={`fx-v3-mission${isOpen ? " open" : ""}`} onClick={() => setOpen((s) => { const n = new Set(s); if (n.has(m.key)) n.delete(m.key); else n.add(m.key); return n; })} aria-expanded={isOpen}>
          <span className="l">
            {m.label}
            {m.imputed && <span className="fx-v3-proj" title={t("fx.poste.v3.projete_title")}>{t("fx.poste.v3.projete")}</span>}
            <span className="chev" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
            {m.sub && <span className="m">{m.sub}</span>}
          </span>
          <span className="t" aria-hidden="true"><span style={{ width: `${Math.max(1.5, (m.total / maxMission) * 100)}%` }} /></span>
          <span className="v tnum">{fmtAmt(m.total).v}<span className="u">{fmtAmt(m.total).u}</span></span>
        </button>
        {isOpen && m.items.map((it, i) => (
          <div key={i} className="fx-v3-mline">
            <span className="l" title={it.original ? `${t("fx.poste.v3.orig")} ${it.original}` : undefined}>{it.name}</span>
            <span className="a tnum">{fmtAmt(it.value).v}<span className="u">{fmtAmt(it.value).u}</span></span>
            {it.flow && <span className="s">{((fl === "en" ? FLOW_SHORT_EN : FLOW_SHORT_FR)[it.flow] || it.flow).toLowerCase()}</span>}
          </div>
        ))}
      </div>
    );
  };

  const linkRow = (l: PosteLink, i: number) => {
    const kindLabel = t(`fx.poste.v3.link.${l.kind}`);
    let title = l.label; let sub = "";
    if (l.kind === "theme") { title = fill(t("fx.poste.v3.link.theme_t"), { theme: l.label }); sub = fill(t("fx.poste.v3.link.theme_s"), { n: (l.count ?? 0).toLocaleString(locStr), y: l.year }); }
    if (l.kind === "categorie") { title = fill(t("fx.poste.v3.link.cat_t"), { cat: l.label }); sub = fill(t(l.count === 1 ? "fx.poste.v3.link.cat_s1" : "fx.poste.v3.link.cat_s"), { n: l.count ?? 0, y: l.year }); }
    if (l.kind === "chapitre") { title = fill(t("fx.poste.v3.link.chap_t"), { chap: l.label }); sub = l.count ? fill(t("fx.poste.v3.link.chap_s"), { n: l.count, y: l.year }) : t("fx.poste.v3.link.chap_s0"); }
    if (l.kind === "lieux") { title = fill(t("fx.poste.v3.link.lieux_t"), { n: l.count ?? 0, fam: t(`fx.poste.v3.fam.${l.label}`) }); sub = t("fx.poste.v3.link.lieux_s"); }
    if (l.kind === "page") { title = t(`fx.poste.v3.link.page_${l.label}_t`); sub = t(`fx.poste.v3.link.page_${l.label}_s`); }
    return (
      <Link key={i} href={l.href} scroll={false} className="fx-v3-dest fx-row-link">
        <span className="k">{kindLabel}</span>
        <span className="l">{title} <span className="ar" aria-hidden="true">→</span></span>
        {l.amount != null ? <span className="a tnum">{fmtAmt(l.amount).v}<span className="u">{fmtAmt(l.amount).u}</span></span> : <span className="a" />}
        <span className="s">{sub}</span>
      </Link>
    );
  };

  return (
    <div className="fx-v3 fx-poste-v3">
      {missions.length > 0 && (!isFlat || dep) && (
        <p className="fx-v3-lead">
          {fill(t(dep ? "fx.poste.v3.lead_dep" : "fx.poste.v3.lead_rec"), { l: lead, rank: rankTxt, n: poste.nbPostes, year: poste.year })}
        </p>
      )}

      <div className="fx-v3-herogrid">
        <div>
          <div className="fx-v3-hero-num tnum">{v}<span className="u">{u}</span></div>
          <div className="fx-v3-hero-cap">{fill(t(dep ? (poste.typeBudget === "vote" ? "fx.poste.v3.cap_dep_vote" : "fx.poste.v3.cap_dep") : (poste.typeBudget === "vote" ? "fx.poste.v3.cap_rec_vote" : "fx.poste.v3.cap_rec")), { year: poste.year })}</div>
          <div className="fx-v3-hero-meta">
            {fill(t(dep ? "fx.poste.v3.ctx_dep" : "fx.poste.v3.ctx_rec"), { share: Math.round(poste.shareOfKindPct) })}
            {poste.perHabitant > 0 ? ` · ${fill(t("fx.poste.v3.par_hab"), { n: Math.round(poste.perHabitant).toLocaleString(locStr) })}` : ""}
          </div>
        </div>
        {poste.series.length > 1 && (
          <div className="fx-v3-trend">
            <div className="t">
              {poste.deltaPct != null && <b>{signed(poste.deltaPct)} {t("fx.poste.v3.sur_un_an")}</b>}
              {deltaSince != null && <span> · {signed(deltaSince)} {fill(t("fx.poste.v3.depuis"), { y: first.year })}</span>}
            </div>
            <div className="bars" aria-hidden="true">
              {poste.series.map((s) => (
                <div key={s.year} className={`${s.year === poste.year ? "now" : ""} ${s.type === "vote" ? "vote" : ""}`.trim()} title={`${s.year} · ${fmtM(s.value)}`}>
                  <b style={{ height: Math.max(3, Math.round((s.value / maxSeries) * 50)) }} />
                  <span>{s.year}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {natureRows.length > 1 && (
        <div className="fx-bud-forme fx-bud-forme--poste">
          <div className="h">{t("fx.poste.v3.forme")}</div>
          <div className="stack">
            {natureRows.map((g) => g.key === "autres"
              ? <span key={g.key} style={{ width: `${g.pct}%`, background: g.color }} title={`${t(`fx.bud.v3.flow.${g.key}`)} · ${g.pct} %`} />
              : <Link key={g.key} href={`/france/paris/budget/nature/${g.key}?year=${poste.year}`} scroll={false} style={{ width: `${g.pct}%`, background: g.color }} title={`${t(`fx.bud.v3.flow.${g.key}`)} · ${g.pct} %`} aria-label={t(`fx.bud.v3.flow.${g.key}`)} />)}
          </div>
          <div className="legend">
            {natureRows.map((g) => g.key === "autres"
              ? <span key={g.key}><i style={{ background: g.color }} /><b>{g.pct} %</b> {t(`fx.bud.v3.flow.${g.key}`)}</span>
              : <Link key={g.key} href={`/france/paris/budget/nature/${g.key}?year=${poste.year}`} scroll={false}><i style={{ background: g.color }} /><b>{g.pct} %</b> {t(`fx.bud.v3.flow.${g.key}`)}</Link>)}
          </div>
          <p className="note">{t("fx.poste.v3.forme_sub")}</p>
        </div>
      )}

      {missions.length > 0 && (
        <V3Section
          title={t(dep ? "fx.poste.v3.h.finance" : "fx.poste.v3.h.compose")}
          sub={isFlat ? undefined : dep ? fill(t(shown.length === 1 ? "fx.poste.v3.h.finance_sub1" : "fx.poste.v3.h.finance_sub"), { n: shown.length, pct: shownPct }) : t("fx.poste.v3.h.compose_sub")}
        >
          {isFlat ? (() => {
            const FlatRow = (it: (typeof flatLines)[number], i: number) => (
              <div key={i} className="fx-v3-mline" style={{ paddingLeft: 0, background: "transparent" }}>
                <span className="l" title={it.original ? `${t("fx.poste.v3.orig")} ${it.original}` : undefined}>{it.name}</span>
                <span className="a tnum">{fmtAmt(it.value).v}<span className="u">{fmtAmt(it.value).u}</span></span>
                {it.group && <span className="s">{inSentence(it.group)}</span>}
              </div>
            );
            return (
              <>
                {flatShown.map(FlatRow)}
                {flatRest.length > 1 && <V3Fold text label={fill(t("fx.poste.v3.more_lines"), { n: flatRest.length })}>{flatRest.map((it, i) => FlatRow(it, i + 8))}</V3Fold>}
                {flatRest.length === 1 && FlatRow(flatRest[0], 8)}
              </>
            );
          })() : (
            <>
              {shown.map(Row)}
              {rest.length > 0 && (
                <V3Fold text label={fill(t(rest.length === 1 ? "fx.poste.v3.more1" : "fx.poste.v3.more"), { n: rest.length, a: fmtM(rest[0].total), b: fmtM(rest[rest.length - 1].total) })}>
                  {rest.map(Row)}
                </V3Fold>
              )}
            </>
          )}
        </V3Section>
      )}

      {poste.links.length > 0 && (
        <V3Section title={t(dep ? "fx.poste.v3.h.links" : "fx.poste.v3.h.links_rec")} sub={t(dep ? "fx.poste.v3.h.links_sub" : "fx.poste.v3.h.links_rec_sub")}>
          {poste.links.map(linkRow)}
        </V3Section>
      )}

      {missions.length === 0 && <p className="fx-v3-sentence" style={{ color: "var(--muted)" }}>{fill(t("fx.poste.no_subpostes"), { year: poste.year })}</p>}

      <V3Foot>
        {hasImputed && <>{t("fx.poste.v3.imputation")} </>}
        {fill(t("fx.poste.v3.source"), { year: poste.year })}{" "}
        <a href={`https://opendata.paris.fr/explore/dataset/comptes-administratifs-budgets-principaux-a-partir-de-2019-m57-ville-departement/table/?refine.exercice_comptable=${poste.year}`} target="_blank" rel="noopener noreferrer">{t("fx.poste.v3.source_link")}</a>
      </V3Foot>
    </div>
  );
}
