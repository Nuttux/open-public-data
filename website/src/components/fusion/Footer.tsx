"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { citySectionLinks, cityHasAnalyses } from "./nav-links";
import ReplayOptIn from "./ReplayOptIn";

type Col = {
  headingKey: string;
  links: { href: string; labelKey: string; external?: boolean }[];
};

// The current France place, for the place-aware "Pages" column. France city
// pages carry the slug; the root (/) is Paris's landing; anything else defaults
// to Paris. (US/BR render their own footers.)
function footerCitySlug(pathname: string): string {
  const m = pathname.match(/^\/fr\/city\/([^/]+)/);
  return m ? m[1] : "paris";
}

export default function Footer() {
  const t = useT();
  const track = useTrack();
  const pathname = usePathname() ?? "/";
  const citySlug = footerCitySlug(pathname);
  const year = new Date().getFullYear();

  const columns: Col[] = [
    // Place footer — the current city's finalised sections (same source as the
    // nav, so the footer never advertises a section hidden as WIP).
    {
      headingKey: "fx.foot.col.pages",
      links: citySectionLinks(citySlug),
    },
    // Site/product footer — site-wide. Analyses only where the place has it.
    {
      headingKey: "fx.foot.col.resources",
      links: [
        ...(cityHasAnalyses(citySlug) ? [{ href: "/analyses", labelKey: "fx.foot.link.analyses" }] : []),
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
  return (
    <footer className="fx-foot">
      <div className="fx-wrap">
        <div className="fx-foot-grid">
          <div>
            <div className="fx-foot-word">
              {t("fx.foot.word_line1")}{t("fx.foot.word_line2") ? <><br />{t("fx.foot.word_line2")}</> : null}
            </div>
            <p className="fx-foot-blurb">{t("fx.foot.blurb")}</p>
          </div>
          {columns.map((c) => (
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
            <span aria-hidden="true">·</span>
            <Link href="/corrections">{t("fx.foot.legal.corrections")}</Link>
            <span aria-hidden="true">·</span>
            <Link href="/signalement">{t("fx.foot.legal.signaler")}</Link>
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
