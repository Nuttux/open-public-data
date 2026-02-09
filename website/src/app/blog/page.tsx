import { getAllPosts } from "@/lib/blog";
import BlogCard from "@/components/blog/BlogCard";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog - Budget Paris",
  description:
    "Articles et analyses sur les finances publiques de la Ville de Paris",
};

/**
 * Blog listing page
 * Displays all blog posts in a responsive grid
 */
export default function BlogPage() {
  const posts = getAllPosts();

  return (
    <main className="min-h-screen bg-slate-950">
      {/* Hero section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />

        <div className="relative max-w-5xl mx-auto px-6 py-16 md:py-24">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Blog
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl">
            Analyses, tutoriels et actualités sur les données ouvertes et les
            finances de Paris.
          </p>
        </div>
      </section>

      {/* Posts grid */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        {posts.length === 0 ? (
          <div className="text-center py-20">
            <h2 className="text-2xl font-semibold text-white mb-2">
              Aucun article pour le moment
            </h2>
            <p className="text-slate-400">
              Les premiers articles arrivent bientôt !
            </p>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <BlogCard key={post.slug} post={post} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
