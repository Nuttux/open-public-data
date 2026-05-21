import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import "../../fusion.css";

import { Navbar, Footer, BlogTimeBars } from "@/components/fusion";
import { getAllPostSlugs, getPostBySlug } from "@/lib/blog";
import { readLocale } from "@/lib/seo";

/** Lien interne → Next Link (déclenche les drawer intercepts au root).
 *  Lien externe / mailto → <a> classique avec target=_blank. */
function MdxLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  if (!href) return <a>{children}</a>;
  const isExternal = href.startsWith("http") || href.startsWith("mailto:");
  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }
  return <Link href={href}>{children}</Link>;
}

/** Composants exposés aux articles MDX. À étendre au fur et à mesure. */
const mdxComponents = { BlogTimeBars, a: MdxLink };

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return getAllPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<Params> }
): Promise<Metadata> {
  const { slug } = await params;
  const locale = await readLocale();
  const post = getPostBySlug(slug, locale);
  if (!post) {
    return { title: locale === "en" ? "Article not found — France Open Data" : "Analyse introuvable — France Open Data" };
  }
  const title = locale === "en" && post.title_en ? post.title_en : post.title;
  const description = locale === "en" && post.description_en ? post.description_en : post.description;
  const suffix = locale === "en" ? "Analyses · France Open Data" : "Analyses · France Open Data";
  return {
    title: `${title} — ${suffix}`,
    description,
    alternates: { canonical: `/analyses/${slug}` },
    openGraph: {
      title,
      description,
      locale: locale === "en" ? "en_US" : "fr_FR",
      alternateLocale: locale === "en" ? ["fr_FR"] : ["en_US"],
      type: "article",
    },
  };
}

function formatDate(iso: string, locale: "fr" | "en"): string {
  try {
    return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" })
      .format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function AnalyseArticlePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const locale = await readLocale();
  const post = getPostBySlug(slug, locale);
  if (!post) return notFound();

  const title = locale === "en" && post.title_en ? post.title_en : post.title;
  const description = locale === "en" && post.description_en ? post.description_en : post.description;
  const tags = locale === "en" && post.tags_en && post.tags_en.length > 0 ? post.tags_en : post.tags;
  const backLabel = locale === "en" ? "← All analyses" : "← Toutes les analyses";

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link href="/analyses" style={{ color: "var(--ocre)" }}>{backLabel}</Link>
          </div>
          <h1 className="fx-page-title" style={{ fontSize: "clamp(32px, 5vw, 64px)" }}>
            {title}
          </h1>
          <p className="fx-page-lede">{description}</p>
          <div className="fx-hero-article-meta" style={{ marginTop: 16 }}>
            <span>{post.author ?? "France Open Data"}</span>
            <span>·</span>
            <span>{formatDate(post.date, locale)}</span>
            <span>·</span>
            <span>{post.readingTime}</span>
            {tags && tags.length > 0 && (
              <>
                <span>·</span>
                <span>{tags.join(" · ")}</span>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="fx-wrap">
        <article className="fx-article-full">
          <MDXRemote
            source={post.content}
            components={mdxComponents}
            options={{
              mdxOptions: { remarkPlugins: [remarkGfm] },
              // Autorise les expressions JS dans le MDX (data={[...]}, yMin={300}).
              // Contenu blog = auteurs internes, pas d'input utilisateur → sûr.
              // blockDangerousJS reste à true (défaut) comme filet de sécurité.
              blockJS: false,
            }}
          />
        </article>
      </div>

      </main>
      <Footer />
    </div>
  );
}
