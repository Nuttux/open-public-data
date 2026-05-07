"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/localeContext";

const PAGES = [
  { href: "/france", labelKey: "fx.scope.france.apu", numKey: "fx.macro.nav.num.apu" },
  { href: "/france/etat", labelKey: "fx.scope.france.etat", numKey: "fx.macro.nav.num.etat" },
  { href: "/france/dette", labelKey: "fx.scope.france.dette", numKey: "fx.macro.nav.num.dette" },
  { href: "/france/fiscalite", labelKey: "fx.scope.france.fiscalite", numKey: "fx.macro.nav.num.fiscalite" },
];

/**
 * Inline cross-nav between the 4 France-macro thematic pages.
 * Rendered just below the navbar on /france, /france/dette, /france/fiscalite, /france/etat.
 */
export default function FranceMacroNav() {
  const pathname = usePathname() ?? "/";
  const t = useT();

  return (
    <nav className="fx-wrap fx-macro-nav" aria-label={t("fx.macro.nav.aria")}>
      <span className="fx-macro-nav-kicker">{t("fx.macro.nav.kicker")}</span>
      <ul>
        {PAGES.map((p) => {
          const isActive = pathname === p.href;
          return (
            <li key={p.href}>
              <Link
                href={p.href}
                className={isActive ? "fx-macro-nav-link is-active" : "fx-macro-nav-link"}
                aria-current={isActive ? "page" : undefined}
              >
                <span className="fx-macro-nav-num">{t(p.numKey)}</span>
                <span className="fx-macro-nav-label">{t(p.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
