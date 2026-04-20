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
  SignauxFaibles,
  ProjectMap,
} from "@/components/fusion";
import {
  fmtBillions,
  fmtDec,
  fmtInt,
  fmtMillions,
  loadInvestissementsData,
} from "@/lib/fusion-data";

export const metadata: Metadata = {
  title: "Investissements — France Open Data",
  description:
    "Les chantiers de Paris en un coup d'œil : projets, budgets, arrondissements. Investissements extraits des comptes administratifs et classifiés.",
  alternates: { canonical: "/investissements" },
};

const suf = (n: number) => (n === 1 ? "er" : "ᵉ");

export default async function InvestissementsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const d = loadInvestissementsData(requestedYear);
  const topProj = d.topProjets.slice(0, 8);
  const ytrend = d.yearsSummary;
  const delta5y =
    ytrend.length >= 2
      ? ((ytrend[ytrend.length - 1].total - ytrend[0].total) / ytrend[0].total) * 100
      : 0;
  const delta5yDir: "up" | "down" | "flat" = delta5y > 0.1 ? "up" : delta5y < -0.1 ? "down" : "flat";

  return (
    <div className="theme-fusion">
      <Navbar />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">04 · Investissements</div>
          <h1 className="fx-page-title">
            Les <em>chantiers</em> de Paris
          </h1>
          <p className="fx-page-lede">
            {fmtInt(d.nbProjets)} opérations d&apos;investissement recensées en {d.year},
            dont <b>{fmtDec(d.pctGeo, 0)} % géolocalisées</b>. Extraites des PDFs des comptes
            administratifs puis classifiées.
          </p>
          <div className="fx-page-actions">
            <YearPicker
              years={d.availableYears}
              current={d.year}
              basePath="/investissements"
              label="Exercice"
            />
          </div>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead number="01" kind="Vue d'ensemble" title={<>Combien <em>la Ville investit</em> ?</>} />
          <div className="fx-overview">
            <HeroNumber
              label={<>Investissement total · {d.year}</>}
              value={fmtBillions(d.total)}
              unit="Md €"
              delta={{
                direction: delta5yDir,
                value: `${fmtDec(Math.abs(delta5y), 1)} %`,
                base: `vs ${ytrend[0]?.year}`,
              }}
              caption={
                <>
                  Hors dette et participations : <b>{fmtBillions(d.totalHorsDette)} Md €</b>.
                  C&apos;est la somme qui finance les écoles, la voirie, les logements, les équipements.
                </>
              }
            />
            <KPIGrid
              cols={2}
              items={[
                { label: "Projets recensés", value: fmtInt(d.nbProjets), delta: "Dans les annexes CA" },
                { label: "Géolocalisés", value: `${fmtDec(d.pctGeo, 0)} %`, delta: `${fmtInt(d.nbGeo)} projets` },
                { label: "Top chapitre", value: d.byChapitre[0]?.label ?? "—", delta: d.byChapitre[0] ? fmtMillions(d.byChapitre[0].amount) + " M €" : "—" },
                { label: "Arrondissement #1", value: d.byArrondissement[0] ? `${d.byArrondissement[0].arr}${suf(d.byArrondissement[0].arr)}` : "—", delta: d.byArrondissement[0] ? fmtMillions(d.byArrondissement[0].amount) + " M €" : "—" },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="01b"
            kind="Carte"
            title={<>Où <em>l&apos;argent atterrit</em></>}
            subtitle={`Les ${fmtInt(d.nbGeo)} projets géolocalisés sur la carte de Paris. La taille des points est proportionnelle au montant ; le rouge indique les opérations > 10 M €.`}
          />
          <ProjectMap points={d.geoPoints} maxAmount={d.topProjets[0]?.amount ?? 1e6} height={520} />
          <p className="fx-note">
            <b>Limites</b> : {fmtDec(100 - d.pctGeo, 0)} % des projets ne sont pas géolocalisables
            (opérations transverses, dotations centrales, études). Ils ne figurent pas sur la carte
            mais sont comptabilisés dans tous les autres indicateurs.
          </p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind="Par chapitre"
            title={<>Ce que <em>la Ville construit</em></>}
            subtitle="Classification fonctionnelle issue du budget. L'aménagement & l'habitat pèsent le plus, suivis des équipements culturels et sportifs."
          />
          <BarRow
            header={{
              left: <>Chapitres d&apos;investissement · <b>{d.year}</b></>,
              right: <>Total · <b>{fmtBillions(d.total)} Md €</b></>,
            }}
            items={d.byChapitre.map((c) => ({
              label: c.label,
              value: c.amount,
              display: fmtMillions(c.amount, 0),
              unit: "M €",
            }))}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind="Par arrondissement"
            title={<>Où <em>l&apos;argent atterrit</em></>}
            subtitle="Somme des projets localisés par arrondissement. Les montants non géolocalisés (projets transverses, acquisitions centrales) ne sont pas inclus."
          />
          <BarRow
            header={{
              left: <>20 arrondissements · <b>projets géolocalisés</b></>,
              right: <>{fmtInt(d.nbGeo)} projets · <b>{fmtMillions(d.byArrondissement.reduce((s, a) => s + a.amount, 0), 0)} M €</b></>,
            }}
            items={d.byArrondissement.slice(0, 20).map((a) => ({
              label: `${a.arr}${suf(a.arr)} arrondissement`,
              value: a.amount,
              display: fmtMillions(a.amount, a.amount >= 10_000_000 ? 0 : 1),
              unit: "M €",
            }))}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind="Projets phares"
            title={<>Les <em>dix plus gros</em> projets</>}
          />
          <table className="fx-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Projet</th>
                <th>Arrondissement</th>
                <th>Chapitre</th>
                <th style={{ textAlign: "right" }}>Montant</th>
              </tr>
            </thead>
            <tbody>
              {topProj.map((p, i) => (
                <tr key={i}>
                  <td className="rank">{String(i + 1).padStart(2, "0")}</td>
                  <td style={{ fontWeight: 500 }}>{(p.name ?? "—").slice(0, 80)}</td>
                  <td className="muted">{p.arr > 0 ? `${p.arr}${suf(p.arr)}` : "transv."}</td>
                  <td className="muted">{p.chapitre}</td>
                  <td className="num">{p.amount >= 1e6 ? fmtMillions(p.amount, 1) + " M €" : fmtInt(p.amount / 1000) + " k €"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind="Évolution"
            title={<>Trajectoire <em>2019–{d.year}</em></>}
          />
          <table className="fx-table">
            <thead>
              <tr>
                <th>Année</th>
                <th style={{ textAlign: "right" }}>Investissement total</th>
                <th style={{ textAlign: "right" }}>Hors dette</th>
              </tr>
            </thead>
            <tbody>
              {ytrend.slice().reverse().map((y) => (
                <tr key={y.year}>
                  <td className="rank">{y.year}</td>
                  <td className="num">{fmtBillions(y.total)} <span className="muted">Md €</span></td>
                  <td className="num">{fmtBillions(y.horsDette)} <span className="muted">Md €</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="fx-note">
            <b>À noter</b> : les projets sont extraits des annexes PDF du compte administratif via
            un pipeline LLM + heuristiques. Environ <b>{Math.round(100 - d.pctGeo)} %</b> des projets
            ne sont pas géolocalisables (opérations transverses, dotations centrales).
          </p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind="Signaux faibles"
            title={<>Projets <em>à surveiller</em></>}
            subtitle="Opérations notables pour leur volume, leur concentration territoriale ou l'absence de géolocalisation. Pas un signal de dérive — un appel à regarder de près."
          />
          <SignauxFaibles
            note={
              <>
                <b>Méthode</b> : repérage heuristique sur montants &gt; 10 M €, projets non géolocalisés
                (transverses), et concentration par arrondissement. Chaque projet peut être réexaminé
                depuis sa fiche.
              </>
            }
            items={[
              {
                flag: "Projets phare",
                title: `${d.topProjets[0]?.name.slice(0, 60) ?? "—"}`,
                body: `Le plus gros investissement de ${d.year} cumule ${fmtMillions(d.topProjets[0]?.amount ?? 0, 1)} M €, soit ${fmtDec((d.topProjets[0]?.amount ?? 0) / d.total * 100, 2)} % du total annuel.`,
                stats: [
                  { label: "Montant", value: `${fmtMillions(d.topProjets[0]?.amount ?? 0, 1)} M €` },
                  { label: "Arr.", value: d.topProjets[0] && d.topProjets[0].arr > 0 ? `${d.topProjets[0].arr}${suf(d.topProjets[0].arr)}` : "transv." },
                  { label: "Chap.", value: (d.topProjets[0]?.chapitre ?? "").slice(0, 14) },
                ],
              },
              {
                flag: "Concentration territoriale",
                title: `${d.byArrondissement[0] ? `${d.byArrondissement[0].arr}${suf(d.byArrondissement[0].arr)} arrondissement` : "—"}`,
                body: `Le premier arrondissement en volume reçoit ${fmtMillions(d.byArrondissement[0]?.amount ?? 0, 0)} M € — ${fmtDec((d.byArrondissement[0]?.amount ?? 0) / d.byArrondissement.reduce((s, a) => s + a.amount, 0) * 100, 0)} % des projets géolocalisés.`,
                stats: [
                  { label: "Montant", value: `${fmtMillions(d.byArrondissement[0]?.amount ?? 0, 0)} M €` },
                  { label: "Projets", value: String(d.byArrondissement[0]?.count ?? 0) },
                  { label: "Part", value: `${fmtDec((d.byArrondissement[0]?.amount ?? 0) / d.byArrondissement.reduce((s, a) => s + a.amount, 0) * 100, 0)} %` },
                ],
              },
              {
                flag: "Non localisé",
                title: "Projets transverses",
                body: `${fmtDec(100 - d.pctGeo, 0)} % des projets ${d.year} ne sont pas géolocalisables : dotations centrales, opérations pluri-sites, études. Ils représentent une part non négligeable du budget.`,
                stats: [
                  { label: "Part", value: `${fmtDec(100 - d.pctGeo, 0)} %` },
                  { label: "Projets", value: fmtInt(d.nbProjets - d.nbGeo) },
                  { label: "À produire", value: "Géolocalisation" },
                ],
                cta: { href: "/methode#investissements", label: "Lire la méthode" },
              },
              {
                flag: "Chapitre dominant",
                title: `${d.byChapitre[0]?.label ?? "—"}`,
                body: `Ce chapitre fonctionnel absorbe à lui seul ${fmtMillions(d.byChapitre[0]?.amount ?? 0, 0)} M € — environ ${fmtDec((d.byChapitre[0]?.amount ?? 0) / d.total * 100, 0)} % du total. Logique structurelle à contextualiser.`,
                stats: [
                  { label: "Montant", value: `${fmtMillions(d.byChapitre[0]?.amount ?? 0, 0)} M €` },
                  { label: "Part", value: `${fmtDec((d.byChapitre[0]?.amount ?? 0) / d.total * 100, 0)} %` },
                  { label: "Rang", value: "#01" },
                ],
              },
            ]}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="07"
            kind="Sources & méthode"
            title={<>Vérifiable <em>ligne par ligne</em></>}
          />
          <div className="fx-sources">
            <div>
              <div className="n">Donnée source</div>
              <h3>Annexes CA {d.year} (M57)</h3>
              <p>
                Projets d&apos;investissement extraits des annexes PDF du compte administratif
                ({fmtInt(d.nbProjets)} lignes pour {d.year}). Pipeline LLM + heuristiques + revue manuelle.
              </p>
              <a href="https://opendata.paris.fr" target="_blank" rel="noopener noreferrer">
                opendata.paris.fr ↗
              </a>
            </div>
            <div>
              <div className="n">Géocodage</div>
              <h3>BAN + heuristiques</h3>
              <p>
                Adresses identifiées par regex + géocodage via la Base Adresse Nationale
                (api-adresse.data.gouv.fr). Score de confiance calculé pour chaque point.
              </p>
              <a href="/methode#investissements">Lire la méthode →</a>
            </div>
            <div>
              <div className="n">Limites</div>
              <h3>{fmtDec(100 - d.pctGeo, 0)} % non géolocalisables</h3>
              <p>
                Dotations centrales, études, opérations pluri-sites — pas d&apos;adresse unique.
                Ces montants apparaissent dans les chapitres mais pas sur la carte.
              </p>
              <a href="https://github.com/AbstractsMachine" target="_blank" rel="noopener noreferrer">
                GitHub ↗
              </a>
            </div>
          </div>
          <ExportRow
            items={[
              { label: `CSV · ${d.year}`, primary: true, href: `/data/map/investissements_complet_${d.year}.json` },
              { label: "JSON", href: `/data/map/investissements_complet_${d.year}.json` },
              { label: "Tendances 2019–2024", href: "/data/investissement_tendances.json" },
              { label: "Méthode complète", href: "/methode#investissements" },
            ]}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead number="08" kind="Explorer plus loin" title="Continuer" />
          <div className="fx-grid-tiles">
            <TileCard
              href="/marches-publics"
              number="01"
              kind="Contrats"
              title="Marchés publics"
              description="Qui construit ces projets ? Les 10 plus gros fournisseurs et leurs contrats."
              preview={<SvgContrats />}
              kpi="2,1"
              kpiUnit="Md €"
              kpiDelta={<>Enveloppes {d.year}</>}
            />
            <TileCard
              href="/logement-social"
              number="02"
              kind="Bailleurs"
              title="Logement social"
              description="Les opérations de logement financées — partie la plus grosse de l'aménagement."
              preview={<SvgLogement />}
              kpi="24,5"
              kpiUnit="%"
              kpiDelta={<>SRU actuel</>}
            />
            <TileCard
              href="/dette-patrimoine"
              number="03"
              kind="Bilan"
              title="Dette &amp; patrimoine"
              description="Comment ces investissements s'inscrivent dans le patrimoine et la dette."
              preview={<SvgBilan />}
              kpi="26"
              kpiUnit="Md €"
              kpiDelta={<>Patrimoine net</>}
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function SvgContrats() {
  return (
    <svg viewBox="0 0 200 100">
      <rect x="10" y="20" width="80" height="10" className="fill" fill="#0a0a0a" />
      <rect x="10" y="38" width="60" height="10" className="fill" fill="#0a0a0a" />
      <rect x="10" y="56" width="100" height="10" className="fill-sig" fill="#e11d1d" />
      <rect x="10" y="74" width="40" height="10" className="fill" fill="#0a0a0a" />
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
