import type { Metadata } from "next";
import Link from "next/link";
import "../fusion.css";

import {
  Navbar,
  Footer,
  Button,
  SectionHead,
  HeroNumber,
  KPIGrid,
  TileCard,
  YearPicker,
  ExportRow,
  EmptyState,
  DualFlowBars,
  ExpandableList,
  Tip,
  BudgetTimeline,
} from "@/components/fusion";
import {
  fmtBillions,
  fmtDec,
  fmtInt,
  fmtMillions,
  loadBudgetIndex,
  loadBudgetPageData,
  loadVoteExecute,
} from "@/lib/fusion-data";

export const metadata: Metadata = {
  title: "Le budget de Paris — France Open Data",
  description:
    "Recettes, dépenses et exécution du budget de la Ville de Paris. Flux complet, détail par thématique, évolution 2019-2026. Source : comptes administratifs M57.",
  alternates: { canonical: "/budget" },
};

type SP = { year?: string };

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const index = loadBudgetIndex();
  const d = loadBudgetPageData(requestedYear);
  const voteExec = loadVoteExecute();

  const yearType = index.summary.find((s) => s.year === d.year)?.type_budget ?? "execute";
  const isVoted = yearType === "vote";
  const deltaDir: "up" | "down" | "flat" =
    d.deltaDepensesPct > 0.1 ? "up" : d.deltaDepensesPct < -0.1 ? "down" : "flat";
  const deltaArrow = deltaDir === "down" ? "↓" : deltaDir === "flat" ? "→" : "↑";

  const topDep = d.topDepenses.slice(0, 7);
  const topRec = d.recettesBreakdown.slice(0, 6);

  // Voté vs Exécuté row pour l'année sélectionnée
  const veRow = voteExec.rows.find((r) => r.year === d.year);
  const hasExecution = veRow?.executed != null;

  return (
    <div className="theme-fusion">
      <Navbar />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">01 · Budget</div>
          <h1 className="fx-page-title">
            Le <em>budget</em> de Paris
          </h1>
          <p className="fx-page-lede">
            Recettes, dépenses et exécution pour l&apos;exercice sélectionné.
            <br />
            Source : comptes administratifs M57, opendata.paris.fr, délibérations du Conseil de Paris.
          </p>
          <div className="fx-page-actions">
            <YearPicker
              years={index.availableYears.slice().sort((a, b) => a - b)}
              votedYears={index.votedYears ?? []}
              current={d.year}
              basePath="/budget"
              label="Exercice"
            />
          </div>
          {isVoted && (
            <p style={{
              marginTop: 18,
              fontFamily: "var(--f-mono)",
              fontSize: 11.5,
              color: "var(--rouge)",
              letterSpacing: ".04em",
            }}>
              Budget {d.year} voté — les comptes administratifs seront publiés en juin {d.year + 1}.
            </p>
          )}
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind="Vue d'ensemble"
            title={<>Combien <em>la Ville dépense</em> ?</>}
          />
          <div className="fx-overview">
            <HeroNumber
              label={<>Dépenses totales · exercice {d.year}</>}
              value={fmtBillions(d.depenses)}
              unit="Md €"
              delta={{
                direction: deltaDir,
                value: `${fmtDec(Math.abs(d.deltaDepensesPct), 1)} %`,
                base: `vs exercice ${d.previousYear}`,
              }}
              caption={
                <>
                  Soit <b>{fmtInt(d.depenses / 2_133_111)} € par habitant</b>.
                  {isVoted
                    ? " Exercice voté — montants inscrits au budget primitif."
                    : " Exercice exécuté — montants réellement engagés."}
                </>
              }
            />
            <KPIGrid
              cols={2}
              items={[
                { label: "Recettes", value: fmtBillions(d.recettes), unit: "Md €", delta: isVoted ? "Voté" : "Exécuté" },
                {
                  label: "Solde",
                  value: (d.solde >= 0 ? "+ " : "− ") + fmtMillions(Math.abs(d.solde)),
                  unit: "M €",
                  delta: d.solde < 0 ? "Besoin de financement" : "Excédent",
                },
                {
                  label: (
                    <Tip label="Les dépenses du quotidien : salaires des agents, entretien, cantines, éclairage, subventions aux associations. Environ 81 % du budget.">
                      Fonctionnement
                    </Tip>
                  ),
                  value: fmtBillions(d.fonctionnement),
                  unit: "Md €",
                  delta: `${Math.round((d.fonctionnement / d.depenses) * 100)} % du total`,
                },
                {
                  label: (
                    <Tip label="Les dépenses qui construisent ou rénovent : écoles neuves, gymnases, voirie, logements sociaux. Partiellement financé par l'emprunt.">
                      Investissement
                    </Tip>
                  ),
                  value: fmtBillions(d.investissement),
                  unit: "Md €",
                  delta: `${Math.round((d.investissement / d.depenses) * 100)} % du total`,
                },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind="Flux"
            title={<>D&apos;où vient, <em>où va</em> l&apos;argent ?</>}
            subtitle="Les recettes traversent d'abord une section comptable (fonctionnement ou investissement), puis sont affectées à des postes de dépenses. Les lignes en rouge sont liées à l'emprunt ou à l'investissement."
          />
          <DualFlowBars
            left={{
              title: <>Recettes · {fmtBillions(d.recettes)} Md €</>,
              rows: topRec.map((r) => ({
                label: r.label === "Autres (R)" ? "Autres" : r.label,
                value: r.value,
                display: `${fmtBillions(r.value)} Md`,
                rouge: /emprunt/i.test(r.label),
              })),
            }}
            right={{
              title: <>Dépenses · {fmtBillions(d.depenses)} Md €</>,
              rows: topDep.map((t) => ({
                label: t.label === "Autres (D)" ? "Autres" : t.label,
                value: t.value,
                display: `${fmtBillions(t.value)} Md`,
                rouge: /investissement|dette|remboursement/i.test(t.label),
              })),
            }}
            center={{
              label: "Total équilibré",
              value: fmtBillions(Math.max(d.recettes, d.depenses)),
              unit: "Md €",
            }}
            callout={
              <>
                Pour aller plus loin : <b>{Math.round((d.fonctionnement / d.depenses) * 100)} % du budget</b> est du{" "}
                <Tip label="Les dépenses du quotidien : salaires, entretien, cantines, éclairage. Récurrentes.">
                  <b>fonctionnement</b>
                </Tip>
                {" "}(salaires, entretien, subventions, éclairage).{" "}
                <b>{Math.round((d.investissement / d.depenses) * 100)} %</b> est de l&apos;
                <Tip label="Les dépenses qui construisent ou rénovent des biens durables : écoles, gymnases, voirie.">
                  <b>investissement</b>
                </Tip>
                {" "}(écoles neuves, voirie, logements).{" "}
                <Tip label="La dette nouvelle contractée cette année. Rembourse le capital sur plusieurs années.">
                  <span className="rouge"><b>L&apos;emprunt nouveau</b></span>
                </Tip>
                {" "}finance une partie de l&apos;investissement — par la{" "}
                <Tip label="Règle comptable qui impose aux communes de dégager un surplus en fonctionnement. L'emprunt ne peut financer que l'investissement, jamais le quotidien.">
                  règle d&apos;or
                </Tip>
                , il ne peut pas financer les dépenses courantes.
              </>
            }
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind="Dans le détail"
            title={<>Le <em>budget</em> par thématique</>}
            subtitle="Cliquez sur + pour voir les sous-postes qui composent chaque thématique. Chiffres issus des chapitres M57 du budget voté."
          />
          <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 12 }}>
            Recettes · {fmtBillions(d.recettes)} Md €
          </div>
          <ExpandableList
            header={{
              left: <>Sources de recettes · <b>{fmtBillions(d.recettes)} Md € au total</b></>,
              right: <>{topRec.length} postes</>,
            }}
            items={topRec.map((r) => {
              const refMax = topRec[0].value || 1;
              const label = r.label === "Autres (R)" ? "Autres" : r.label;
              const isRouge = /emprunt/i.test(r.label);
              const desc = RECETTES_DESC[r.label] ?? "Ressource inscrite au budget de l'exercice.";
              const subMax = r.subSources[0]?.value || 1;
              return {
                key: r.label,
                label: (
                  <span style={isRouge ? { color: "var(--rouge)" } : undefined}>{label}</span>
                ),
                barPct: (r.value / refMax) * 100,
                meta: <>{fmtDec((r.value / d.recettes) * 100, 1)} %</>,
                value: fmtBillions(r.value),
                unit: "Md €",
                children: (
                  <div>
                    <p style={{ fontFamily: "var(--f-ui)", fontSize: 14, color: "var(--ink-2)", lineHeight: 1.55, maxWidth: 720, margin: "0 0 18px" }}>
                      {desc}
                    </p>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 14 }}>
                      Top sous-sources · {label}
                    </div>
                    {r.subSources.length > 0 ? (
                      <GroupedSubRows
                        items={r.subSources}
                        max={subMax}
                        rouge={isRouge}
                      />
                    ) : (
                      <p style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--muted)" }}>
                        Détail des sous-sources non publié pour cet exercice.
                      </p>
                    )}
                  </div>
                ),
              };
            })}
          />

          <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", margin: "36px 0 12px" }}>
            Dépenses · {fmtBillions(d.depenses)} Md €
          </div>
          <ExpandableList
            header={{
              left: <>Thématiques · <b>{fmtBillions(d.depenses)} Md € au total</b></>,
              right: <>{d.topDepenses.length} postes</>,
            }}
            items={d.topDepenses.map((t) => {
              const refMax = d.topDepenses[0].value || 1;
              const label = t.label === "Autres (D)" ? "Autres" : t.label;
              const isRouge = /investissement|remboursement/i.test(t.label);
              const subMax = t.subPostes[0]?.value || 1;
              return {
                key: t.label,
                label: (
                  <span style={isRouge ? { color: "var(--rouge)" } : undefined}>{label}</span>
                ),
                barPct: (t.value / refMax) * 100,
                meta: <>{fmtDec((t.value / d.depenses) * 100, 1)} %</>,
                value: fmtBillions(t.value),
                unit: "Md €",
                children: (
                  <div>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 14 }}>
                      Top sous-postes · {label}
                    </div>
                    {t.subPostes.length > 0 ? (
                      <GroupedSubRows
                        items={t.subPostes}
                        max={subMax}
                        rouge={isRouge}
                      />
                    ) : (
                      <p style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--muted)" }}>
                        Détail des sous-postes non publié pour cet exercice.
                      </p>
                    )}
                  </div>
                ),
              };
            })}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind="Dans le temps"
            title={<>Évolution <em>depuis 2019</em>.</>}
            subtitle="Budget total par année, en milliards d'euros. Les années d'exécution sont tracées en ligne pleine, l'année votée en pointillé. Le pic Covid 2020 et les JO 2024 sont annotés."
          />
          <BudgetTimeline
            points={d.yearsSummary.map((y) => ({
              year: y.year,
              value: y.depenses / 1_000_000_000,
              type: (y.type === "vote" ? "vote" : "execute") as "vote" | "execute",
            }))}
            activeYear={d.year}
            annotations={[
              { year: 2020, label: "COVID · baisse" },
              { year: 2024, label: "Pic invest. · JO" },
            ]}
          />
          {d.yearsSummary.length >= 2 && (() => {
            const first = d.yearsSummary[0];
            const last = d.yearsSummary[d.yearsSummary.length - 1];
            const delta = ((last.depenses - first.depenses) / first.depenses) * 100;
            return (
              <p className="fx-viz-meta">
                <span>
                  Entre {first.year} ({first.type === "vote" ? "voté" : "exécuté"}) et {last.year} ({last.type === "vote" ? "voté" : "exécuté"}),
                  le budget total évolue de <strong>{delta >= 0 ? "+" : "−"} {fmtDec(Math.abs(delta), 1)} %</strong> en valeur nominale.
                </span>
                <Link href="/analyses" style={{ fontFamily: "var(--f-mono)", fontSize: 12.5, color: "var(--bleu)", borderBottom: "1px solid var(--bleu)", paddingBottom: 1 }}>
                  Voir l&apos;évolution par poste →
                </Link>
              </p>
            );
          })()}
        </div>
      </section>

      <section className="fx-section" id="execution">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind="Voté vs exécuté"
            title={
              <>
                Ce qui est{" "}
                <Tip label="Le budget adopté chaque année par le Conseil de Paris avant le début de l'exercice. C'est une intention de dépense.">
                  <em>voté</em>
                </Tip>
                {" "}est-il{" "}
                <Tip label="Les dépenses effectivement engagées et constatées dans les comptes administratifs. C'est la réalité, connue seulement après la fin de l'exercice.">
                  <b>dépensé</b>
                </Tip>
                {" "}?
              </>
            }
            subtitle={
              <>
                L&apos;écart entre le budget voté par le Conseil de Paris et les comptes
                administratifs réellement clos. Disponible uniquement pour les exercices
                passés.
              </>
            }
          />

          {!hasExecution ? (
            <EmptyState
              label="Données non encore disponibles"
              title={<>L&apos;exécution {d.year} sera publiée en juin {d.year + 1}.</>}
              body={
                <>
                  Les comptes administratifs sont arrêtés et adoptés par le Conseil de Paris
                  l&apos;année suivant la clôture de l&apos;exercice. D&apos;ici là, consultez
                  les écarts voté/exécuté des exercices déjà clos.
                </>
              }
              actions={
                <>
                  {voteExec.rows
                    .filter((r) => r.executed != null)
                    .slice(-3)
                    .reverse()
                    .map((r) => (
                      <Button key={r.year} href={`/budget?year=${r.year}#execution`}>
                        Voir les écarts {r.year}
                      </Button>
                    ))}
                </>
              }
            />
          ) : (
            <>
              <div className="fx-overview">
                <HeroNumber
                  label={<>Taux d&apos;exécution · {d.year}</>}
                  value={fmtDec(veRow?.tauxGlobal ?? 0, 1)}
                  unit="%"
                  caption={
                    <>
                      Budget voté : <b>{fmtBillions(veRow?.voted ?? 0)} Md €</b> ·{" "}
                      exécuté : <b>{fmtBillions(veRow?.executed ?? 0)} Md €</b>. L&apos;écart
                      reflète la sous-exécution ou le report des crédits d&apos;investissement.
                    </>
                  }
                />
                <KPIGrid
                  cols={2}
                  items={[
                    { label: "Voté", value: fmtBillions(veRow?.voted ?? 0), unit: "Md €" },
                    { label: "Exécuté", value: fmtBillions(veRow?.executed ?? 0), unit: "Md €" },
                    {
                      label: "Écart absolu",
                      value:
                        (veRow && veRow.executed != null
                          ? (veRow.executed - veRow.voted >= 0 ? "+ " : "− ") +
                            fmtMillions(Math.abs(veRow.executed - veRow.voted))
                          : "—"),
                      unit: "M €",
                    },
                    {
                      label: "Statut",
                      value: (veRow?.tauxGlobal ?? 0) >= 95 ? "Exécuté" : "Sous-exécuté",
                      delta: `${fmtDec(veRow?.tauxGlobal ?? 0, 1)} % du voté`,
                    },
                  ]}
                />
              </div>

            </>
          )}
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind="Sources & méthode"
            title={<>Vérifiable <em>ligne par ligne</em></>}
          />
          <div className="fx-sources">
            <div>
              <div className="n">Donnée source</div>
              <h3>Budget {isVoted ? "primitif voté" : "exécuté"} {d.year} (
                <Tip label="Nomenclature comptable standard des collectivités territoriales, obligatoire depuis 2024. Remplace les anciennes M14/M52.">M57</Tip>
              )</h3>
              <p>
                {isVoted
                  ? `Voté par le Conseil de Paris en décembre ${d.year - 1}. Les comptes administratifs définitifs seront publiés en juin ${d.year + 1}.`
                  : "Comptes administratifs arrêtés par le Conseil de Paris l'année suivant la clôture de l'exercice."}
              </p>
              <a href="https://opendata.paris.fr" target="_blank" rel="noopener noreferrer">
                opendata.paris.fr ↗
              </a>
            </div>
            <div>
              <div className="n">Publication source</div>
              <h3>{isVoted ? "Décembre " + (d.year - 1) : "Juin " + (d.year + 1)} · Conseil de Paris</h3>
              <p>
                Date d&apos;adoption officielle. Toute ré-ingestion côté France Open Data
                reste documentée dans le dépôt public.
              </p>
              <a href="#">Historique des publications →</a>
            </div>
            <div>
              <div className="n">Reproductibilité</div>
              <h3>Pipeline open source</h3>
              <p>
                Tous les scripts d&apos;extraction et de transformation sont publics sous
                licence MIT. Chaque chiffre peut être recalculé depuis le CSV source.
              </p>
              <a href="https://github.com/AbstractsMachine" target="_blank" rel="noopener noreferrer">
                GitHub ↗
              </a>
            </div>
          </div>
          <ExportRow
            items={[
              {
                label: `CSV · ${d.year} ${isVoted ? "voté" : "exécuté"}`,
                primary: true,
                href: `/api/budget/${d.year}/csv`,
                download: `budget-paris-${d.year}.csv`,
              },
              {
                label: "JSON",
                href: `/data/budget_sankey_${d.year}.json`,
                download: `budget-paris-${d.year}.json`,
              },
              { label: `API (bientôt)`, href: undefined },
              { label: "Lire la méthode complète", href: "/methode#budget" },
            ]}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="07"
            kind="Explorer plus loin"
            title="Le budget ne dit pas tout."
            subtitle="Continuez avec les pages dédiées aux bénéficiaires, aux projets sur le terrain, au bilan patrimonial, et aux analyses éditoriales."
          />
          <div className="fx-grid-tiles fx-grid-tiles-4">
            <TileCard
              href="/qui-recoit"
              number="→ Qui reçoit"
              kind="Classement"
              title="Associations & fournisseurs"
              description="Les 6 000 associations subventionnées et les entreprises titulaires de marchés publics, par thématique et montant."
              preview={<SvgClassement />}
              kpi="312"
              kpiUnit="M €"
              kpiDelta={<>versés en subventions</>}
            />
            <TileCard
              href="/investissements"
              number="→ Investissements"
              kind="Carte"
              title="Les projets de la Ville"
              description="Les 640 projets d'investissement géolocalisés — écoles, gymnases, voirie, logement social. Carte interactive."
              preview={<SvgCarte />}
              kpi="2,6"
              kpiUnit="Md €"
              kpiDelta={<>en cours</>}
            />
            <TileCard
              href="/dette-patrimoine"
              number="→ Dette et patrimoine"
              kind="Bilan"
              title="Ce que la Ville possède et doit"
              description="Terrains, bâtiments, réseaux face à la dette active. Le bilan comptable rendu lisible."
              preview={<SvgBilan />}
              kpi="36"
              kpiUnit="Md €"
              kpiDelta={<>de fonds propres</>}
            />
            <TileCard
              href="/analyses"
              number="→ Analyses"
              kind="Enquêtes"
              title="Enquêtes & explications"
              description="Nos analyses éditoriales qui racontent les chiffres — pourquoi l'invest augmente, le vrai coût de la propreté, etc."
              preview={<SvgAnalyses />}
              kpi="2"
              kpiUnit="publiés"
              kpiDelta={<>4 en préparation</>}
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

