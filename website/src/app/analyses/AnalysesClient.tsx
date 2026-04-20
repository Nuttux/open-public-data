"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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
};

type Planned = {
  title: string;
  description: string;
  tag: string;
};

const CATEGORIES = ["Toutes", "Enquêtes", "Analyses", "Explications", "Portraits"] as const;

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })
      .format(new Date(iso));
  } catch {
    return iso;
  }
}

function categorySlug(category: string | undefined): string {
  const c = (category ?? "Analyse").toLowerCase();
  if (c.startsWith("enquê")) return "enquete";
  if (c.startsWith("explic")) return "explication";
  if (c.startsWith("portr")) return "portrait";
  if (c.startsWith("méth") || c.startsWith("meth")) return "explication";
  return "analyse";
}

function categoryLabel(category: string | undefined): string {
  const slug = categorySlug(category);
  if (slug === "enquete") return "Enquête";
  if (slug === "explication") return "Explication";
  if (slug === "portrait") return "Portrait";
  return "Analyse";
}

/**
 * Render a title with a single `<em>…</em>` marker italicized & colored.
 * Authors can write titles like "JO 2024 : <em>anatomie d'un pic</em>".
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
  const [active, setActive] = useState<(typeof CATEGORIES)[number]>("Toutes");

  const filtered = useMemo(() => {
    if (active === "Toutes") return posts;
    return posts.filter((p) => (p.category ?? "Analyses") === active);
  }, [active, posts]);

  const filteredPlanned = useMemo(() => {
    if (active === "Toutes") return planned;
    return planned.filter((p) => p.tag + "s" === active || p.tag === active.replace(/s$/, ""));
  }, [active, planned]);

  const hero = filtered[0];
  const rest = filtered.slice(1);

  const lastPublished = posts[0];

  return (
    <>
      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            Analyses &amp; dossiers · <b>éditoriaux</b> de France Open Data
          </div>
          <h1 className="fx-page-title">
            Les chiffres, <em>racontés</em>.
          </h1>
          <p className="fx-page-lede">
            Analyses, enquêtes, portraits et explications — ce que{" "}
            <b>les données publiques</b> nous permettent de comprendre,
            dans un format qui se lit. Aucun article n&apos;est sponsorisé.
          </p>
          <div className="fx-analyses-cats">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setActive(c)}
                className={c === active ? "fx-cat fx-cat-on" : "fx-cat"}
              >
                {c}
              </button>
            ))}
            <span className="fx-cat-meta">
              {posts.length} article{posts.length > 1 ? "s" : ""} publié
              {posts.length > 1 ? "s" : ""} · {planned.length} en préparation
              {lastPublished && (
                <> · dernière le {formatDate(lastPublished.date)}</>
              )}
            </span>
          </div>
        </div>
      </section>

      {hero && (
        <section className="fx-section">
          <div className="fx-wrap">
            <Link href={`/analyses/${hero.slug}`} className="fx-hero-article">
              <div className="fx-hero-article-photo">
                <div className="fx-hero-article-photo-placeholder" aria-hidden="true" />
                {hero.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="fx-photo-img" src={hero.image} alt="" loading="eager" />
                )}
                <span
                  className={`fx-photo-tag fx-photo-tag-hero fx-tag-${categorySlug(hero.category)}`}
                >
                  À la une · {categoryLabel(hero.category).toLowerCase()}
                </span>
              </div>
              <div className="fx-hero-article-body">
                <div className={`fx-hero-article-kicker fx-kicker-${categorySlug(hero.category)}`}>
                  {categoryLabel(hero.category)} · {hero.readingTime}
                </div>
                <h2>{renderTitle(hero.title)}</h2>
                <p className="fx-hero-article-deck">{hero.description}</p>
                <div className="fx-hero-article-meta">
                  <span>
                    Par <b>{hero.author ?? "France Open Data"}</b>
                  </span>
                  <span>·</span>
                  <span>Publié le {formatDate(hero.date)}</span>
                  {hero.tags && hero.tags.length > 0 && (
                    <>
                      <span>·</span>
                      <span>{hero.tags.slice(1, 4).join(" · ")}</span>
                    </>
                  )}
                </div>
                <span className="fx-hero-article-cta">Lire l&apos;analyse →</span>
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
                <span className="fx-sec-kind">Récents</span>
              </div>
              <h2 className="fx-sec-title">
                {active === "Toutes" ? "Articles récents" : `Récents · ${active}`}
              </h2>
              <p className="fx-sec-sub">
                {active === "Toutes"
                  ? "Les derniers articles publiés — toutes rubriques confondues."
                  : `Les derniers articles de la rubrique « ${active} ».`}
              </p>
            </div>
            <div className="fx-articles-grid">
              {rest.map((p) => (
                <Link key={p.slug} href={`/analyses/${p.slug}`} className="fx-article-card">
                  <div className="fx-article-photo">
                    <div className="fx-article-photo-placeholder" aria-hidden="true" />
                    {p.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="fx-photo-img" src={p.image} alt="" loading="lazy" />
                    )}
                    <span
                      className={`fx-photo-tag fx-tag-${categorySlug(p.category)}`}
                    >
                      {categoryLabel(p.category)}
                    </span>
                  </div>
                  <div className="fx-article-body">
                    <h3>{renderTitle(p.title)}</h3>
                    <p>{p.description}</p>
                    <div className="fx-article-meta">
                      <span>Publié <b>{formatDate(p.date)}</b></span>
                      <span>·</span>
                      <span>{p.readingTime}</span>
                    </div>
                  </div>
                </Link>
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
                <span className="fx-sec-kind">En préparation</span>
              </div>
              <h2 className="fx-sec-title">
                Les <em>fondamentaux</em>
              </h2>
              <p className="fx-sec-sub">
                Articles en préparation — guide pédagogique pour comprendre les
                finances publiques sans jargon.
              </p>
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
                      <span>En préparation</span>
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
              <div className="fx-empty-label">Aucun résultat</div>
              <h3>Pas d&apos;article dans cette catégorie pour le moment.</h3>
              <p>Revenez prochainement ou consultez l&apos;ensemble des publications.</p>
              <div className="fx-empty-actions">
                <button type="button" className="fx-btn fx-btn-primary" onClick={() => setActive("Toutes")}>
                  Voir toutes les analyses
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
