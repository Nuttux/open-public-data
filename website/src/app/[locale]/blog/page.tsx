import { getAllPosts } from '@/lib/blog';
import BlogPageClient from './BlogPageClient';
import { t } from '@/i18n/getDictionary';
import { isValidLocale, defaultLocale } from '@/i18n/config';
import type { Metadata } from 'next';

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = isValidLocale(raw) ? raw : defaultLocale;
  return {
    title: `${t(locale, 'blog.title')} - ${t(locale, 'nav.site_title')}`,
    description: t(locale, 'blog.subtitle'),
  };
}

export default async function BlogPage() {
  const posts = getAllPosts();
  return <BlogPageClient posts={posts} />;
}
