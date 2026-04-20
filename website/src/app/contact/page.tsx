import type { Metadata } from "next";
import "../fusion.css";

import { Navbar, Footer, Button, SectionHead } from "@/components/fusion";

export const metadata: Metadata = {
  title: "Contact — France Open Data",
  description:
    "Contactez le collectif France Open Data : corrections, suggestions, partenariats, demandes presse.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="theme-fusion">
      <Navbar />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">— Contact</div>
          <h1 className="fx-page-title">
            Une remarque,<br />une <em>correction</em>, une piste ?
          </h1>
          <p className="fx-page-lede">
            France Open Data est un collectif ouvert. On publie des chiffres sur les finances
            publiques ; si vous voyez une erreur, si vous avez une question, ou si vous voulez
            contribuer — écrivez-nous.
          </p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind="Écrire"
            title={<>En attendant le <em>formulaire</em></>}
            subtitle="La page dédiée arrive bientôt. En attendant, les chemins directs :"
          />
          <div className="fx-sources">
            <div>
              <div className="n">Courriel</div>
              <h3>Écrire à l&apos;équipe</h3>
              <p>
                Pour une correction, une suggestion de jeu de données, une question sur
                la méthode, ou une demande presse.
              </p>
              <a href="mailto:contact@franceopendata.org">contact@franceopendata.org ↗</a>
            </div>
            <div>
              <div className="n">GitHub</div>
              <h3>Ouvrir un ticket</h3>
              <p>
                Le plus efficace pour signaler un bug, proposer une amélioration, ou
                contribuer au code.
              </p>
              <a href="https://github.com/Nuttux/open-public-data/issues" target="_blank" rel="noopener noreferrer">
                github.com/…/issues ↗
              </a>
            </div>
            <div>
              <div className="n">Presse</div>
              <h3>Demandes journalistes</h3>
              <p>
                Reprise des chiffres, interview, collaboration éditoriale — précisez
                le média et le calendrier.
              </p>
              <a href="mailto:presse@franceopendata.org">presse@franceopendata.org ↗</a>
            </div>
          </div>

          <div className="fx-note" style={{ marginTop: 32 }}>
            <b>À savoir</b> : aucun article publié n&apos;est sponsorisé. Les éventuels
            financements — publics, fondations, mécènes — sont publiés avec leur
            montant et ne conditionnent pas la ligne éditoriale.
          </div>

          <div style={{ marginTop: 32, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" href="/analyses">Lire les analyses</Button>
            <Button href="/">Retour à l&apos;accueil</Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
