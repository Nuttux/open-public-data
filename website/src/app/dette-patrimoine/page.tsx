import type { Metadata } from "next";
import "../fusion.css";

import {
  Navbar,
  Footer,
  SectionHead,
  HeroNumber,
  KPIGrid,
  BarRow,
  TileCard,
  YearPicker,
  ExportRow,
} from "@/components/fusion";
import {
  fmtBillions,
  fmtDec,
  fmtInt,
  fmtMillions,
  loadPatrimoineData,
} from "@/lib/fusion-data";

export const metadata: Metadata = {
  title: "Dette & patrimoine — France Open Data",
  description:
    "Le bilan consolidé de la Ville de Paris : actif, passif, dette, fonds propres. Règle d'or et garde-fous d'équilibre.",
  alternates: { canonical: "/dette-patrimoine" },
};

export default async function DettePatrimoinePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const d = loadPatrimoineData(requestedYear);
  const net = d.fondsPropres; // patrimoine net ≈ fonds propres
  const detteParHab = d.detteFinanciere / 2_133_111;

  const first = d.yearsSummary[0];
  const last = d.yearsSummary[d.yearsSummary.length - 1];
  const deltaDettePct = first ? ((last.dette - first.dette) / first.dette) * 100 : 0;
  const dir: "up" | "down" | "flat" = deltaDettePct > 0.1 ? "up" : deltaDettePct < -0.1 ? "down" : "flat";

  return (
    <div className="theme-fusion">
      <Navbar />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">05 · Dette &amp; patrimoine</div>
          <h1 className="fx-page-title">
            Ce que la Ville <em>possède</em>,<br />
            ce qu&apos;elle <b>doit</b>.
          </h1>
          <p className="fx-page-lede">
            Bilan comptable consolidé au 31/12/{d.year} : actif, passif, structure de la dette,
            règle d&apos;or d&apos;équilibre budgétaire.
          </p>
          <div className="fx-page-actions">
            <YearPicker
              years={d.availableYears}
              current={d.year}
              basePath="/dette-patrimoine"
              label="Exercice"
            />
          </div>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind="Règle d'or"
            title={<>Les <em>garde-fous</em></>}
            subtitle="Les quatre règles d'équilibre qu'une collectivité doit respecter pour rester solvable."
          />
          <div className="fx-sources fx-sources-2">
            <div>
              <div className="n">01 / Équilibre réel</div>
              <h3>Section de fonctionnement votée en équilibre</h3>
              <p>
                Les recettes de fonctionnement doivent couvrir les dépenses de fonctionnement.
                Impossible d&apos;emprunter pour payer le personnel ou les subventions courantes.
              </p>
            </div>
            <div>
              <div className="n">02 / Emprunt affecté</div>
              <h3>L&apos;emprunt finance uniquement l&apos;investissement</h3>
              <p>
                Pas de dette pour payer les dépenses courantes. La dette sert à construire
                des écoles, des piscines, des logements — des actifs qui servent longtemps.
              </p>
            </div>
            <div>
              <div className="n">03 / Remboursement</div>
              <h3>Le capital de la dette se rembourse par des ressources propres</h3>
              <p>
                Chaque année, le remboursement du capital des emprunts doit provenir de
                l&apos;épargne, pas d&apos;un autre emprunt.
              </p>
            </div>
            <div>
              <div className="n">04 / Sincérité</div>
              <h3>Le budget doit être sincère</h3>
              <p>
                Les recettes sont estimées sans surévaluation, les dépenses sans sous-estimation.
                Contrôle par la Chambre régionale des comptes.
              </p>
            </div>
          </div>
          <p className="fx-note">
            <b>Une commune peut-elle faire faillite ?</b> Techniquement non : en cas de grave
            déséquilibre, l&apos;État (via le préfet et la CRC) reprend la main et impose un
            redressement. Les collectivités ne peuvent pas être mises en liquidation judiciaire.
          </p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead number="02" kind="Vue d'ensemble" title={<>Le <em>patrimoine net</em></>} />
          <div className="fx-overview">
            <HeroNumber
              label={<>Fonds propres · 31.12.{d.year}</>}
              value={fmtBillions(net)}
              unit="Md €"
              caption={
                <>
                  L&apos;équation : <b>{fmtBillions(d.actif)} Md € d&apos;actif − {fmtBillions(d.detteTotale + d.provisions)} Md € de dette & provisions
                  = {fmtBillions(net)} Md €</b> de fonds propres. Soit environ <b>{fmtInt(net / 2_133_111)} €</b> par habitant.
                </>
              }
            />
            <KPIGrid
              cols={2}
              items={[
                { label: "Actif total", value: fmtBillions(d.actif), unit: "Md €", delta: "Immobilisations + circulant" },
                { label: "Dette financière", value: fmtBillions(d.detteFinanciere), unit: "Md €", delta: `${fmtInt(detteParHab)} € / habitant` },
                { label: "Provisions", value: fmtMillions(d.provisions, 0), unit: "M €", delta: "Risques et charges" },
                { label: "Capacité désendett.", value: fmtDec(d.capaciteDesendettement, 1), unit: "ans", delta: "Dette / épargne brute" },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind="Bilan"
            title={<>L&apos;<em>actif</em> et le <b>passif</b></>}
            subtitle="À gauche : ce que la Ville possède. À droite : comment c'est financé (fonds propres + dettes + provisions)."
          />
          <div className="fx-dual">
            <div>
              <div className="fx-dual-head">Actif · {d.year}</div>
              <div className="fx-dual-total tnum">
                {fmtBillions(d.actif)}<span className="u">Md €</span>
              </div>
              <BarRow
                items={d.actifBreakdown.map((a) => ({
                  label: a.label,
                  value: a.value,
                  display: fmtBillions(a.value),
                  unit: "Md €",
                }))}
              />
            </div>
            <div>
              <div className="fx-dual-head">Passif · {d.year}</div>
              <div className="fx-dual-total tnum">
                {fmtBillions(d.passif)}<span className="u">Md €</span>
              </div>
              <BarRow
                items={d.passifBreakdown.map((p) => ({
                  label: p.label,
                  value: p.value,
                  display: fmtBillions(p.value),
                  unit: "Md €",
                }))}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind="Structure de la dette"
            title={<>À qui Paris <em>emprunte</em> ?</>}
            subtitle="La dette financière se répartit entre dettes bancaires, obligations (marchés de capitaux) et prêts structurés."
          />
          <BarRow
            header={{
              left: <>Décomposition dette · <b>31.12.{d.year}</b></>,
              right: <>Total · <b>{fmtBillions(d.detteTotale)} Md €</b></>,
            }}
            items={[
              { label: "Dettes financières", value: d.detteFinanciere, display: fmtBillions(d.detteFinanciere), unit: "Md €" },
              { label: "Dettes non financières", value: d.detteNonFinanciere, display: fmtMillions(d.detteNonFinanciere, 0), unit: "M €" },
              { label: "Provisions", value: d.provisions, display: fmtMillions(d.provisions, 0), unit: "M €" },
            ]}
          />
          <p className="fx-note">
            Le détail par instrument (obligations, emprunts bancaires, placements structurés)
            n&apos;est pas publié en open data à la résolution nécessaire. Nous reconstruisons
            la structure depuis les annexes financières des comptes administratifs.
          </p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="04b"
            kind="Patrimoine en détail"
            title={<>Ce que <em>la Ville possède</em></>}
            subtitle="Ventilation de l'actif par grandes masses : immobilier, voirie, matériel, participations, trésorerie. Les SEM et offices publics ont leur propre bilan (cf. bailleurs sociaux)."
          />
          <BarRow
            header={{
              left: <>Actif · <b>31.12.{d.year}</b></>,
              right: <>Total · <b>{fmtBillions(d.actif)} Md €</b></>,
            }}
            items={d.actifBreakdown.map((a) => ({
              label: a.label,
              value: a.value,
              display: a.value >= 1e9 ? fmtBillions(a.value) : fmtMillions(a.value, 0),
              unit: a.value >= 1e9 ? "Md €" : "M €",
            }))}
          />
          <p className="fx-note">
            <b>À noter</b> : les immobilisations représentent la quasi-totalité de l&apos;actif
            (&gt; 95 %). Elles incluent les bâtiments, les équipements, la voirie, les réseaux
            — évalués au coût historique, pas à la valeur de marché.
          </p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="04c"
            kind="Hors-bilan"
            title={<>Engagements <em>hors-bilan</em></>}
            subtitle="Garanties, SEM, partenariats — des engagements qui ne figurent pas au bilan mais pèsent sur la solvabilité."
          />
          <table className="fx-table">
            <thead>
              <tr>
                <th>Engagement</th>
                <th>Entité</th>
                <th style={{ textAlign: "right" }}>Ordre de grandeur</th>
                <th>Niveau de risque</th>
              </tr>
            </thead>
            <tbody>
              {[
                { e: "Garanties d'emprunts logement social", ent: "Paris Habitat · RIVP · Elogie-Siemp", amount: "≈ 7–9 Md €", risk: "Faible" },
                { e: "Participations SEM (Semaest, Semapa…)", ent: "SEM d'aménagement", amount: "≈ 400–600 M €", risk: "Moyen" },
                { e: "Contrats de partenariat (anciens PPP)", ent: "Divers opérateurs", amount: "≈ 300 M €", risk: "Moyen" },
                { e: "Cautions diverses (associations, coop.)", ent: "Opérateurs associatifs", amount: "< 100 M €", risk: "Faible" },
                { e: "Engagements Vélib', Autolib', Vélos", ent: "Syndicat / délégataires", amount: "≈ 200 M €", risk: "Moyen" },
              ].map((row, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{row.e}</td>
                  <td className="muted">{row.ent}</td>
                  <td className="num">{row.amount}</td>
                  <td>
                    <span style={{
                      fontFamily: "var(--f-mono)",
                      fontSize: 11,
                      letterSpacing: ".04em",
                      color: row.risk === "Faible" ? "var(--bleu)" : row.risk === "Moyen" ? "var(--ocre)" : "var(--rouge)",
                    }}>
                      {row.risk.toUpperCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fx-note">
            Ordres de grandeur reconstruits depuis les annexes &quot;engagements hors-bilan&quot; des
            comptes administratifs. Le détail ligne par ligne n&apos;est pas publié en open data —
            à produire.
          </p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind="Évolution"
            title={<>Trajectoire <em>2019–{d.year}</em></>}
            subtitle={
              <>
                Actif, dette et fonds propres, année par année. La dette a{" "}
                <b>{dir === "up" ? "augmenté" : dir === "down" ? "baissé" : "peu bougé"}</b> de{" "}
                <b>{fmtDec(Math.abs(deltaDettePct), 1)} %</b> sur la période.
              </>
            }
          />
          <table className="fx-table">
            <thead>
              <tr>
                <th>Année</th>
                <th style={{ textAlign: "right" }}>Actif</th>
                <th style={{ textAlign: "right" }}>Fonds propres</th>
                <th style={{ textAlign: "right" }}>Dette totale</th>
                <th style={{ textAlign: "right" }}>Dette / habitant</th>
              </tr>
            </thead>
            <tbody>
              {d.yearsSummary.slice().reverse().map((y) => (
                <tr key={y.year}>
                  <td className="rank">{y.year}</td>
                  <td className="num">{fmtBillions(y.actif)} <span className="muted">Md €</span></td>
                  <td className="num">{fmtBillions(y.fondsPropres)} <span className="muted">Md €</span></td>
                  <td className="num">{fmtBillions(y.dette)} <span className="muted">Md €</span></td>
                  <td className="num muted">{fmtInt(y.dette / 2_133_111)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
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
              <h3>Bilan comptable {d.year} (M57)</h3>
              <p>
                Compte de gestion de la Ville, arrêté au 31 décembre. Publié chaque année
                sur opendata.paris.fr avec les comptes administratifs.
              </p>
              <a href="https://opendata.paris.fr" target="_blank" rel="noopener noreferrer">
                opendata.paris.fr ↗
              </a>
            </div>
            <div>
              <div className="n">Pipeline</div>
              <h3>Reconstruction dbt</h3>
              <p>
                Le bilan est reconstruit via <code>core_bilan_comptable</code> (dbt) qui
                normalise les comptes de classe 1 à 5 et agrège les grandes masses.
              </p>
              <a href="/methode#dette-patrimoine">Lire la méthode →</a>
            </div>
            <div>
              <div className="n">Limites</div>
              <h3>Ce qui manque encore</h3>
              <p>
                Structure fine de la dette (par instrument, par maturité), détail hors-bilan,
                bilans consolidés des SEM et offices — non publiés en open data aujourd&apos;hui.
              </p>
              <a href="https://github.com/AbstractsMachine" target="_blank" rel="noopener noreferrer">
                GitHub ↗
              </a>
            </div>
          </div>
          <ExportRow
            items={[
              { label: `CSV · ${d.year}`, primary: true, href: `/data/bilan_sankey_${d.year}.json` },
              { label: "JSON", href: `/data/bilan_sankey_${d.year}.json` },
              { label: "Index pluriannuel", href: "/data/bilan_index.json" },
              { label: "Méthode complète", href: "/methode#dette-patrimoine" },
            ]}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead number="07" kind="Explorer plus loin" title="Continuer" />
          <div className="fx-grid-tiles">
            <TileCard
              href="/budget"
              number="01"
              kind="Cadrage"
              title="Budget"
              description="L'exercice en cours — recettes, dépenses, solde."
              preview={<SvgFlux />}
              kpi="11,7"
              kpiUnit="Md €"
              kpiDelta={<>Voté 2026</>}
            />
            <TileCard
              href="/investissements"
              number="02"
              kind="Carte"
              title="Investissements"
              description="Ce qui alimente le patrimoine — projets en cours et livrés."
              preview={<SvgCarte />}
              kpi="2,1"
              kpiUnit="Md €"
              kpiDelta={<>2024</>}
            />
            <TileCard
              href="/logement-social"
              number="03"
              kind="Bailleurs"
              title="Logement social"
              description="Le patrimoine social géré par les bailleurs de la Ville."
              preview={<SvgLogement />}
              kpi="258"
              kpiUnit="k logements"
              kpiDelta={<>SRU 24,5 %</>}
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
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

function SvgLogement() {
  return (
    <svg viewBox="0 0 200 100">
      <rect x="16" y="40" width="28" height="48" className="fill" fill="#0a0a0a" />
      <rect x="52" y="28" width="28" height="60" className="fill" fill="#0a0a0a" />
      <rect x="88" y="50" width="28" height="38" className="fill-sig" fill="#e11d1d" />
      <rect x="124" y="20" width="28" height="68" className="fill" fill="#0a0a0a" />
      <rect x="160" y="36" width="28" height="52" className="fill" fill="#0a0a0a" />
    </svg>
  );
}
