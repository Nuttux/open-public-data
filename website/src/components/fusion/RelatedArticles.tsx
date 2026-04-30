"use client";

import Link from "next/link";
import SectionHead from "./SectionHead";
import type { BlogPostMeta } from "@/lib/blog";
import { useT, useLocale } from "@/lib/localeContext";

export type ArticlePlaceholder = {
  title: string;
  description: string;
  category: string;
};

function categorySlug(c: string | undefined): string {
  const x = (c ?? "").toLowerCase();
  if (x.startsWith("enquê") || x.startsWith("invest")) return "enquete";
  if (x.startsWith("explic") || x.startsWith("méth") || x.startsWith("meth")) return "explication";
  if (x.startsWith("portr")) return "portrait";
  return "analyse";
}

export default function RelatedArticles({
  id = "sec-analyses",
  number,
  posts,
  placeholders = [],
  maxItems = 3,
}: {
  id?: string;
  number: string;
  posts: BlogPostMeta[];
  placeholders?: ArticlePlaceholder[];
  /** Total maximum cards rendered (posts + placeholders). Defaults to 3 — the
   *  placeholders are only shown when there are fewer than `maxItems` real
   *  posts to feature on this page. Avoids the "5 cards = 3 published + 2
   *  À paraître" anti-pattern when a page already has its 3 featured posts. */
  maxItems?: number;
}) {
  const t = useT();
  const { locale } = useLocale();
  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

  // Keep at most `maxItems` cards in total : real posts in priority,
  // then fill remaining slots with planned placeholders.
  const visiblePosts = posts.slice(0, maxItems);
  const remainingSlots = Math.max(0, maxItems - visiblePosts.length);
  const visiblePlaceholders = placeholders.slice(0, remainingSlots);

  if (visiblePosts.length === 0 && visiblePlaceholders.length === 0) return null;

  return (
    <section className="fx-section" id={id}>
      <div className="fx-wrap">
        <SectionHead
          number={number}
          kind={t("fx.s.analyses.kind")}
          title={
            <>
              {t("fx.s.analyses.title.before")}
              <em>{t("fx.s.analyses.title.em")}</em>
            </>
          }
          subtitle={t("fx.s.analyses.sub")}
        />
        <div className="fx-articles-grid">
          {visiblePosts.map((p) => {
            const title = locale === "en" && p.title_en ? p.title_en : p.title;
            const description = locale === "en" && p.description_en ? p.description_en : p.description;
            const category = locale === "en" && p.category_en ? p.category_en : (p.category ?? "Analyse");
            return (
              <Link key={p.slug} href={`/analyses/${p.slug}`} className="fx-article-card">
                <div className="fx-article-photo">
                  <div className="fx-article-photo-placeholder" aria-hidden="true" />
                  {p.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="fx-photo-img" src={p.image} alt="" loading="lazy" />
                  )}
                  <span className={`fx-photo-tag fx-tag-${categorySlug(p.category)}`}>
                    {category}
                  </span>
                </div>
                <div className="fx-article-body">
                  <h3>{title}</h3>
                  <p>{description}</p>
                  <div className="fx-article-meta">
                    <span>
                      {t("fx.analyses.card.published")} <b>{formatDate(p.date)}</b>
                    </span>
                    <span>·</span>
                    <span>{p.readingTime}</span>
                  </div>
                </div>
              </Link>
            );
          })}
          {visiblePlaceholders.map((pl, i) => (
            <div key={`pl-${i}`} className="fx-article-card fx-article-card-planned">
              <div className="fx-article-photo">
                <div className="fx-article-photo-placeholder" aria-hidden="true" />
                <span className={`fx-photo-tag fx-tag-${categorySlug(pl.category)}`}>
                  {pl.category}
                </span>
              </div>
              <div className="fx-article-body">
                <h3>{pl.title}</h3>
                <p>{pl.description}</p>
                <div className="fx-article-meta">
                  <span className="fx-article-planned-label">
                    {t("fx.s.analyses.planned")}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
