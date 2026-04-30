"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useT, useLocale } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import Tip from "@/components/fusion/Tip";

const fill = (s: string, vars: Record<string, string | number>) => {
  let r = s;
  for (const [k, v] of Object.entries(vars)) r = r.split(`{${k}}`).join(String(v));
  return r;
};

type Post = {
  slug: string;
  title: string;
  description: string;
  date: string;
  author?: string;
  tags?: string[];
  image?: string;
  readingTime: string;
  category?: string;
  title_en?: string;
  description_en?: string;
  category_en?: string;
  tags_en?: string[];
};

type Planned = {
  title: string;
  description: string;
  tag: string;
};

function categorySlug(category: string | undefined): string {
  const c = (category ?? "Explication").toLowerCase();
  if (c.startsWith("enquê") || c.startsWith("invest")) return "enquete";
  if (c.startsWith("portr") || c.startsWith("profil")) return "portrait";
  // explication / explain / méthode / analyse (legacy) → explication
  return "explication";
}

/**
 * Render a title with a single `<em>…</em>` marker italicized & colored.
 */
function renderTitle(raw: string) {
  const match = raw.match(/^([\s\S]*?)<em>([\s\S]*?)<\/em>([\s\S]*)$/);
  if (!match) return raw;
  return (
    <>
      {match[1]}
      <em>{match[2]}</em>
      {match[3]}
    </>
  );
}

