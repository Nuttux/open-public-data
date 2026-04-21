import type { Metadata } from "next";
import { Suspense } from "react";
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
  BudgetTimeline,
  StackedBarTheme,
} from "@/components/fusion";
import QuiRecoitExplorer from "./QuiRecoitExplorer";
import {
  fmtBillions,
  fmtDec,
  fmtInt,
  fmtMillions,
  loadQuiRecoitData,
  loadQuiRecoitIndex,
} from "@/lib/fusion-data";

export const metadata: Metadata = {
  title: "Qui reçoit l'argent public ? — France Open Data",
  description:
    "Subventions versées par la Ville de Paris : bénéficiaires, thématiques, évolution. Données publiées en open data, reventilées et classifiées.",
  alternates: { canonical: "/qui-recoit" },
};

export default async function QuiRecoitPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const idx = loadQuiRecoitIndex();
  const d = loadQuiRecoitData(requestedYear);
  const dir: "up" | "down" | "flat" =
    d.deltaMontantPct > 0.1 ? "up" : d.deltaMontantPct < -0.1 ? "down" : "flat";
  const arrow = dir === "down" ? "↓" : dir === "flat" ? "→" : "↑";
  return (
    <div className="theme-fusion">
      <Navbar />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">02 · Subventions</div>
          <h1 className="fx-page-title">
            Qui <em>reçoit</em> l&apos;argent public ?
          </h1>
          <p className="fx-page-lede">
            <b>{fmtInt(d.nbSubventions)} subventions</b> versées en {d.year} à des
            associations, fondations et opérateurs publics. Les marchés publics aux
            entreprises, eux, sont détaillés sur leur propre page.
          </p>
          <div className="fx-page-actions">
            <YearPicker
              years={idx.availableYears.slice().sort((a, b) => a - b)}
              current={d.year}
              basePath="/qui-recoit"
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
              label={<>Montant total versé · {d.year}</>}
              value={fmtBillions(d.total)}
              unit="Md €"
              delta={{
                direction: dir,
                value: `${fmtDec(Math.abs(d.deltaMontantPct), 1)} %`,
                base: `vs ${d.previousYear}`,
              }}
              caption={
                <>
                  Soit <b>{fmtInt(d.nbSubventions)}</b> subventions versées. Certaines concernent plusieurs
                  lignes pour un même bénéficiaire (reconductions, avenants).
                </>
              }
            />
            <KPIGrid
              cols={2}
              items={[
                { label: "Subventions versées", value: fmtInt(d.nbSubventions), delta: `${arrow} ${fmtDec(Math.abs(d.deltaNbPct), 1)} % vs ${d.previousYear}` },
                { label: "Subvention médiane", value: d.medianSubvention >= 1_000_000 ? fmtMillions(d.medianSubvention, 1) + " M" : fmtInt(d.medianSubvention / 1_000) + " k", unit: "€", delta: "Moitié des aides au-dessus / en-dessous" },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind="Par thématique"
            title={<>Où va <em>l&apos;argent</em> ?</>}
            subtitle="Chaque segment de la barre = une thématique, proportionnelle au montant versé. Cliquez pour filtrer les bénéficiaires."
          />
          <StackedBarTheme
            items={d.byTheme.map((t) => ({ theme: t.theme, amount: t.amount, count: t.count }))}
            total={d.total}
            concentrationTop10Pct={d.concentrationTop10Pct}
            year={d.year}
            basePath="/qui-recoit"
            entityNoun="bénéficiaires"
            paretoContrast="soit plus que toutes les autres associations réunies en dehors du Social"
          />
        </div>
      </section>

      {/* Sections 03 (Top 10) + 04 (Recherche) are rendered together by
          QuiRecoitExplorer — placed AFTER the thematique view so users see
          WHERE the money goes before WHO gets it. */}
      <Suspense fallback={null}>
        <QuiRecoitExplorer
          year={d.year}
          top10={d.top10}
          allBeneficiaires={d.allBeneficiaires}
          themes={d.availableThemes}
          concentrationTop10Pct={d.concentrationTop10Pct}
        />
      </Suspense>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind="Dans le temps"
            title={<>Évolution <em>depuis {d.yearsSummary[0]?.year ?? 2019}</em>.</>}
            subtitle="Le total des subventions versées par la Ville, année par année. Les mouvements individuels (top hausses et top baisses vs l'année précédente) sont listés en-dessous."
          />
          <BudgetTimeline
            points={d.yearsSummary.map((y) => ({
              year: y.year,
              value: y.total / 1_000_000_000,
              type: "execute" as const,
            }))}
            activeYear={d.year}
          />

          <div className="fx-movers">
            <div className="fx-movers-col">
              <div className="fx-movers-head">
                <span>Top hausses <b>· vs {d.previousYear}</b></span>
                <span>Variation</span>
              </div>
              {d.movers.hausses.map((m, i) => (
                <div key={i} className="fx-mover-row">
                  <span className="l">{m.name}</span>
                  <span className="v">{m.amount >= 1e6 ? fmtMillions(m.amount, 1) + " M €" : fmtInt(m.amount / 1000) + " k €"}</span>
                  <span className="d up">↑ {fmtDec(m.delta, 1)} %</span>
                </div>
              ))}
            </div>
            <div className="fx-movers-col">
              <div className="fx-movers-head">
                <span>Top baisses <b>· vs {d.previousYear}</b></span>
                <span>Variation</span>
              </div>
              {d.movers.baisses.map((m, i) => (
                <div key={i} className="fx-mover-row">
                  <span className="l">{m.name}</span>
                  <span className="v">{m.amount >= 1e6 ? fmtMillions(m.amount, 1) + " M €" : fmtInt(m.amount / 1000) + " k €"}</span>
                  <span className="d down">↓ {fmtDec(Math.abs(m.delta), 1)} %</span>
                </div>
              ))}
            </div>
          </div>
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
              <h3>Subventions versées {d.year}</h3>
              <p>
                Jeu de données publié en open data par la Ville. Chaque ligne correspond à un bénéficiaire
                identifié (SIRET ou association) et un montant exécuté.
              </p>
              <a href="https://opendata.paris.fr/explore/dataset/subventions-accordees-et-refusees"
                 target="_blank" rel="noopener noreferrer">
                opendata.paris.fr ↗
              </a>
            </div>
            <div>
              <div className="n">Classification</div>
              <h3>Thématique par LLM + heuristiques</h3>
              <p>
                Les thématiques (Social, Culture, Sport, Éducation…) sont produites par un classifieur
                LLM sur l&apos;objet de la subvention, puis contrôlées manuellement pour les montants &gt; 1 M€.
              </p>
              <a href="/methode#subventions">Lire la méthode →</a>
            </div>
            <div>
              <div className="n">Reproductibilité</div>
              <h3>Pipeline open source</h3>
              <p>
                Scripts d&apos;extraction + dbt marts publics sous licence MIT. Les totaux par année
                peuvent être recalculés depuis le CSV d&apos;origine.
              </p>
              <a href="https://github.com/AbstractsMachine" target="_blank" rel="noopener noreferrer">
                GitHub ↗
              </a>
            </div>
          </div>
          <ExportRow
            items={[
              { label: `CSV · ${d.year}`, primary: true, href: `/data/subventions/beneficiaires_${d.year}.json` },
              { label: "JSON", href: `/data/subventions/beneficiaires_${d.year}.json` },
              { label: "Treemap JSON", href: `/data/subventions/treemap_${d.year}.json` },
              { label: "Méthode complète", href: "/methode#subventions" },
            ]}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind="Explorer plus loin"
            title="Qui reçoit, qui fournit, qui construit."
            subtitle="Les pages sœurs pour élargir le regard — marchés publics, projets localisés, patrimoine."
          />
          <div className="fx-grid-tiles">
            <TileCard
              href="/budget"
              number="01"
              kind="Cadrage"
              title="Le budget"
              description="Où s'inscrivent les subventions dans le budget global de la Ville."
              preview={
                <svg viewBox="0 0 200 100">
                  <path d="M 6 50 C 70 50 90 50 94 50" className="stroke" stroke="#0a0a0a" strokeWidth="10" fill="none" />
                  <rect x="92" y="40" width="16" height="20" className="fill" fill="#0a0a0a" />
                  <path d="M 108 30 C 140 30 160 30 194 30" className="stroke" stroke="#0a0a0a" strokeWidth="6" fill="none" />
                  <path d="M 108 50 C 140 50 160 60 194 60" className="stroke-sig" stroke="#e11d1d" strokeWidth="7" fill="none" />
                  <path d="M 108 70 C 140 70 160 80 194 80" className="stroke" stroke="#0a0a0a" strokeWidth="4" fill="none" />
                </svg>
              }
              kpi={fmtBillions(d.total / 0.12, 1)}
              kpiUnit="Md €"
              kpiDelta={<>Total budget {d.year}</>}
            />
            <TileCard
              href="/marches-publics"
              number="02"
              kind="Contrats"
              title="Marchés publics"
              description="Les entreprises fournisseuses — bâtiment, nettoyage, informatique."
              preview={
                <svg viewBox="0 0 200 100">
                  <rect x="10" y="20" width="80" height="10" className="fill" fill="#0a0a0a" />
                  <rect x="10" y="38" width="60" height="10" className="fill" fill="#0a0a0a" />
                  <rect x="10" y="56" width="100" height="10" className="fill-sig" fill="#e11d1d" />
                  <rect x="10" y="74" width="40" height="10" className="fill" fill="#0a0a0a" />
                  <rect x="120" y="20" width="70" height="10" className="fill-muted" fill="#9099a6" />
                  <rect x="120" y="56" width="60" height="10" className="fill-muted" fill="#9099a6" />
                </svg>
              }
              kpi="2,1"
              kpiUnit="Md €"
              kpiDelta={<>1 482 contrats</>}
            />
            <TileCard
              href="/logement-social"
              number="03"
              kind="Bailleurs"
              title="Logement social"
              description="Paris Habitat, RIVP, Elogie-Siemp — les opérateurs du parc social."
              preview={
                <svg viewBox="0 0 200 100">
                  <rect x="16" y="40" width="28" height="48" className="fill" fill="#0a0a0a" />
                  <rect x="52" y="28" width="28" height="60" className="fill" fill="#0a0a0a" />
                  <rect x="88" y="50" width="28" height="38" className="fill-sig" fill="#e11d1d" />
                  <rect x="124" y="20" width="28" height="68" className="fill" fill="#0a0a0a" />
                  <rect x="160" y="36" width="28" height="52" className="fill" fill="#0a0a0a" />
                </svg>
              }
              kpi="24,5"
              kpiUnit="%"
              kpiDelta={<>Taux SRU 2024</>}
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
