'use client';

import BlogCard from "@/components/blog/BlogCard";
import { useT } from '@/lib/localeContext';
import type { BlogPostMeta } from '@/lib/blog';

interface Props {
  posts: BlogPostMeta[];
}

export default function BlogPageClient({ posts }: Props) {
  const t = useT();

  return (
    <main className="min-h-screen bg-slate-950">
      {/* Hero section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950/20" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />

        <div className="relative max-w-5xl mx-auto px-6 py-16 md:py-24">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            {t('blog.title')}
          </h1>
          <p className="text-xl text-slate-400 max-w-2xl">
            {t('blog.subtitle')}
          </p>
        </div>
      </section>

      {/* Posts grid */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        {posts.length === 0 ? (
          <div className="text-center py-20">
            <h2 className="text-2xl font-semibold text-white mb-2">
              {t('blog.empty_title')}
            </h2>
            <p className="text-slate-400">
              {t('blog.empty_text')}
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
