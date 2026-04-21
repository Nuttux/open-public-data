import type { Metadata } from "next";
import "../fusion.css";

import Link from "next/link";
import {
  Navbar,
  Footer,
  SectionHead,
  HeroNumber,
  KPIGrid,
  TileCard,
  YearPicker,
  ExportRow,
  ExpandableList,
  SignauxFaibles,
  BudgetTimeline,
  Tip,
  StackedBarTheme,
} from "@/components/fusion";
import { normalizeObjet } from "@/lib/objet-normalizer";
import MarchesSearch from "./MarchesSearch";
import {
  fmtBillions,
  fmtDec,
  fmtInt,
  fmtMillions,
  loadMarchesIndex,
  loadMarchesPageData,
  slugifyLabel,
} from "@/lib/fusion-data";

export const metadata: Metadata = {
  title: "Marchés publics — France Open Data",
  description:
    "Contrats attribués par la Ville de Paris : titulaires, catégories CPV, volumes. Enveloppes pluriannuelles, pas des dépenses annuelles.",
  alternates: { canonical: "/marches-publics" },
};

export default async function MarchesPublicsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const idx = loadMarchesIndex();
  const d = loadMarchesPageData(requestedYear);
  const top10Pct = d.total > 0 ? (d.top10.reduce((s, t) => s + t.amount, 0) / d.total) * 100 : 0;
  const multiPct = d.total > 0 ? (d.multiAttributaires.amount / d.total) * 100 : 0;
  const cleanName = (n: string) => n.replace(/\s{2,}/g, " ").trim().slice(0, 60);

  return (
    <div className="theme-fusion">
      <Navbar />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">03 · Marchés publics</div>
          <h1 className="fx-page-title">
            Les <em>contrats</em> de la Ville
          </h1>
          <p className="fx-page-lede">
            {fmtInt(d.nb)} contrats notifiés en {d.year} à {fmtInt(d.nbTitulaires)} fournisseurs distincts.
            Les montants sont des <b>enveloppes pluriannuelles maximales</b>, pas des dépenses réelles annuelles.
          </p>
          <div className="fx-page-actions">
            <YearPicker
              years={(idx.availableYears ?? []).slice().sort((a, b) => a - b)}
              current={d.year}
              basePath="/marches-publics"
              label="Exercice"
            />
          </div>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead number="01" kind="Vue d'ensemble" title={<>Les <em>chiffres clés</em> {d.year}</>} />
          <div className="fx-overview">
            <HeroNumber
              label={<>Enveloppe max cumulée · {d.year}</>}
              value={fmtBillions(d.total)}
              unit="Md €"
              caption={
                <>
                  À lire comme un <b>plafond contractuel</b>, pas comme une dépense annuelle.
                  Certaines enveloppes couvrent plusieurs années (marchés à bon de commande).
                </>
              }
            />
            <KPIGrid
              cols={2}
              items={[
                { label: "Contrats notifiés", value: fmtInt(d.nb), delta: `${d.year}` },
                { label: "Titulaires distincts", value: fmtInt(d.nbTitulaires), delta: "Hors marchés multiattributaires" },
                {
                  label: (
                    <Tip label="Pourcentage du montant total concentré sur les 10 plus gros fournisseurs (hors marchés multiattributaires). Plus ce chiffre est haut, plus la commande publique est concentrée sur quelques acteurs.">
                      Concentration top 10
                    </Tip>
                  ),
                  value: `${fmtDec(top10Pct, 0)} %`,
                  delta: "du montant total",
                },
                {
                  label: (
                    <Tip label="Contrats attribués à plusieurs entreprises sans publication du partage — la donnée publique ne dit pas qui a pris quoi. À explorer en pipeline.">
                      Multiattributaires
                    </Tip>
                  ),
                  value: fmtInt(d.multiAttributaires.count),
                  delta: `${fmtDec(multiPct, 0)} % du total · opaque`,
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
            kind="Par catégorie"
            title={<>Ce que <em>la Ville achète</em></>}
            subtitle="Chaque segment = une catégorie, proportionnelle à l'enveloppe. Cliquez pour filtrer les contrats correspondants."
          />
          <StackedBarTheme
            items={d.byCategory.map((c) => ({ theme: c.category, amount: c.amount, count: c.count }))}
            total={d.total}
            concentrationTop10Pct={top10Pct}
            year={d.year}
            basePath="/marches-publics"
            kicker={`Sur chaque 100 € d'enveloppe contractuelle ${d.year}`}
            entityNoun="titulaires"
            paretoContrast="les ~1 500 autres fournisseurs se partagent le reste"
            hrefBuilder={(cat) => `/marches-publics/categorie/${slugifyLabel(cat)}`}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind="Top titulaires"
            title={<>Les <em>10 plus gros</em> attributaires</>}
            subtitle={`Enveloppe cumulée pour ${d.year}, hors marchés multiattributaires (${fmtInt(d.multiAttributaires.count)} contrats, ${fmtDec(multiPct, 0)} % du total). Cliquez sur + pour voir la liste des contrats par titulaire.`}
          />
          <ExpandableList
            header={{
              left: <>Rang · Titulaire</>,
              right: <>Enveloppe {d.year} · Contrats</>,
            }}
            items={d.top10.map((t) => {
              const refMax = d.top10[0].amount || 1;
              const ficheHref = t.siret
                ? `/marches-publics/fournisseur/${encodeURIComponent(t.siret)}`
                : null;
              return {
                key: String(t.rank),
                label: (
                  <span>
                    <span style={{ fontFamily: "var(--f-mono)", color: "var(--ocre)", marginRight: 8 }}>
                      {String(t.rank).padStart(2, "0")}
                    </span>
                    {cleanName(t.name)}
                  </span>
                ),
                barPct: (t.amount / refMax) * 100,
                meta: <>{fmtInt(t.nbContrats)} contrats · {fmtDec((t.amount / d.total) * 100, 1)} %</>,
                value: t.amount >= 1e9 ? fmtBillions(t.amount) : fmtMillions(t.amount, 0),
                unit: t.amount >= 1e9 ? "Md €" : "M €",
                children: (
                  <div>
                    <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 14 }}>
                      Contrats notifiés · {t.contrats.length} sur {t.nbContrats}
                    </div>
                    <table className="fx-table" style={{ borderTop: 0 }}>
                      <thead>
                        <tr>
                          <th>Objet</th>
                          <th>Catégorie</th>
                          <th>Nature</th>
                          <th>Date</th>
                          <th style={{ textAlign: "right" }}>Enveloppe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.contrats.map((c, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 500, maxWidth: 360 }}>
                              {(() => {
                                const clean = c.objetClair || normalizeObjet(c.objet);
                                const shown = clean.length > 100 ? clean.slice(0, 100) + "…" : clean;
                                return c.numero ? (
                                  <Link
                                    href={`/marches-publics/contrat/${encodeURIComponent(c.numero)}`}
                                    style={{ color: "var(--ink)" }}
                                    scroll={false}
                                  >
                                    {shown}
                                  </Link>
                                ) : (
                                  <span>{shown}</span>
                                );
                              })()}
                            </td>
                            <td className="muted" style={{ maxWidth: 160 }}>
                              {c.categorie.length > 30 ? c.categorie.slice(0, 30) + "…" : c.categorie}
                            </td>
                            <td className="muted">{c.nature}</td>
                            <td className="muted">
                              {c.date ? new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(c.date)) : "—"}
                            </td>
                            <td className="num">
                              {c.montant >= 1e6 ? fmtMillions(c.montant, 1) + " M €" : fmtInt(c.montant / 1000) + " k €"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap", marginTop: 14 }}>
                      {ficheHref ? (
                        <Link
                          href={ficheHref}
                          style={{ fontFamily: "var(--f-mono)", fontSize: 12, color: "var(--bleu)", borderBottom: "1px solid var(--bleu)", paddingBottom: 1 }}
                          scroll={false}
                        >
                          Fiche complète du fournisseur →
                        </Link>
                      ) : <span />}
                      {t.nbContrats > t.contrats.length && (
                        <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)" }}>
                          + {t.nbContrats - t.contrats.length} autres contrats dans la recherche.
                        </span>
                      )}
                    </div>
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
            kind="Recherche"
            title={<>Cherchez un <em>contrat</em> ou une <em>entreprise</em></>}
            subtitle={`Les ${fmtInt(d.nb)} contrats de ${d.year}. Par défaut la vue montre les 24 plus gros hors multiattributaires ; tapez 2 lettres ou filtrez pour affiner.`}
          />
          <MarchesSearch
            items={d.allMarches}
            categories={d.byCategory.map((c) => c.category)}
            natures={d.byNature.map((n) => n.nature)}
            year={d.year}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind="Par nature"
            title={<>Travaux, services, fournitures : <em>le mix des contrats</em></>}
            subtitle="Seule la nature du marché (travaux / services / fournitures) est publiée en open data. La procédure formelle (appel d'offres, MAPA, négociée) n'est pas ventilée — elle demanderait un scraping des avis d'attribution DECP."
          />
          <div style={{ border: "1px solid var(--ink)" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "14px 22px",
                borderBottom: "1px solid var(--ink)",
                background: "var(--bg)",
                fontFamily: "var(--f-mono)",
                fontSize: 11.5,
                letterSpacing: ".02em",
                color: "var(--ink)",
              }}
            >
              <span>
                Répartition par nature · <b>{fmtBillions(d.total)} Md €</b>
              </span>
              <span>Part en €</span>
            </div>
            <div style={{ padding: "4px 0" }}>
              {d.byNature.map((n) => {
                const refMax = d.byNature[0]?.amount || 1;
                const pct = (n.amount / d.total) * 100;
                const avgK = n.count > 0 ? Math.round(n.amount / n.count / 1000) : 0;
                return (
                  <div
                    key={n.nature}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "minmax(220px, 1fr) minmax(180px, 2fr) 100px",
                      gap: 20,
                      padding: "14px 22px",
                      borderBottom: "1px solid var(--rule)",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div style={{ fontFamily: "var(--f-ui)", fontSize: 15, fontWeight: 500 }}>{n.nature}</div>
                      <div style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                        {fmtInt(n.count)} contrats · {fmtInt(avgK)} k € en moyenne
                      </div>
                    </div>
                    <div style={{ position: "relative", height: 12 }}>
                      <span
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          height: "100%",
                          width: `${(n.amount / refMax) * 100}%`,
                          background: "var(--ink)",
                        }}
                      />
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--f-disp)",
                        fontWeight: 700,
                        fontSize: 18,
                        letterSpacing: "-0.02em",
                        textAlign: "right",
                      }}
                    >
                      {fmtDec(pct, 0)}
                      <span style={{ fontSize: ".6em", color: "var(--muted)", fontWeight: 500, marginLeft: 2 }}>%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="fx-note">
            <b>Méthodo à produire</b> : reconstituer la procédure formelle depuis les avis d&apos;attribution
            DECP — appel d&apos;offres ouvert, appel d&apos;offres restreint, MAPA (procédure adaptée),
            procédure négociée, sans publicité. Indicateur clé à ajouter : <b>nombre moyen de candidats par contrat</b>,
            proxy du niveau de concurrence réel.
          </p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind="Signaux faibles"
            title={<>Contrats <em>à surveiller</em></>}
            subtitle="Marchés notables pour leur volume, leur concentration ou leur mode de passation. La liste n'implique pas d'irrégularité — seulement que ces contrats méritent un regard."
          />
          <SignauxFaibles
            note={
              <>
                <b>Méthode</b> : repérage heuristique sur montants &gt; 10 M €, mono-attributaires
                et contrats récurrents avec mêmes titulaires. À affiner ligne à ligne.
              </>
            }
            items={[
              {
                flag: "Concentration élevée",
                title: `${(d.top10[0]?.name ?? "—").slice(0, 60)}`,
                body: `Ce titulaire concentre à lui seul ${fmtDec((d.top10[0]?.amount ?? 0) / d.total * 100, 1)} % de l'enveloppe notifiée en ${d.year} (${d.top10[0]?.nbContrats ?? 0} contrats).`,
                stats: [
                  { label: "Enveloppe", value: `${fmtMillions(d.top10[0]?.amount ?? 0, 0)} M €` },
                  { label: "Contrats", value: String(d.top10[0]?.nbContrats ?? 0) },
                  { label: "Rang", value: "#01" },
                ],
              },
              {
                flag: "Volume anormal",
                title: "Catégorie dominante sur la période",
                body: `La catégorie "${d.byCategory[0]?.category ?? "—"}" représente ${fmtDec((d.byCategory[0]?.amount ?? 0) / d.total * 100, 1)} % du total avec ${d.byCategory[0]?.count ?? 0} contrats. Forte dépendance à quelques acteurs.`,
                stats: [
                  { label: "Enveloppe", value: `${fmtMillions(d.byCategory[0]?.amount ?? 0, 0)} M €` },
                  { label: "Contrats", value: String(d.byCategory[0]?.count ?? 0) },
                  { label: "Part", value: `${fmtDec((d.byCategory[0]?.amount ?? 0) / d.total * 100, 0)} %` },
                ],
              },
              {
                flag: "Enveloppes pluriannuelles",
                title: "Un contrat notifié ≠ un chèque émis",
                body: "Les enveloppes max présentées sur cette page sont des plafonds contractuels. Le suivi budgétaire réel (dépenses engagées par exercice) n'est pas encore dans le périmètre.",
                stats: [
                  { label: "Total affiché", value: `${fmtBillions(d.total)} Md €` },
                  { label: "Contrats", value: fmtInt(d.nb) },
                  { label: "À venir", value: "CP exécutés" },
                ],
                cta: { href: "/methode#marches-publics", label: "Lire la méthode" },
              },
              {
                flag: "Transparence",
                title: "Ce que les données ne disent pas",
                body: "Les avenants, sous-traitants, et cessions de contrats ne sont pas publiés en open data. L'exhaustivité dépend du référentiel fourni par la Ville.",
                stats: [
                  { label: "Fournisseurs", value: fmtInt(d.nbTitulaires) },
                  { label: "Couverture", value: "≈ 95 %" },
                  { label: "Limites", value: "Documentées" },
                ],
                cta: { href: "/analyses", label: "Voir les limites" },
              },
            ]}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="07"
            kind="Dans le temps"
            title={<>Évolution <em>depuis {d.yearsSummary[0]?.year}</em>.</>}
            subtitle="Enveloppe max cumulée par année. L'activité contractuelle varie selon les cycles des programmes d'investissement (écoles, voirie, équipements sportifs)."
          />
          <BudgetTimeline
            points={d.yearsSummary
              .filter((y) => y.total > 0)
              .map((y) => ({
                year: y.year,
                value: y.total / 1_000_000_000,
                type: "execute" as const,
              }))}
            activeYear={d.year}
          />
          <p className="fx-note">
            <b>À noter</b> : un contrat notifié à l&apos;année N peut consommer son enveloppe étalée sur
            N+1, N+2, N+3. La courbe annuelle reflète donc l&apos;activité contractuelle, pas le cash annuel.
          </p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind="Sources & méthode"
            title={<>Vérifiable <em>ligne par ligne</em></>}
          />
          <div className="fx-sources">
            <div>
              <div className="n">Donnée source</div>
              <h3>Marchés notifiés {d.year}</h3>
              <p>
                Jeu de données <i>Marchés publics de la Ville de Paris</i> publié en open data. Chaque
                contrat porte un numéro, un objet, un titulaire (SIRET), et un couple montant min/max.
              </p>
              <a href="https://opendata.paris.fr" target="_blank" rel="noopener noreferrer">
                opendata.paris.fr ↗
              </a>
            </div>
            <div>
              <div className="n">Note importante</div>
              <h3>Enveloppes pluriannuelles</h3>
              <p>
                Les montants ci-dessus représentent des <b>plafonds contractuels</b> (montant max),
                pas des dépenses exécutées. Un marché notifié année N peut consommer son enveloppe
                sur N+1, N+2, N+3.
              </p>
              <a href="/methode#marches-publics">Lire la méthode →</a>
            </div>
            <div>
              <div className="n">Reproductibilité</div>
              <h3>Pipeline open source</h3>
              <p>
                Scripts d&apos;ingestion + agrégation publiés sous licence MIT. Chaque total peut
                être reconstruit depuis le JSON source.
              </p>
              <a href="https://github.com/AbstractsMachine" target="_blank" rel="noopener noreferrer">
                GitHub ↗
              </a>
            </div>
          </div>
          <ExportRow
            items={[
              { label: `CSV · ${d.year}`, primary: true, href: `/data/marches-publics/marches_${d.year}.json` },
              { label: "JSON", href: `/data/marches-publics/marches_${d.year}.json` },
              { label: "Index pluriannuel", href: "/data/marches-publics/index.json" },
              { label: "Méthode complète", href: "/methode#marches-publics" },
            ]}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind="Explorer plus loin"
            title="De l'enveloppe au chantier."
            subtitle="Les pages sœurs pour comprendre qui reçoit, où ça se construit, et comment le budget s'inscrit."
          />
          <div className="fx-grid-tiles">
            <TileCard
              href="/qui-recoit"
              number="01"
              kind="Classement"
              title="Subventions"
              description="Les associations soutenues, par thématique et montant."
              preview={<SvgClassement />}
              kpi="1,35"
              kpiUnit="Md €"
              kpiDelta={<>{d.year}</>}
            />
            <TileCard
              href="/investissements"
              number="02"
              kind="Carte"
              title="Investissements"
              description="Les 640 projets concrets financés par ces contrats."
              preview={<SvgCarte />}
              kpi="2,6"
              kpiUnit="Md €"
              kpiDelta={<>en cours</>}
            />
            <TileCard
              href="/budget"
              number="03"
              kind="Cadrage"
              title="Budget"
              description="Où s'inscrivent ces enveloppes dans le budget global."
              preview={<SvgFlux />}
              kpi="11,7"
              kpiUnit="Md €"
              kpiDelta={<>Total {d.year}</>}
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function SvgClassement() {
  return (
    <svg viewBox="0 0 200 100">
      {[14, 28, 42, 56, 70, 84].map((y, i) => (
        <g key={y}>
          <rect x="10" y={y - 1} width="4" height="4" className="fill-muted" fill="#9099a6" />
          <rect x="20" y={y - 1} width={90 - i * 12} height="6" className="fill" fill="#0a0a0a" />
        </g>
      ))}
    </svg>
  );
}

function SvgCarte() {
  return (
    <svg viewBox="0 0 200 100">
      <path d="M 28 30 Q 36 14 70 12 Q 110 10 140 18 Q 172 26 184 48 Q 188 72 168 86 Q 130 94 90 92 Q 50 90 28 72 Q 18 52 28 30 Z" className="stroke" fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
      {[[60, 34], [110, 30], [140, 36], [72, 70], [158, 68]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" className="fill" fill="#0a0a0a" />
      ))}
      <circle cx="118" cy="54" r="4" className="fill-sig" fill="#e11d1d" />
    </svg>
  );
}

function SvgFlux() {
  return (
    <svg viewBox="0 0 200 100">
      <path d="M 6 30 C 70 30 90 46 94 46" className="stroke" stroke="#0a0a0a" strokeWidth="8" fill="none" />
      <path d="M 6 60 C 70 60 90 54 94 54" className="stroke" stroke="#0a0a0a" strokeWidth="6" fill="none" />
      <rect x="92" y="38" width="16" height="24" className="fill" fill="#0a0a0a" />
      <path d="M 108 46 C 140 46 160 32 194 32" className="stroke" stroke="#0a0a0a" strokeWidth="8" fill="none" />
      <path d="M 108 58 C 140 58 160 74 194 74" className="stroke-sig" stroke="#e11d1d" strokeWidth="6" fill="none" />
    </svg>
  );
}
