import type { Metadata } from "next";
import "../fusion.css";

import {
  Navbar,
  Footer,
  SectionHead,
  HeroNumber,
  KPIGrid,
  TileCard,
  YearPicker,
  ExportRow,
  PullQuote,
  BilanBoard,
  DetteStructurePanel,
  PatrimoineDrillList,
} from "@/components/fusion";
import {
  fmtBillions,
  fmtDec,
  fmtInt,
  fmtMillions,
  loadPatrimoineData,
  loadPatrimoineStructure,
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
  const structure = loadPatrimoineStructure(d.year);
  const net = d.fondsPropres; // patrimoine net ≈ fonds propres
  const detteParHab = d.detteFinanciere / 2_133_111;

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
              <span className="fx-rule-ref">Article L.1612-4 CGCT</span>
            </div>
            <div>
              <div className="n">02 / Emprunt affecté</div>
              <h3>L&apos;emprunt finance uniquement l&apos;investissement</h3>
              <p>
                Pas de dette pour payer les dépenses courantes. La dette sert à construire
                des écoles, des piscines, des logements — des actifs qui servent longtemps.
              </p>
              <span className="fx-rule-ref">Article L.1612-4 CGCT</span>
            </div>
            <div>
              <div className="n">03 / Épargne brute positive</div>
              <h3>Le capital de la dette se rembourse par des ressources propres</h3>
              <p>
                Chaque année, le remboursement du capital des emprunts doit provenir de
                l&apos;épargne brute (recettes − dépenses de fonctionnement), pas d&apos;un
                autre emprunt.
              </p>
              <span className="fx-rule-ref">Article L.1612-4 CGCT · circulaire DGCL</span>
            </div>
            <div>
              <div className="n">04 / Capacité de désendettement</div>
              <h3>Seuil d&apos;alerte à 12 ans</h3>
              <p>
                Pour les communes de plus de 10 000 habitants, la capacité de désendettement
                (dette ÷ épargne brute) doit rester sous 12 ans. Paris est à{" "}
                <b>{fmtDec(d.capaciteDesendettement, 1)} ans</b>.
              </p>
              <span className="fx-rule-ref">Loi de programmation des finances publiques 2023-2027</span>
            </div>
          </div>

          <div className="fx-faillite-box">
            <h4>Une commune peut-elle <span className="rouge">faire faillite</span> ?</h4>
            <p>
              Non, au sens du droit commercial. Une commune ne peut pas déposer le bilan —
              elle n&apos;est pas une entreprise. En revanche, lorsque les règles budgétaires
              ne peuvent pas être respectées, elle entre sous le régime de la{" "}
              <b>tutelle préfectorale</b> prévu par l&apos;article <b>L.1612-14 du CGCT</b>.
            </p>
            <p>
              Concrètement : le préfet saisit la <b>Chambre régionale des comptes</b>, qui
              formule des propositions (relèvement des recettes, réduction des dépenses). Le
              préfet peut ensuite arrêter d&apos;office le budget. Aucune commune française
              de plus de 10 000 habitants n&apos;a fait l&apos;objet d&apos;une telle
              procédure depuis 2015.
            </p>
            <p className="ref">
              Références · CGCT art. L.1612-4 à L.1612-20 · Loi 82-213 décentralisation ·
              circulaire DGCL du 25 juin 2023
            </p>
          </div>

          <PullQuote cite={<>Source · CGCT art. L.1612-14 · rapports CRC Île-de-France</>}>
            Depuis 2015, <b>aucune commune française</b> de plus de 10 000 habitants
            n&apos;a fait l&apos;objet d&apos;une procédure de tutelle préfectorale. Paris,
            sous le seuil d&apos;alerte de 12 ans depuis 2014, reste très loin de ce régime
            d&apos;exception.
          </PullQuote>
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
                {
                  label: "Épargne brute",
                  value: d.epargneBrute >= 1e9 ? fmtBillions(d.epargneBrute) : fmtMillions(d.epargneBrute, 0),
                  unit: d.epargneBrute >= 1e9 ? "Md €" : "M €",
                  delta: d.recettesFonctionnement > 0
                    ? `${fmtDec((d.epargneBrute / d.recettesFonctionnement) * 100, 1)} % des recettes de fonct.`
                    : "Recettes fonct. − dépenses fonct.",
                },
                { label: "Capacité désendett.", value: fmtDec(d.capaciteDesendettement, 1), unit: "ans", delta: `Seuil d'alerte 12 ans · marge ${fmtDec(Math.max(0, 12 - d.capaciteDesendettement), 1)} ans` },
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
          {structure ? (
            <BilanBoard
              year={d.year}
              actif={structure.masses_actif}
              passif={structure.masses_passif}
              totals={{ actif: d.actif, passif: d.passif }}
            />
          ) : (
            <p className="fx-note">Bilan détaillé indisponible pour cet exercice.</p>
          )}
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="05"
            kind="Patrimoine en détail"
            title={<>Les grandes masses de ce que la <em>Ville possède</em></>}
            subtitle="Ventilation de l'actif par grandes composantes. Cliquez sur une ligne pour ouvrir la fiche détaillée."
          />
          {structure && structure.masses_actif.length > 0 ? (
            <PatrimoineDrillList masses={structure.masses_actif} year={d.year} />
          ) : (
            <p className="fx-note">Détail patrimoine indisponible pour cet exercice.</p>
          )}
          <p className="fx-note">
            Valorisation en <b>valeur comptable historique</b> (coût d&apos;acquisition
            diminué des amortissements), non à la valeur de marché. Monuments classés,
            terrains acquis avant 1980 et œuvres d&apos;art en dépôt sont structurellement
            sous-évalués ou inscrits à l&apos;euro symbolique.
          </p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="06"
            kind="Structure de la dette"
            title={<>De <em>quoi</em> est faite la dette</>}
            subtitle="Répartition par type de taux, par maturité, par instrument financier. Cliquez sur un type pour ouvrir la fiche détaillée."
          />
          {structure ? (
            <DetteStructurePanel structure={structure.structure_dette} year={d.year} />
          ) : (
            <p className="fx-note">Structure détaillée indisponible pour cet exercice.</p>
          )}
          <p className="fx-note">
            Les ratios par instrument (obligataire / bancaire / verts / structurés), le
            split taux fixe/variable et la maturité moyenne ne sont pas publiés en open
            data à la résolution ligne-par-ligne. Reconstitution depuis ROB et annexes IV
            du compte administratif M57.
          </p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="07"
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
            number="08"
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
          <SectionHead number="09" kind="Explorer plus loin" title="Continuer" />
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
