"use client";

import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { useTrack } from "@/lib/analyticsContext";
import type { FooterLink, FooterModel } from "@/lib/footer-model";

/**
 * The one site footer, rendered for every country from a normalised FooterModel.
 * Four bands: brand + mission + cross-city rail · place sections · project ·
 * legal & data. The section column is the only place-aware slot; the rest is
 * invariant. `optIn` is an optional slot (France's session-replay consent).
 */
export default function SiteFooter({
  model,
  optIn,
}: {
  model: FooterModel;
  optIn?: ReactNode;
}) {
  const track = useTrack();

  const renderLink = (l: FooterLink, surface: string) => {
    if (l.external) {
      return (
        <a
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            track("external_link_click", {
              url: l.href,
              domain: (() => {
                try {
                  return new URL(l.href).hostname;
                } catch {
                  return l.href;
                }
              })(),
              label: l.label,
              source_page: surface,
            })
          }
        >
          {l.label}
        </a>
      );
    }
    return (
      <Link href={l.href} onClick={() => track("nav_click", { href: l.href, label: l.label, surface })}>
        {l.label}
      </Link>
    );
  };

  const column = (heading: string, links: FooterLink[], surface: string) =>
    links.length > 0 ? (
      <div>
        <h3>{heading}</h3>
        <ul>
          {links.map((l, i) => (
            <li key={`${l.href}-${i}`}>{renderLink(l, surface)}</li>
          ))}
        </ul>
      </div>
    ) : null;

  return (
    <footer className="fx-foot">
      <div className="fx-wrap">
        <div className="fx-foot-grid">
          <div className="fx-foot-brand">
            <div className="fx-foot-word">{model.wordmark}</div>
            <p className="fx-foot-blurb">{model.mission}</p>
            <div className="fx-foot-cities">
              {model.cities.map((c, i) => (
                <Fragment key={c.href}>
                  {i > 0 && (
                    <span className="fx-foot-dot" aria-hidden="true">
                      ·
                    </span>
                  )}
                  {renderLink(c, "footer_cities")}
                </Fragment>
              ))}
              {model.findCity && (
                <>
                  <span className="fx-foot-dot" aria-hidden="true">
                    ·
                  </span>
                  <span className="fx-foot-find">{renderLink(model.findCity, "footer_find_city")}</span>
                </>
              )}
            </div>
          </div>
          {column(model.placeHeading, model.sections, "footer_sections")}
          {column(model.projectHeading, model.project, "footer_project")}
          {column(model.legalHeading, model.legal, "footer_legal")}
        </div>
        {optIn ? <div className="fx-foot-optin">{optIn}</div> : null}
        <div className="fx-foot-base">
          <span className="fx-foot-license">{model.baseline}</span>
        </div>
      </div>
    </footer>
  );
}
