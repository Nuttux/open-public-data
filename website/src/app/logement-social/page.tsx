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
  fmtDec,
  fmtInt,
  loadLogementSocialData,
} from "@/lib/fusion-data";

export const metadata: Metadata = {
  title: "Logement social — France Open Data",
  description:
    "Le parc social parisien, la loi SRU et la tension locative. Données publiques reventilées par arrondissement et par bailleur.",
  alternates: { canonical: "/logement-social" },
};

const suf = (n: number) => (n === 1 ? "er" : "ᵉ");

export default async function LogementSocialPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const requestedYear = sp.year ? Number(sp.year) : undefined;
  const d = loadLogementSocialData(requestedYear);
  const gap = d.sruRatio - d.sruTarget;
  const gapDir: "up" | "down" | "flat" = gap > 0.1 ? "up" : gap < -0.1 ? "down" : "flat";

  return (
    <div className="theme-fusion">
      <Navbar />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">06 · Logement social</div>
          <h1 className="fx-page-title">
            Le <em>parc social</em>,<br />
            la <b>tension</b>.
          </h1>
          <p className="fx-page-lede">
            Le taux SRU de Paris, les opérations financées chaque année par arrondissement,
            et les grands bailleurs. Données DDT Paris et comptes administratifs {d.year}.
          </p>
          <div className="fx-page-actions">
            <YearPicker
              years={d.availableYears}
              current={d.year}
              basePath="/logement-social"
              label="Exercice"
            />
          </div>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead number="01" kind="Vue d'ensemble" title={<>Le taux <em>SRU</em> en une double lecture</>} />
          <div className="fx-overview">
            <HeroNumber
              label={<>Taux SRU · inventaire {d.year}</>}
              value={fmtDec(d.sruRatio, 1)}
              unit="%"
              delta={{
                direction: gapDir,
                value: `${fmtDec(Math.abs(gap), 1)} pt`,
                base: `cible légale ${d.sruTarget} %`,
              }}
              caption={
                <>
                  {fmtInt(d.stockTotal)} logements sociaux SRU recensés sur ~1 055 000 résidences
                  principales. Le calcul exclut certaines catégories (foyers spécialisés, résidences
                  étudiantes hors quota).
                </>
              }
            />
            <KPIGrid
              cols={2}
              items={[
                { label: "Stock SRU total", value: fmtInt(d.stockTotal), delta: "Logements comptabilisés" },
                { label: `Nouveaux financés ${d.year}`, value: fmtInt(d.nouveauxParAn), delta: `${fmtInt(d.nbOperations)} opérations` },
                { label: "Cible loi SRU", value: `${d.sruTarget} %`, delta: "Résidences principales" },
                { label: "Écart à la cible", value: `${gap >= 0 ? "+" : "−"} ${fmtDec(Math.abs(gap), 1)} pt`, delta: gap < 0 ? "Déficit SRU" : "Cible atteinte" },
              ]}
            />
          </div>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind="Par arrondissement"
            title={<>Le parc <em>arrondissement par arrondissement</em></>}
            subtitle="Les opérations de logement social financées localement en 2024. Les arrondissements du Nord-Est et de l'Est concentrent la production."
          />
          <BarRow
            header={{
              left: <>Logements sociaux financés · <b>{d.year}</b></>,
              right: <>Total · <b>{fmtInt(d.nouveauxParAn)} logements</b></>,
            }}
            items={d.byArrondissement.map((a) => ({
              label: `${a.arr}${suf(a.arr)} arrondissement`,
              value: a.logements,
              display: fmtInt(a.logements),
              unit: "log.",
            }))}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="03"
            kind="Bailleurs"
            title={<>Qui <em>gère</em> le parc ?</>}
            subtitle="Les principaux bailleurs sociaux actifs à Paris, par ordre de parts estimées du parc. Paris Habitat et la RIVP pèsent la majorité à elles deux."
          />
          <div className="fx-sources">
            {d.bailleurs.slice(0, 3).map((b) => (
              <div key={b.name}>
                <div className="n" style={{ color: b.color }}>{b.type}</div>
                <h3>{b.name}</h3>
                <p>{b.description}</p>
                <span style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 22, color: b.color }}>
                  ~ {b.share} %
                </span>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>
                  du parc
                </span>
              </div>
            ))}
          </div>
          <div className="fx-sources" style={{ marginTop: 1 }}>
            {d.bailleurs.slice(3).map((b) => (
              <div key={b.name}>
                <div className="n" style={{ color: b.color }}>{b.type}</div>
                <h3>{b.name}</h3>
                <p>{b.description}</p>
                <span style={{ fontFamily: "var(--f-disp)", fontWeight: 700, fontSize: 22, color: b.color }}>
                  ~ {b.share} %
                </span>
                <span style={{ fontFamily: "var(--f-mono)", fontSize: 11, color: "var(--muted)", marginLeft: 8 }}>
                  du parc
                </span>
              </div>
            ))}
          </div>
          <p className="fx-note">
            <b>Méthode</b> : parts indicatives estimées à partir du recensement ministériel (SDES)
            et des rapports annuels des bailleurs. Les données précises bailleur par bailleur ne sont
            pas publiées en open data à la résolution nécessaire — à produire.
          </p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="04"
            kind="Tension"
            title={<>Production <em>annuelle</em></>}
            subtitle="Les logements sociaux financés chaque année. La production oscille selon les cycles électoraux et les programmations pluriannuelles."
          />
          <table className="fx-table">
            <thead>
              <tr>
                <th>Année</th>
                <th style={{ textAlign: "right" }}>Logements financés</th>
                <th style={{ textAlign: "right" }}>Évolution</th>
              </tr>
            </thead>
            <tbody>
              {d.yearsSummary.slice().reverse().map((y, i, arr) => {
                const prev = arr[i + 1];
                const delta = prev && prev.logements > 0 ? ((y.logements - prev.logements) / prev.logements) * 100 : null;
                return (
                  <tr key={y.year}>
                    <td className="rank">{y.year}</td>
                    <td className="num">{fmtInt(y.logements)}</td>
                    <td className="num muted">{delta === null ? "—" : `${delta >= 0 ? "+" : "−"} ${fmtDec(Math.abs(delta), 0)} %`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="fx-note">
            <b>Limite</b> : les chiffres ci-dessus viennent des projets extraits des comptes
            administratifs — ils reflètent l&apos;activité financée (AP), pas les livraisons (CP).
            Un logement peut être financé en 2022 et livré en 2025.
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
              <div className="n">Source SRU</div>
              <h3>Inventaire DDT Paris</h3>
              <p>
                Taux SRU officiel publié chaque année par la Direction Départementale des Territoires
                au 1er janvier, basé sur l&apos;inventaire des logements sociaux éligibles.
              </p>
              <a href="https://www.paris.fr/logement-social" target="_blank" rel="noopener noreferrer">
                paris.fr ↗
              </a>
            </div>
            <div>
              <div className="n">Source projets</div>
              <h3>Comptes administratifs</h3>
              <p>
                Nombre d&apos;opérations financées extrait des annexes CA. Les données de bailleurs
                (parts de parc) viennent des rapports annuels des organismes.
              </p>
              <a href="/methode#logement-social">Lire la méthode →</a>
            </div>
            <div>
              <div className="n">Limites</div>
              <h3>Ce qui n&apos;est pas encore là</h3>
              <p>
                Heatmap tension (demandes/attributions par arrondissement), carte géolocalisée
                du parc, profil détaillé des bénéficiaires — non publiés en open data aujourd&apos;hui.
              </p>
              <a href="https://github.com/AbstractsMachine" target="_blank" rel="noopener noreferrer">
                GitHub ↗
              </a>
            </div>
          </div>
          <ExportRow
            items={[
              { label: `CSV arrondissements · ${d.year}`, primary: true, href: `/data/map/arrondissements_stats_${d.year}.json` },
              { label: "GeoJSON", href: "/data/map/arrondissements.geojson" },
              { label: "Méthode complète", href: "/methode#logement-social" },
            ]}
          />
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead number="06" kind="Explorer plus loin" title="Continuer" />
          <div className="fx-grid-tiles">
            <TileCard
              href="/investissements"
              number="01"
              kind="Carte"
              title="Investissements"
              description="Les projets de logement s'inscrivent dans l'ensemble des chantiers de la Ville."
              preview={
                <svg viewBox="0 0 200 100">
                  <path d="M 28 30 Q 36 14 70 12 Q 110 10 140 18 Q 172 26 184 48 Q 188 72 168 86 Q 130 94 90 92 Q 50 90 28 72 Q 18 52 28 30 Z" className="stroke" fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
                  {[[60, 34], [110, 30], [140, 36], [72, 70], [158, 68]].map(([x, y]) => (
                    <circle key={`${x}-${y}`} cx={x} cy={y} r="2.5" className="fill" fill="#0a0a0a" />
                  ))}
                  <circle cx="118" cy="54" r="4" className="fill-sig" fill="#e11d1d" />
                </svg>
              }
              kpi="2,1"
              kpiUnit="Md €"
              kpiDelta={<>Total 2024</>}
            />
            <TileCard
              href="/qui-recoit"
              number="02"
              kind="Classement"
              title="Subventions"
              description="Les bailleurs reçoivent aussi des subventions (réhabilitation, urgence)."
              preview={
                <svg viewBox="0 0 200 100">
                  {[14, 28, 42, 56, 70, 84].map((y, i) => (
                    <g key={y}>
                      <rect x="10" y={y - 1} width="4" height="4" className="fill-muted" fill="#9099a6" />
                      <rect x="20" y={y - 1} width={90 - i * 12} height="6" className="fill" fill="#0a0a0a" />
                    </g>
                  ))}
                </svg>
              }
              kpi="1,35"
              kpiUnit="Md €"
              kpiDelta={<>2024</>}
            />
            <TileCard
              href="/dette-patrimoine"
              number="03"
              kind="Bilan"
              title="Dette &amp; patrimoine"
              description="Comment les investissements sociaux apparaissent à l'actif de la Ville."
              preview={
                <svg viewBox="0 0 200 100">
                  <rect x="32" y="10" width="60" height="40" className="fill" fill="#0a0a0a" />
                  <rect x="32" y="52" width="60" height="24" className="fill" fill="#0a0a0a" opacity=".75" />
                  <rect x="108" y="10" width="60" height="46" className="fill" fill="#0a0a0a" />
                  <rect x="108" y="58" width="60" height="32" className="fill-sig" fill="#e11d1d" />
                </svg>
              }
              kpi="36"
              kpiUnit="Md €"
              kpiDelta={<>Fonds propres</>}
            />
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
