import Link from "@/components/LocalizedLink";
import { V3Amt, V3Row } from "@/components/fiche/v3";
import type { BrowseItem } from "@/lib/seo/browse";
import PageJsonLd from "@/components/seo/PageJsonLd";
import type { SiteLocale } from "@/lib/site-locale";

/**
 * A browse index page body: a title that says what the list is, one line of
 * context (count, source), the letter or year rail, the rows, and prev/next.
 * Plain server-rendered links — nothing here needs JavaScript, which is the
 * point: a crawler walks it like a reader would.
 */
export type BrowseNav = { href: string; label: string; active?: boolean; count?: number };

export default function BrowseList({
  kicker,
  kickerHref,
  title,
  intro,
  rail,
  railLabel,
  items,
  pager,
  siblings,
  siblingsLabel,
  seoPath,
  locale,
}: {
  kicker: string;
  kickerHref: string;
  title: string;
  intro: string;
  rail?: BrowseNav[];
  railLabel?: string;
  items: BrowseItem[];
  pager?: { page: number; pages: number; hrefFor: (p: number) => string; prevLabel: string; nextLabel: string; pageLabel: string };
  siblings?: BrowseNav[];
  siblingsLabel?: string;
  /** Path + language for the BreadcrumbList structured data. */
  seoPath?: string;
  locale?: SiteLocale;
}) {
  return (
    <>
      <section className="fx-page-header fx-page-header--fiche">
        <div className="fx-wrap">
          <Link href={kickerHref} className="fx-page-kicker" style={{ textDecoration: "none" }}>
            ← {kicker}
          </Link>
          <h1 className="fx-page-title" style={{ fontSize: "clamp(24px, 3vw, 36px)" }}>
            {title}
          </h1>
          <p className="fx-page-lede fx-answer">{intro}</p>
          {seoPath && locale ? <PageJsonLd title={title} description={intro} path={seoPath} locale={locale} dataset={false} /> : null}
          {rail && rail.length > 0 ? (
            <nav aria-label={railLabel} className="fx-browse-rail">
              {rail.map((r) =>
                r.count === 0 ? (
                  <span key={r.href} className="fx-browse-chip is-empty" aria-disabled="true">{r.label}</span>
                ) : (
                  <Link key={r.href} href={r.href} className={r.active ? "fx-browse-chip is-on" : "fx-browse-chip"} aria-current={r.active ? "page" : undefined}>
                    {r.label}
                  </Link>
                ),
              )}
            </nav>
          ) : null}
        </div>
      </section>
      <div className="fx-fiche-wrap">
        <div className="fx-v3">
          {items.map((it) => (
            <V3Row key={it.href} href={it.href} label={it.label} subText={it.sub ?? undefined} amount={it.amount ? <V3Amt v={it.amount.v} u={it.amount.u} /> : undefined} />
          ))}
          {pager && pager.pages > 1 ? (
            <nav className="fx-browse-pager" aria-label={pager.pageLabel}>
              {pager.page > 1 ? <Link href={pager.hrefFor(pager.page - 1)} className="fx-row-link">← {pager.prevLabel}</Link> : <span />}
              <span className="muted">{pager.pageLabel} {pager.page} / {pager.pages}</span>
              {pager.page < pager.pages ? <Link href={pager.hrefFor(pager.page + 1)} className="fx-row-link">{pager.nextLabel} →</Link> : <span />}
            </nav>
          ) : null}
          {siblings && siblings.length > 0 ? (
            <p className="fx-v3-foot">
              {siblingsLabel}{" "}
              {siblings.map((s, i) => (
                <span key={s.href}>
                  {i > 0 ? " · " : ""}
                  <Link href={s.href}>{s.label}</Link>
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
