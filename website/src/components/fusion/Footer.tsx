"use client";

import Link from "next/link";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import ReplayOptIn from "./ReplayOptIn";

type Col = {
  headingKey: string;
  links: { href: string; labelKey: string; external?: boolean }[];
};

const COLUMNS: Col[] = [
  {
    headingKey: "fx.foot.col.pages",
    links: [
      { href: "/ville/paris/budget", labelKey: "fx.foot.link.budget" },
      { href: "/ville/paris/subventions", labelKey: "fx.foot.link.subventions" },
      { href: "/ville/paris/marches", labelKey: "fx.foot.link.marches" },
      { href: "/ville/paris/investissements", labelKey: "fx.foot.link.invest" },
      { href: "/ville/paris/logement", labelKey: "fx.foot.link.logement" },
      { href: "/ville/paris/dette", labelKey: "fx.foot.link.dette" },
    ],
  },
  {
    headingKey: "fx.foot.col.resources",
    links: [
      { href: "/analyses", labelKey: "fx.foot.link.analyses" },
      { href: "/methode", labelKey: "fx.foot.link.methode" },
      {
        href: "https://github.com/Nuttux/open-public-data",
        labelKey: "fx.foot.link.github",
        external: true,
      },
      { href: "/contact", labelKey: "fx.foot.link.contact" },
    ],
  },
];

export default function Footer() {
  const t = useT();
  const track = useTrack();
  const year = new Date().getFullYear();
  return (
    <footer className="fx-foot">
      <div className="fx-wrap">
        <div className="fx-foot-grid">
          <div>
            <div className="fx-foot-word">
              {t("fx.foot.word_line1")}<br />{t("fx.foot.word_line2")}
            </div>
            <p className="fx-foot-blurb">{t("fx.foot.blurb")}</p>
          </div>
          {COLUMNS.map((c) => (
            <div key={c.headingKey}>
              <h3>{t(c.headingKey)}</h3>
              <ul>
                {c.links.map((l, i) => {
                  if (l.external) {
                    return (
                      <li key={i}>
                        <a
                          href={l.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() =>
                            track("external_link_click", {
                              url: l.href,
                              domain: new URL(l.href).hostname,
                              label: l.labelKey,
                              source_page: "footer",
                            })
                          }
                        >
                          {t(l.labelKey)}
                        </a>
                      </li>
                    );
                  }
                  return (
                    <li key={i}>
                      <Link
                        href={l.href}
                        onClick={() =>
                          track("nav_click", {
                            href: l.href,
                            label: l.labelKey,
                            surface: "footer",
                          })
                        }
                      >
                        {t(l.labelKey)}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="fx-foot-optin">
          <ReplayOptIn />
        </div>
        <div className="fx-foot-base">
          <nav aria-label={t("fx.foot.legal.aria")} className="fx-foot-legal">
            <Link href="/accessibilite">{t("fx.foot.legal.accessibilite")}</Link>
            <span aria-hidden="true">·</span>
            <Link href="/confidentialite">{t("fx.foot.legal.confidentialite")}</Link>
            <span aria-hidden="true">·</span>
            <Link href="/mentions-legales">{t("fx.foot.legal.mentions")}</Link>
            <span aria-hidden="true">·</span>
            <Link href="/licence">{t("fx.foot.legal.licence")}</Link>
            {process.env.NEXT_PUBLIC_STATUS_PAGE_URL ? (
              <>
                <span aria-hidden="true">·</span>
                <a href={process.env.NEXT_PUBLIC_STATUS_PAGE_URL} target="_blank" rel="noopener noreferrer">
                  {t("fx.foot.legal.status")}
                </a>
              </>
            ) : null}
          </nav>
          <span className="fx-foot-license">{t("fx.foot.license").replace("{year}", String(year))}</span>
        </div>
      </div>
    </footer>
  );
}
