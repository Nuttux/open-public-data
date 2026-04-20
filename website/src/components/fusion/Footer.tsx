import Link from "next/link";
import type { ReactNode } from "react";

type Col = {
  heading: string;
  links: { href: string; label: ReactNode; disabled?: boolean; external?: boolean }[];
};

const COLUMNS: Col[] = [
  {
    heading: "Collectivité",
    links: [
      { href: "/", label: "Paris" },
      { href: "#", label: "Autres villes (à venir)", disabled: true },
      { href: "#", label: "France (roadmap)", disabled: true },
    ],
  },
  {
    heading: "Pages",
    links: [
      { href: "/budget", label: "Le budget" },
      { href: "/qui-recoit", label: "Subventions" },
      { href: "/marches-publics", label: "Marchés publics" },
      { href: "/investissements", label: "Investissements" },
      { href: "/logement-social", label: "Logement social" },
      { href: "/dette-patrimoine", label: "Dette et patrimoine" },
    ],
  },
  {
    heading: "Ressources",
    links: [
      { href: "/analyses", label: "Analyses" },
      { href: "/methode", label: "Méthode" },
      { href: "/llms.txt", label: "API" },
      {
        href: "https://github.com/Nuttux/open-public-data",
        label: "GitHub ↗",
        external: true,
      },
      { href: "/contact", label: "Contact" },
    ],
  },
];

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="fx-foot">
      <div className="fx-wrap">
        <div className="fx-foot-grid">
          <div>
            <div className="fx-foot-word">
              France<br />Open Data.
            </div>
            <p className="fx-foot-blurb">
              Une publication de <b>France Open Data</b>, collectif indépendant.
            </p>
          </div>
          {COLUMNS.map((c) => (
            <div key={c.heading}>
              <h4>{c.heading}</h4>
              <ul>
                {c.links.map((l, i) => {
                  if (l.disabled) {
                    return (
                      <li key={i}>
                        <span style={{ color: "var(--muted-2)", cursor: "default" }}>{l.label}</span>
                      </li>
                    );
                  }
                  if (l.external) {
                    return (
                      <li key={i}>
                        <a href={l.href} target="_blank" rel="noopener noreferrer">
                          {l.label}
                        </a>
                      </li>
                    );
                  }
                  return (
                    <li key={i}>
                      <Link href={l.href}>{l.label}</Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="fx-foot-base">
          <span>© {year} France Open Data · Licence MIT</span>
          <span>franceopendata.org</span>
        </div>
      </div>
    </footer>
  );
}