export default function AnalysesClient({
  posts,
  planned,
}: {
  posts: Post[];
  planned: Planned[];
}) {
  const t = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-GB" : "fr-FR";

  const CATEGORIES = [
    { key: "all", label: t("fx.analyses.cat.all"), raw: "Toutes", tip: null as string | null },
    { key: "enquetes", label: t("fx.analyses.cat.enquetes"), raw: "Enquêtes", tip: t("fx.analyses.cat.enquetes.tip") },
    { key: "explications", label: t("fx.analyses.cat.explications"), raw: "Explications", tip: t("fx.analyses.cat.explications.tip") },
    { key: "portraits", label: t("fx.analyses.cat.portraits"), raw: "Portraits", tip: t("fx.analyses.cat.portraits.tip") },
  ] as const;

  type CatKey = (typeof CATEGORIES)[number]["key"];

  const [active, setActive] = useState<CatKey>("all");
  const track = useTrack();

  const activeRaw = CATEGORIES.find((c) => c.key === active)?.raw ?? "Toutes";
  const activeLabel = CATEGORIES.find((c) => c.key === active)?.label ?? "";

  function formatDate(iso: string): string {
    try {
      return new Intl.DateTimeFormat(locStr, { day: "numeric", month: "long", year: "numeric" })
        .format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function categoryLabel(category: string | undefined): string {
    const slug = categorySlug(category);
    if (slug === "enquete") return t("fx.analyses.cat.enquetes").replace(/s$/, "");
    if (slug === "portrait") return t("fx.analyses.cat.portraits").replace(/s$/, "");
    return t("fx.analyses.cat.explications").replace(/s$/, "");
  }

  const filtered = useMemo(() => {
    if (active === "all") return posts;
    return posts.filter((p) => (p.category ?? "Explications") === activeRaw);
  }, [active, activeRaw, posts]);

  const filteredPlanned = useMemo(() => {
    if (active === "all") return planned;
    return planned.filter(
      (p) => p.tag + "s" === activeRaw || p.tag === activeRaw.replace(/s$/, "")
    );
  }, [active, activeRaw, planned]);

  const hero = filtered[0];
  const rest = filtered.slice(1);
  const lastPublished = posts[0];

  return (
    <>
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            {t("fx.analyses.page_kicker")}
          </div>
          <h1 className="fx-page-title">
            {renderTitle(t("fx.analyses.page_title"))}
          </h1>
          <p className="fx-page-lede">
            {t("fx.analyses.page_lede")}
          </p>
          <div className="fx-analyses-cats">
            {CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  if (c.key !== active) {
                    track("filter_change", {
                      page: "analyses",
                      field: "category",
                      value: c.key,
                    });
                  }
                  setActive(c.key);
                }}
                className={c.key === active ? "fx-cat fx-cat-on" : "fx-cat"}
              >
                {c.tip ? <Tip label={c.tip}>{c.label}</Tip> : c.label}
              </button>
            ))}
            <span className="fx-cat-meta">
              {fill(t("fx.analyses.meta.published"), {
                n: posts.length,
                s: posts.length > 1 ? "s" : "",
              })}{" "}
              · {fill(t("fx.analyses.meta.planned"), { n: planned.length })}
              {lastPublished && (
                <> · {fill(t("fx.analyses.meta.last"), { date: formatDate(lastPublished.date) })}</>
              )}
            </span>
          </div>
        </div>
      </section>

      {hero && (
        <section className="fx-section">
          <div className="fx-wrap">
            <Link
              href={`/analyses/${hero.slug}`}
              className="fx-hero-article"
              onClick={() =>
                track("chart_element_click", {
                  chart: "analyses_hero",
                  slug: hero.slug,
                  category: hero.category,
                })
              }
            >
              <div className="fx-hero-article-photo">
                <div className="fx-hero-article-photo-placeholder" aria-hidden="true" />
                {hero.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="fx-photo-img" src={hero.image} alt="" loading="eager" />
                )}
                <span
                  className={`fx-photo-tag fx-photo-tag-hero fx-tag-${categorySlug(hero.category)}`}
                >
                  {t("fx.analyses.hero.une")} · {categoryLabel(hero.category).toLowerCase()}
                </span>
              </div>
              <div className="fx-hero-article-body">
                <div className={`fx-hero-article-kicker fx-kicker-${categorySlug(hero.category)}`}>
                  {categoryLabel(hero.category)} · {hero.readingTime}
                </div>
                <h2>{renderTitle(locale === "en" && hero.title_en ? hero.title_en : hero.title)}</h2>
                <p className="fx-hero-article-deck">
                  {locale === "en" && hero.description_en ? hero.description_en : hero.description}
                </p>
                <div className="fx-hero-article-meta">
                  <span>
                    {t("fx.analyses.hero.by")} <b>{hero.author ?? "France Open Data"}</b>
                  </span>
                  <span>·</span>
                  <span>{t("fx.analyses.hero.published")} {formatDate(hero.date)}</span>
                  {(() => {
                    const tags = locale === "en" && hero.tags_en && hero.tags_en.length > 0 ? hero.tags_en : hero.tags;
                    return tags && tags.length > 0 ? (
                      <>
                        <span>·</span>
                        <span>{tags.slice(1, 4).join(" · ")}</span>
                      </>
                    ) : null;
                  })()}
                </div>
                <span className="fx-hero-article-cta">{t("fx.analyses.hero.cta")}</span>
              </div>
            </Link>
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section className="fx-section">
          <div className="fx-wrap">
            <div className="fx-sec-head" style={{ marginBottom: 32 }}>
              <div className="fx-sec-meta">
                <span className="fx-sec-n">01</span>
                <span className="fx-sec-dot">·</span>
                <span className="fx-sec-kind">{t("fx.analyses.recent.kind")}</span>
              </div>
              <h2 className="fx-sec-title">
                {active === "all"
                  ? t("fx.analyses.recent.title_all")
                  : fill(t("fx.analyses.recent.title_cat"), { cat: activeLabel })}
              </h2>
              <p className="fx-sec-sub">
                {active === "all"
                  ? t("fx.analyses.recent.sub_all")
                  : fill(t("fx.analyses.recent.sub_cat"), { cat: activeLabel })}
              </p>
            </div>
            <div className="fx-articles-grid">
              {rest.map((p, idx) => (
                <Link
                  key={p.slug}
                  href={`/analyses/${p.slug}`}
                  className="fx-article-card"
                  onClick={() =>
                    track("chart_element_click", {
                      chart: "analyses_card",
                      slug: p.slug,
                      category: p.category,
                      rank: idx + 1,
                    })
                  }
                >
                  <div className="fx-article-photo">
                    <div className="fx-article-photo-placeholder" aria-hidden="true" />
                    {p.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="fx-photo-img" src={p.image} alt="" loading="lazy" />
                    )}
                    <span className={`fx-photo-tag fx-tag-${categorySlug(p.category)}`}>
                      {categoryLabel(p.category)}
                    </span>
                  </div>
                  <div className="fx-article-body">
                    <h3>{renderTitle(locale === "en" && p.title_en ? p.title_en : p.title)}</h3>
                    <p>{locale === "en" && p.description_en ? p.description_en : p.description}</p>
                    <div className="fx-article-meta">
                      <span>{t("fx.analyses.card.published")} <b>{formatDate(p.date)}</b></span>
                      <span>·</span>
                      <span>{p.readingTime}</span>
                    </div>
                  </div>
                </Link>
              ))}
              {/* Combler les slots vides de la dernière row pour ne pas exposer
                  le background noir de la grille (gap: 1px sur fond ink). */}
              {Array.from({ length: (3 - (rest.length % 3)) % 3 }).map((_, i) => (
                <div key={`pad-${i}`} className="fx-article-card fx-article-card-empty" aria-hidden="true" />
              ))}
            </div>
          </div>
        </section>
      )}

      {filteredPlanned.length > 0 && (
        <section className="fx-section fx-section-alt">
          <div className="fx-wrap">
            <div className="fx-sec-head" style={{ marginBottom: 32 }}>
              <div className="fx-sec-meta">
                <span className="fx-sec-n">02</span>
                <span className="fx-sec-dot">·</span>
                <span className="fx-sec-kind">{t("fx.analyses.planned.kind")}</span>
              </div>
              <h2 className="fx-sec-title">
                Les <em><Tip label={t("fx.analyses.fondamentaux.tip")}>fondamentaux</Tip></em>
              </h2>
              <p className="fx-sec-sub">{t("fx.analyses.planned.sub")}</p>
            </div>
            <div className="fx-articles-grid">
              {filteredPlanned.map((p) => (
                <div key={p.title} className="fx-article-card fx-article-card-planned">
                  <div className="fx-article-photo">
                    <div className="fx-article-photo-placeholder" aria-hidden="true" />
                    <span className={`fx-photo-tag fx-tag-${categorySlug(p.tag)}`}>
                      {p.tag}
                    </span>
                  </div>
                  <div className="fx-article-body">
                    <h3>{renderTitle(p.title)}</h3>
                    <p>{p.description}</p>
                    <div className="fx-article-meta">
                      <span>{t("fx.analyses.planned.badge")}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {filtered.length === 0 && filteredPlanned.length === 0 && (
        <section className="fx-section">
          <div className="fx-wrap">
            <div className="fx-empty">
              <div className="fx-empty-label">{t("fx.analyses.empty.label")}</div>
              <h3>{t("fx.analyses.empty.title")}</h3>
              <p>{t("fx.analyses.empty.desc")}</p>
              <div className="fx-empty-actions">
                <button
                  type="button"
                  className="fx-btn fx-btn-primary"
                  onClick={() => {
                    track("filter_reset", { page: "analyses", source: "empty_state" });
                    setActive("all");
                  }}
                >
                  {t("fx.analyses.empty.cta")}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
