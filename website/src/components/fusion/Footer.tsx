"use client";

import Link from "next/link";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import ReplayOptIn from "./ReplayOptIn";

type Col = {
  headingKey: string;
  links: { href: string; labelKey: string; disabled?: boolean; external?: boolean }[];
};

const COLUMNS: Col[] = [
  {
    headingKey: "fx.foot.col.collectivite",
    links: [
      { href: "/", labelKey: "fx.foot.link.paris" },
      { href: "#", labelKey: "fx.foot.link.autres", disabled: true },
      { href: "#", labelKey: "fx.foot.link.france", disabled: true },
    ],
  },
  {
    headingKey: "fx.foot.col.pages",
    links: [
      { href: "/budget", labelKey: "fx.foot.link.budget" },
      { href: "/qui-recoit", labelKey: "fx.foot.link.subventions" },
      { href: "/marches-publics", labelKey: "fx.foot.link.marches" },
      { href: "/investissements", labelKey: "fx.foot.link.invest" },
      { href: "/logement-social", labelKey: "fx.foot.link.logement" },
      { href: "/dette-patrimoine", labelKey: "fx.foot.link.dette" },
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
            <p className="fx-foot-blurb">
              {t("fx.foot.blurb.before")}<b>{t("fx.foot.blurb.name")}</b>{t("fx.foot.blurb.after")}
            </p>
          </div>
          {COLUMNS.map((c) => (
            <div key={c.headingKey}>
              <h4>{t(c.headingKey)}</h4>
              <ul>
                {c.links.map((l, i) => {
                  if (l.disabled) {
                    return (
                      <li key={i}>
                        <span style={{ color: "var(--muted-2)", cursor: "default" }}>{t(l.labelKey)}</span>
                      </li>
                    );
                  }
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
          <span>{t("fx.foot.license").replace("{year}", String(year))}</span>
          <span>{t("fx.foot.domain")}</span>
        </div>
      </div>
    </footer>
  );
}
