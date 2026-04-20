import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import "../../fusion.css";

import { Navbar, Footer } from "@/components/fusion";
import { getAllPostSlugs, getPostBySlug } from "@/lib/blog";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return getAllPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<Params> }
): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Analyse introuvable — France Open Data" };
  return {
    title: `${post.title} — Analyses · France Open Data`,
    description: post.description,
    alternates: { canonical: `/analyses/${slug}` },
  };
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" })
      .format(new Date(iso));
  } catch {
    return iso;
  }
}

export default async function AnalyseArticlePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return notFound();

  return (
    <div className="theme-fusion">
      <Navbar />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">
            <Link href="/analyses" style={{ color: "var(--ocre)" }}>← Toutes les analyses</Link>
          </div>
          <h1 className="fx-page-title" style={{ fontSize: "clamp(32px, 5vw, 64px)" }}>
            {post.title}
          </h1>
          <p className="fx-page-lede">{post.description}</p>
          <div className="fx-hero-article-meta" style={{ marginTop: 16 }}>
            <span>{post.author ?? "France Open Data"}</span>
            <span>·</span>
            <span>{formatDate(post.date)}</span>
            <span>·</span>
            <span>{post.readingTime}</span>
            {post.tags && post.tags.length > 0 && (
              <>
                <span>·</span>
                <span>{post.tags.join(" · ")}</span>
              </>
            )}
          </div>
        </div>
      </section>

      <div className="fx-wrap">
        <article className="fx-article-full">
          <MDXRemote
            source={post.content}
            options={{ mdxOptions: { remarkPlugins: [remarkGfm] } }}
          />
        </article>
      </div>

      <Footer />
    </div>
  );
}
