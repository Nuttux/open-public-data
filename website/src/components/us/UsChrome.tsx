"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/localeContext";
import { usPlaces, placeHref } from "@/lib/places";

/**
 * Shared chrome for every /us route — the same thin fx-nav masthead the
 * /us/national page used to render inline, with nav links derived from the
 * place registry (ADR-0010 D2). EN-only copy through us.* keys; no
 * LangSwitcher (the FR/EN toggle is inert on US routes, ADR-0010 D3) and no
 * French search/chat (suppressed in SearchModal/ChatPanel themselves).
 */
export default function UsChrome() {
  const pathname = usePathname() ?? "/us";
  const t = useT();

  const links = usPlaces().flatMap((p) => {
    const href = placeHref(p);
    return href ? [{ slug: p.slug, path: p.path, labelKey: p.labelKey, href }] : [];
  });

  return (
    <header className="fx-nav">
      <Link href="/us/national" className="fx-brand">
        <span>{t("us.chrome.wordmark")}</span>
      </Link>
      <nav className="fx-links" aria-label={t("us.chrome.nav_aria")}>
        {links.map((l) => (
          <Link
            key={l.slug}
            href={l.href}
            className={pathname.startsWith(l.path) ? "fx-link fx-link-on" : "fx-link"}
          >
            {t(l.labelKey)}
          </Link>
        ))}
      </nav>
    </header>
  );
}
