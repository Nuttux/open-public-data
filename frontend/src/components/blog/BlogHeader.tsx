import Link from "next/link";
import { BlogPostMeta } from "@/lib/blog";

interface BlogHeaderProps {
  post: BlogPostMeta;
}

/**
 * Header component for individual blog posts
 */
export default function BlogHeader({ post }: BlogHeaderProps) {
  const formattedDate = new Date(post.date).toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="mb-10">
      {/* Back link */}
      <Link
        href="/blog"
        className="inline-flex items-center gap-2 text-slate-400 hover:text-emerald-400 transition-colors mb-8"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Retour au blog
      </Link>

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full border border-emerald-500/20"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Title */}
      <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 leading-tight">
        {post.title}
      </h1>

      {/* Description */}
      <p className="text-xl text-slate-400 mb-6">{post.description}</p>

      {/* Meta */}
      <div className="flex items-center gap-4 text-sm text-slate-500 pb-6 border-b border-slate-800">
        {post.author && (
          <span className="flex items-center gap-2">
            <span className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 text-xs font-medium">
              {post.author.charAt(0).toUpperCase()}
            </span>
            {post.author}
          </span>
        )}
        <span>{formattedDate}</span>
        <span>·</span>
        <span>{post.readingTime}</span>
      </div>

      {/* Featured image */}
      {post.image && (
        <div className="mt-8 rounded-xl overflow-hidden">
          <img
            src={post.image}
            alt={post.title}
            className="w-full h-auto"
          />
        </div>
      )}
    </header>
  );
}
