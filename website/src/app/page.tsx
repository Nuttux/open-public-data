import type { Metadata } from "next";
import Link from "next/link";
import "./fusion.css";

import {
  Navbar,
  Footer,
  Button,
  ScopeDropdown,
  BarRow,
  TileCard,
  BrandMark,
} from "@/components/fusion";
import HeroBg from "@/components/fusion/HeroBg";
import { fmtDec, fmtInt, fmtBillions, loadLandingStats } from "@/lib/fusion-data";

export const metadata: Metadata = {
  title: "Où va l'argent public à Paris ? — France Open Data",
  description:
    "Les finances publiques françaises, rendues lisibles. Budget, dépenses, subventions, dette — sourcés, vérifiables, publiés en licence ouverte.",
  alternates: { canonical: "/" },
};

export default function LandingPage() {
  const stats = loadLandingStats();
  const deltaPct = stats.deltaVsLastExecutedPct;
  const direction: "up" | "down" | "flat" =
    deltaPct > 0.1 ? "up" : deltaPct < -0.1 ? "down" : "flat";
  const arrow = direction === "down" ? "↓" : direction === "flat" ? "→" : "↑";
  const deltaEurPerMonthAbs = Math.abs(stats.deltaVsLastExecutedPerMonth);

  return (
    <div className="theme-fusion">
      <Navbar />

      {/* HERO */}
      <section className="fx-hero" id="hero">
        <HeroBg />
        <div className="fx-wrap">
          <h1>
            Où va <em>l&apos;argent public</em>
            <br />à{" "}
            <ScopeDropdown variant="h1" />
            {" "}?
          </h1>
          <p className="fx-lede">
            Les finances publiques françaises, rendues lisibles. Budget, dépenses,
            subventions, dette — sourcés, vérifiables, publiés en licence ouverte.
          </p>
          <div className="fx-ctas">
            <Button variant="primary" href="/budget">
              Explorer le budget {stats.year} →
            </Button>
          </div>
        </div>
      </section>

      {/* SCALE */}
      <section className="fx-scale" id="scale">
        <div className="fx-wrap">
          <p className="fx-hero-num-line">Chaque mois, la Ville dépense</p>
          <p className="fx-hero-num-big tnum">
            {fmtInt(stats.perCapitaMonth)}
            <span className="fx-hero-num-u">€</span>
            <span className="fx-hero-num-per">/ habitant</span>
          </p>
          <p className="fx-hero-num-delta">
            <span className={`fx-hero-num-arrow fx-hero-num-arrow-${direction}`}>
              {arrow} {fmtDec(Math.abs(deltaPct), 1)} %
            </span>
            <span className="fx-hero-num-sep">·</span>
            <span className="fx-hero-num-base">
              {direction === "down" ? "−" : "+"} {fmtInt(deltaEurPerMonthAbs)} €
            </span>
            <span>vs exercice {stats.lastExecutedYear}</span>
          </p>
          <p className="fx-hero-num-cap">
            Soit <b>{fmtInt(stats.perCapitaYear)} € par an et par habitant</b>.
            Budget voté {stats.year} rapporté aux <b>2 133 111</b> Parisiens et
            Parisiennes (INSEE) — calcul brut, toutes sections confondues.
          </p>

          <BarRow
            header={{
              left: (
                <>
                  Répartition par thématique ·{" "}
                  <b>€ par habitant, par mois</b>
                </>
              ),
              right: (
                <>
                  Total · <b>{fmtInt(stats.perCapitaMonth)} €</b>
                </>
              ),
            }}
            items={stats.breakdown.map((b) => ({
              label: b.label === "Autres (D)" ? "Autres" : b.label,
              value: b.perMonth,
              unit: "€",
              display: fmtInt(b.perMonth),
            }))}
          />
        </div>
      </section>

      {/* INSIDE — tiles */}
      <section className="fx-inside" id="inside">
        <div className="fx-wrap">
          <h2>
            Un aperçu
            <br />
            des <em>analyses possibles</em>.
          </h2>
          <p className="fx-sub">
            Le site contient de multiples pages, onglets et filtres. En voici
            quelques-uns pour vous donner une idée — où va l&apos;argent, comment
            ça évolue, dans quels quartiers, pour qui.
          </p>

          <div className="fx-grid-tiles">
            <TileCard
              href="/budget"
              number="01"
              kind="Flux de l'argent"
              title="Budget"
              description="Où va l'argent ? Flux complet des recettes aux emplois, ventilé par fonction."
              preview={
                <svg viewBox="0 0 200 100">
                  <path d="M 6 22 C 70 22 90 46 94 46" className="stroke" stroke="#0a0a0a" strokeWidth="10" fill="none" />
                  <path d="M 6 46 C 70 46 90 50 94 50" className="stroke" stroke="#0a0a0a" strokeWidth="7" fill="none" />
                  <path d="M 6 70 C 70 70 90 54 94 54" className="stroke" stroke="#0a0a0a" strokeWidth="5" fill="none" />
                  <rect x="92" y="36" width="16" height="28" className="fill" fill="#0a0a0a" />
                  <path d="M 108 44 C 140 44 160 26 194 26" className="stroke" stroke="#0a0a0a" strokeWidth="9" fill="none" />
                  <path d="M 108 50 C 140 50 160 52 194 52" className="stroke" stroke="#0a0a0a" strokeWidth="6" fill="none" />
                  <path d="M 108 58 C 140 58 160 82 194 82" className="stroke-sig" stroke="#e11d1d" strokeWidth="7" fill="none" />
                </svg>
              }
              kpi={fmtBillions(stats.totalDepenses)}
              kpiUnit="Md €"
              kpiDelta={
                <>
                  {arrow} <b>{fmtDec(Math.abs(deltaPct), 1)} %</b> vs {stats.lastExecutedYear}
                </>
              }
            />

            <TileCard
              href="/budget"
              number="02"
              kind="Chronologie"
              title="Évolution"
              description="Paris s'endette-t-elle ? Épargne brute, dette, ratio — 2019 à 2026."
              preview={
                <svg viewBox="0 0 200 100">
                  <line x1="10" y1="85" x2="190" y2="85" className="stroke-muted" stroke="#9099a6" strokeWidth="1" />
                  <polyline points="10,70 40,62 70,55 100,46 130,34 160,24 190,14" className="stroke" stroke="#0a0a0a" strokeWidth="2.5" fill="none" />
                  {[[10,70],[40,62],[70,55],[100,46],[130,34],[160,24]].map(([x,y]) => (
                    <circle key={`${x}-${y}`} cx={x} cy={y} r="3" className="fill" fill="#0a0a0a" />
                  ))}
                  <circle cx="190" cy="14" r="5" className="fill-sig" fill="#e11d1d" />
                </svg>
              }
              kpi="+ 14,2"
              kpiUnit="%"
              kpiDelta={<>Budget total <b>vs 2019</b></>}
            />

            <TileCard
              href="/investissements"
              number="03"
              kind="Carte"
              title="Investissements"
              description="Quels travaux dans mon quartier ? Projets géolocalisés, arrondissement par arrondissement."
              preview={
                <svg viewBox="0 0 200 100">
                  <path d="M 28 30 Q 36 14 70 12 Q 110 10 140 18 Q 172 26 184 48 Q 188 72 168 86 Q 130 94 90 92 Q 50 90 28 72 Q 18 52 28 30 Z" className="stroke" fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
                  <path d="M 22 58 Q 60 50 90 60 Q 120 70 160 58 Q 180 52 190 48" className="stroke" stroke="#0a0a0a" strokeWidth="2" fill="none" opacity=".55" />
                  {[[60,34],[86,42],[110,30],[140,36],[72,70],[104,78],[132,72],[158,68]].map(([x,y]) => (
                    <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" className="fill" fill="#0a0a0a" />
                  ))}
                  <circle cx="118" cy="54" r="4" className="fill-sig" fill="#e11d1d" />
                </svg>
              }
              kpi="2,6"
              kpiUnit="Md €"
              kpiDelta={<>↑ <b>8,4 %</b> vs {stats.lastExecutedYear}</>}
            />

            <TileCard
              href="/qui-recoit"
              number="04"
              kind="Classement"
              title="Subventions"
              description="Qui reçoit des subventions ? 6 000 associations financées, triables par thématique et montant."
              preview={
                <svg viewBox="0 0 200 100">
                  {[14, 28, 42, 56, 70, 84].map((y, i) => (
                    <g key={y}>
                      <rect x="10" y={y - 1} width="4" height="4" className="fill-muted" fill="#9099a6" />
                      <rect x="20" y={y - 1} width={90 - i * 12} height="6" className="fill" fill="#0a0a0a" />
                      <rect x="160" y={y - 1} width="30" height="6" className="fill-muted" fill="#9099a6" />
                    </g>
                  ))}
                </svg>
              }
              kpi="312"
              kpiUnit="M €"
              kpiDelta={<>↑ <b>3,3 %</b> vs 2023</>}
            />

            <TileCard
              href="/dette-patrimoine"
              number="05"
              kind="Bilan"
              title="Patrimoine"
              description="Que possède la Ville ? L'actif (terrains, bâtiments, réseaux) face au passif (capitaux propres, dette)."
              preview={
                <svg viewBox="0 0 200 100">
                  <text x="62" y="98" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" className="fill-muted" fill="#9099a6" letterSpacing="1">ACTIF</text>
                  <text x="138" y="98" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="9" className="fill-muted" fill="#9099a6" letterSpacing="1">PASSIF</text>
                  <rect x="32" y="6"  width="60" height="40" className="fill" fill="#0a0a0a" />
                  <rect x="32" y="48" width="60" height="24" className="fill" fill="#0a0a0a" opacity=".75" />
                  <rect x="32" y="74" width="60" height="12" className="fill" fill="#0a0a0a" opacity=".5" />
                  <rect x="108" y="6"  width="60" height="46" className="fill" fill="#0a0a0a" />
                  <rect x="108" y="54" width="60" height="32" className="fill-sig" fill="#e11d1d" />
                </svg>
              }
              kpi="26"
              kpiUnit="Md €"
              kpiDelta={<>Dette <b>8,5 Md €</b> · 31.12.24</>}
            />

            <TileCard
              href="/budget"
              number="06"
              kind="Voté vs exécuté"
              title="Voté vs exécuté"
              description="Ce qui est voté est-il dépensé ? L'écart entre le budget voté et les comptes réels, ligne par ligne."
              preview={
                <svg viewBox="0 0 200 100">
                  <line x1="6" y1="90" x2="194" y2="90" className="stroke-muted" stroke="#9099a6" strokeWidth="1" />
                  <rect x="18"  y="22" width="14" height="68" className="stroke" fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
                  <rect x="34"  y="34" width="14" height="56" className="fill" fill="#0a0a0a" />
                  <rect x="58"  y="38" width="14" height="52" className="stroke" fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
                  <rect x="74"  y="44" width="14" height="46" className="fill" fill="#0a0a0a" />
                  <rect x="98"  y="48" width="14" height="42" className="stroke" fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
                  <rect x="114" y="30" width="14" height="60" className="fill-sig" fill="#e11d1d" />
                  <rect x="138" y="26" width="14" height="64" className="stroke" fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
                  <rect x="154" y="36" width="14" height="54" className="fill" fill="#0a0a0a" />
                </svg>
              }
              kpi="± 3,8"
              kpiUnit="%"
              kpiDelta={<>Écart moyen <b>2019–2024</b></>}
            />
          </div>

          <div className="fx-grid-foot">
            <Link href="/budget">Voir toutes les analyses et tableaux →</Link>
          </div>
        </div>
      </section>

      {/* MÉTHODE */}
      <section className="fx-meth" id="meth">
        <div className="fx-wrap">
          <h2>
            Vérifiable, <em>ligne par ligne</em>.
          </h2>
          <div className="fx-meth-cols">
            <div className="fx-meth-c">
              <div className="fx-meth-n">01 / Sources</div>
              <h3>Au-delà de l&apos;Open Data</h3>
              <p>
                Comptes administratifs M57, données opendata.paris.fr, délibérations
                du Conseil de Paris. On extrait aussi les investissements localisés
                depuis les PDFs et on classifie les subventions.
              </p>
              <Link href="/methode">Voir les sources →</Link>
            </div>
            <div className="fx-meth-c">
              <div className="fx-meth-n">02 / Pipeline</div>
              <h3>Reproductible de bout en bout</h3>
              <p>
                Du CSV brut à la visualisation, chaque étape est documentée.
                Un chiffre qui surprend peut toujours être remonté jusqu&apos;à son origine.
              </p>
              <Link href="/methode">Lire la méthode →</Link>
            </div>
            <div className="fx-meth-c">
              <div className="fx-meth-n">03 / Code</div>
              <h3>Ouvert, licence MIT</h3>
              <p>
                Scripts d&apos;extraction, modèles de données, visualisations —
                tout est sur GitHub. Forkez, proposez, corrigez.
              </p>
              <a href="https://github.com/Nuttux/open-public-data" target="_blank" rel="noopener noreferrer">
                GitHub ↗
              </a>
            </div>
          </div>

          <div className="fx-byline">
            <div className="fx-byline-left">
              <span className="fx-byline-mark">
                <BrandMark size={54} />
              </span>
              <div className="fx-byline-text">
                <div className="fx-byline-name">
                  <b>France Open Data</b> · collectif indépendant
                </div>
                <div className="fx-byline-meta">
                  Toutes les analyses sont reproductibles depuis les CSV bruts · dernière revue 18 avril 2026
                </div>
              </div>
            </div>
            <div className="fx-byline-actions">
              <a className="fx-btn fx-btn-small" href="/analyses">
                Documentation
              </a>
              <a
                className="fx-btn fx-btn-small"
                href="https://github.com/Nuttux/open-public-data"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub ↗
              </a>
              <a className="fx-btn fx-btn-small" href="mailto:contact@franceopendata.org">
                Contact
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
