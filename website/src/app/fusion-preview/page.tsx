import {
  Navbar,
  Footer,
  Button,
  SectionHead,
  HeroNumber,
  KPIGrid,
  BarRow,
  TileCard,
} from "@/components/fusion";

export default function FusionPreview() {
  return (
    <>
      <Navbar />

      <section style={{ padding: "80px 0 48px", borderBottom: "1px solid var(--ink)" }}>
        <div className="fx-wrap">
          <SectionHead
            number="00"
            kind="Preview"
            title={<>Design system <em>06-fusion</em></>}
            subtitle="Aperçu isolé des primitives — Navbar, Footer, boutons, titres, hero number, KPI grid, barres, tuiles. Tout est stylé via .theme-fusion, en cohabitation avec l'ancien thème."
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" href="#">Bouton primaire →</Button>
            <Button href="#">Bouton secondaire</Button>
          </div>
        </div>
      </section>

      <section style={{ padding: "80px 0", borderBottom: "1px solid var(--ink)" }}>
        <div className="fx-wrap">
          <SectionHead number="01" kind="Hero number" title="Chiffre-phare" />
          <HeroNumber
            label="Chaque jour, la Ville dépense"
            value="15,06"
            unit="€"
            per="/ habitant"
            delta={{ direction: "up", value: "2,1 %", base: "+ 0,32 €", note: "vs exercice 2024" }}
            caption={<>Soit <b>5 496 € par an et par habitant</b>. Budget voté 2026 rapporté aux <b>2 133 111</b> Parisiens et Parisiennes (INSEE).</>}
          />
        </div>
      </section>

      <section style={{ padding: "80px 0", borderBottom: "1px solid var(--ink)" }}>
        <div className="fx-wrap">
          <SectionHead number="02" kind="KPI grid" title="Grille d'indicateurs" />
          <KPIGrid
            cols={4}
            items={[
              { label: "Budget total",       value: "11,3", unit: "Md €",   delta: "↑ 2,1 % vs 2025" },
              { label: "Investissement",     value: "2,6",  unit: "Md €",   delta: "↑ 8,4 % vs 2025" },
              { label: "Dette",              value: "8,5",  unit: "Md €",   delta: "31.12.2024" },
              { label: "Épargne brute",      value: "612",  unit: "M €",    delta: "↓ 3,7 % vs 2024" },
            ]}
          />
        </div>
      </section>

      <section style={{ padding: "80px 0", borderBottom: "1px solid var(--ink)" }}>
        <div className="fx-wrap">
          <SectionHead number="03" kind="Bar row" title="Répartition horizontale" />
          <BarRow
            header={{ left: <>Répartition par fonction · <b>€ par habitant, par jour</b></>, right: <>Total · <b>15,06 €</b></> }}
            items={[
              { label: "Social",         value: 4.26, unit: "€" },
              { label: "Investissement", value: 2.79, unit: "€" },
              { label: "Éducation",      value: 2.39, unit: "€" },
              { label: "Voirie",         value: 1.86, unit: "€" },
              { label: "Logement",       value: 1.60, unit: "€" },
              { label: "Administration", value: 1.46, unit: "€" },
              { label: "Culture",        value: 0.66, unit: "€" },
            ]}
          />
        </div>
      </section>

      <section style={{ padding: "80px 0", borderBottom: "1px solid var(--ink)" }}>
        <div className="fx-wrap">
          <SectionHead number="04" kind="Tile grid" title={<>Tuiles <em>analyses</em></>} subtitle="Hover pour voir l'inversion de thème." />
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
              kpi="11,3"
              kpiUnit="Md €"
              kpiDelta={<>↑ <b>2,1 %</b> vs 2025</>}
            />
            <TileCard
              href="/investissements"
              number="02"
              kind="Carte"
              title="Investissements"
              description="Quels travaux dans mon quartier ? Projets géolocalisés, arrondissement par arrondissement."
              preview={
                <svg viewBox="0 0 200 100">
                  <path d="M 28 30 Q 36 14 70 12 Q 110 10 140 18 Q 172 26 184 48 Q 188 72 168 86 Q 130 94 90 92 Q 50 90 28 72 Q 18 52 28 30 Z" className="stroke" fill="none" stroke="#0a0a0a" strokeWidth="1.5" />
                  <circle cx="60"  cy="34" r="2.5" className="fill" fill="#0a0a0a" />
                  <circle cx="86"  cy="42" r="2.5" className="fill" fill="#0a0a0a" />
                  <circle cx="110" cy="30" r="2.5" className="fill" fill="#0a0a0a" />
                  <circle cx="140" cy="36" r="2.5" className="fill" fill="#0a0a0a" />
                  <circle cx="118" cy="54" r="4"   className="fill-sig" fill="#e11d1d" />
                </svg>
              }
              kpi="2,6"
              kpiUnit="Md €"
              kpiDelta={<>↑ <b>8,4 %</b> vs 2025</>}
            />
            <TileCard
              href="/qui-recoit"
              number="03"
              kind="Classement"
              title="Subventions"
              description="Qui reçoit des subventions ? 6 000 associations financées, triables par thématique."
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
          </div>
        </div>
      </section>

      <Footer />
    </>
  );
}
