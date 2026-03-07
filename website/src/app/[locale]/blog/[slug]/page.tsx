import { notFound } from 'next/navigation';
import { getPostBySlug, getAllPostSlugs } from '@/lib/blog';
import BlogHeader from '@/components/blog/BlogHeader';
import type { Metadata } from 'next';
import { MDXRemote } from 'next-mdx-remote/rsc';
import { locales, isValidLocale, defaultLocale } from '@/i18n/config';
import { t } from '@/i18n/getDictionary';

const mdxComponents = {
  h1: ({ children }: { children: React.ReactNode }) => (
    <h1 className="text-4xl font-bold text-white mb-6 mt-8">{children}</h1>
  ),
  h2: ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-2xl font-semibold text-white mb-4 mt-8 pb-2 border-b border-slate-700">
      {children}
    </h2>
  ),
  h3: ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-xl font-semibold text-slate-200 mb-3 mt-6">{children}</h3>
  ),
  p: ({ children }: { children: React.ReactNode }) => (
    <p className="text-slate-300 leading-relaxed mb-4">{children}</p>
  ),
  a: ({ href, children }: { href?: string; children: React.ReactNode }) => (
    <a
      href={href}
      className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors"
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  ),
  ul: ({ children }: { children: React.ReactNode }) => (
    <ul className="list-disc list-inside text-slate-300 mb-4 space-y-2 ml-4">
      {children}
    </ul>
  ),
  ol: ({ children }: { children: React.ReactNode }) => (
    <ol className="list-decimal list-inside text-slate-300 mb-4 space-y-2 ml-4">
      {children}
    </ol>
  ),
  li: ({ children }: { children: React.ReactNode }) => <li className="text-slate-300">{children}</li>,
  pre: ({ children }: { children: React.ReactNode }) => (
    <pre className="bg-slate-800 border border-slate-700 rounded-lg p-4 overflow-x-auto mb-4 text-sm">
      {children}
    </pre>
  ),
  code: ({ children }: { children: React.ReactNode }) => (
    <code className="bg-slate-800 text-emerald-400 px-1.5 py-0.5 rounded text-sm font-mono">
      {children}
    </code>
  ),
  blockquote: ({ children }: { children: React.ReactNode }) => (
    <blockquote className="border-l-4 border-emerald-500 pl-4 italic text-slate-400 my-4">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-slate-700 my-8" />,
  strong: ({ children }: { children: React.ReactNode }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }: { children: React.ReactNode }) => <em className="italic text-slate-200">{children}</em>,
  img: ({ src, alt }: { src?: string; alt?: string }) => (
    <img src={src} alt={alt} className="rounded-lg my-6 w-full" />
  ),
};

interface BlogPostPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateStaticParams() {
  const slugs = getAllPostSlugs();
  return locales.flatMap((locale) =>
    slugs.map((slug) => ({ locale, slug })),
  );
}

export async function generateMetadata({
  params,
}: BlogPostPageProps): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  const locale = isValidLocale(raw) ? raw : defaultLocale;
  const post = getPostBySlug(slug);

  if (!post) {
    return {
      title: `${t(locale, 'blog.not_found')} - ${t(locale, 'nav.site_title')}`,
    };
  }

  return {
    title: `${post.title} - ${t(locale, 'nav.site_title')}`,
    description: post.description,
    openGraph: {
      title: post.title,
      description: post.description,
      type: 'article',
      publishedTime: post.date,
      authors: post.author ? [post.author] : undefined,
      images: post.image ? [post.image] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { locale: raw, slug } = await params;
  const locale = isValidLocale(raw) ? raw : defaultLocale;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-slate-950">
      <article className="max-w-3xl mx-auto px-6 py-12 md:py-20">
        <BlogHeader post={post} />

        {locale === 'en' && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-6 text-sm text-blue-300">
            {t(locale, 'blog.french_only')}
          </div>
        )}

        <div className="prose prose-invert prose-emerald max-w-none">
          <MDXRemote source={post.content} components={mdxComponents} />
        </div>

        <footer className="mt-16 pt-8 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <p className="text-slate-500 text-sm">
              {t(locale, 'blog.thanks')}
            </p>
          </div>
        </footer>
      </article>
    </main>
  );
}