/**
 * Groups sub-items by the "N2:" prefix in their name and renders one
 * sub-section per N2 group with its own header + total. Items keep the
 * global rank (#01, #02, …) so the reader can see ordering across groups.
 */
function GroupedSubRows({
  items,
  max,
  rouge,
}: {
  items: { name: string; value: number }[];
  max: number;
  rouge?: boolean;
}) {
  // Build ordered groups keyed by N2
  const groupOrder: string[] = [];
  const groups = new Map<string, { total: number; items: { globalRank: number; n3: string; value: number }[] }>();
  items.forEach((it, i) => {
    const idx = it.name.indexOf(":");
    const n2 = idx > 0 ? it.name.slice(0, idx).trim() : "Détail";
    const n3 = idx > 0 ? it.name.slice(idx + 1).trim() : it.name.trim();
    if (!groups.has(n2)) {
      groupOrder.push(n2);
      groups.set(n2, { total: 0, items: [] });
    }
    const g = groups.get(n2)!;
    g.total += it.value;
    g.items.push({ globalRank: i + 1, n3, value: it.value });
  });

  return (
    <div>
      {groupOrder.map((n2) => {
        const g = groups.get(n2)!;
        return (
          <div key={n2} style={{ marginBottom: 22 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "8px 0",
                borderBottom: "1px solid var(--rule)",
                marginBottom: 4,
                fontFamily: "var(--f-mono)",
                fontSize: 11,
                letterSpacing: ".06em",
                textTransform: "uppercase",
                color: "var(--ink-2)",
              }}
            >
              <span>{n2}</span>
              <span style={{ color: "var(--muted)", fontWeight: 500 }}>
                {g.total >= 1e9
                  ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(g.total / 1e9) + " Md €"
                  : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(g.total / 1e6) + " M €"}
              </span>
            </div>
            {g.items.map((it) => (
              <div key={it.globalRank} className="fx-mini-row" style={{ gridTemplateColumns: "32px 2fr 3fr 110px" }}>
                <span className="rank">#{String(it.globalRank).padStart(2, "0")}</span>
                <span style={{ fontWeight: 500 }}>{it.n3}</span>
                <span className="muted fx-mini-hide-mobile" style={{ position: "relative", height: 8 }}>
                  <span
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 2,
                      height: 6,
                      width: `${(it.value / max) * 100}%`,
                      background: rouge ? "var(--rouge)" : "var(--ink)",
                    }}
                  />
                </span>
                <span className="num">
                  {it.value >= 1e9
                    ? new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(it.value / 1e9) + " Md €"
                    : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(it.value / 1e6) + " M €"}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

const RECETTES_DESC: Record<string, string> = {
  "Impôts & Taxes":
    "Taxe foncière, taxe de séjour, taxe sur les ordures ménagères, cotisation foncière des entreprises (CFE)… Principale source de recettes de la Ville, relativement stable d'une année sur l'autre.",
  "Dotations & Subventions":
    "Fonds versés par l'État et la Région pour compenser certains transferts de compétences (RSA, minima sociaux) ou financer des politiques ciblées. En érosion continue depuis 2014.",
  "Services Publics":
    "Redevances et droits d'occupation du domaine public, tickets de cantine, inscriptions en crèche ou aux activités périscolaires, loyers des bâtiments appartenant à la Ville.",
  "Emprunts":
    "Dette nouvelle contractée cette année. Par la règle d'or, l'emprunt ne peut financer que l'investissement — jamais le fonctionnement courant. Remboursé en capital sur plusieurs années.",
  "Investissement":
    "Subventions reçues spécifiquement pour financer des opérations d'investissement : fonds de l'État, de la Région, du FEDER européen, participations de tiers.",
  "Autres (R)":
    "Revenus atypiques : produits financiers, remboursements d'assurance, cessions d'actifs, reversements divers. Volume faible, nature variable d'une année sur l'autre.",
};

function SvgClassement() {
  return (
    <svg viewBox="0 0 200 100">
      {[14, 28, 42, 56, 70, 84].map((y, i) => (
        <g key={y}>
          <rect x="10" y={y - 1} width="4" height="4" className="fill-muted" fill="#9099a6" />
          <rect x="20" y={y - 1} width={90 - i * 12} height="6" className="fill" fill="#0a0a0a" />
          <rect x="160" y={y - 1} width="30" height="6" className="fill-muted" fill="#9099a6" />
        </g>
      ))}
    </svg>
  );
}

function SvgCarte() {
  return (
    <svg viewBox="0 0 200 100">
      <path d="M 28 30 Q 36 14 70 12 Q 110 10 140 18 Q 172 26 184 48 Q 188 72 168 86 Q 130 94 90 92 Q 50 90 28 72 Q 18 52 28 30 Z" className="stroke" fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
      {[[60, 34], [86, 42], [110, 30], [140, 36], [72, 70], [104, 78], [132, 72], [158, 68]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" className="fill" fill="#0a0a0a" />
      ))}
      <circle cx="118" cy="54" r="4" className="fill-sig" fill="#e11d1d" />
    </svg>
  );
}

function SvgBilan() {
  return (
    <svg viewBox="0 0 200 100">
      <rect x="32" y="10" width="60" height="40" className="fill" fill="#0a0a0a" />
      <rect x="32" y="52" width="60" height="24" className="fill" fill="#0a0a0a" opacity=".75" />
      <rect x="108" y="10" width="60" height="46" className="fill" fill="#0a0a0a" />
      <rect x="108" y="58" width="60" height="32" className="fill-sig" fill="#e11d1d" />
    </svg>
  );
}

function SvgAnalyses() {
  return (
    <svg viewBox="0 0 200 100">
      <rect x="10" y="14" width="180" height="4" className="fill" fill="#0a0a0a" />
      <rect x="10" y="28" width="140" height="4" className="fill" fill="#0a0a0a" />
      <rect x="10" y="42" width="160" height="4" className="fill-sig" fill="#e11d1d" />
      <rect x="10" y="56" width="120" height="4" className="fill" fill="#0a0a0a" />
      <rect x="10" y="70" width="150" height="4" className="fill" fill="#0a0a0a" />
      <rect x="10" y="84" width="100" height="4" className="fill-muted" fill="#9099a6" />
    </svg>
  );
}
