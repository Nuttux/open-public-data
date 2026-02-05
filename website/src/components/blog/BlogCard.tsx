import Link from "next/link";
import { BlogPostMeta } from "@/lib/blog";

interface BlogCardProps {
  post: BlogPostMeta;
}

/**
 * Blog post card for the blog listing page
 */
export default function BlogCard({ post }: BlogCardProps) {
  const formattedDate = new Date(post.date).toLocaleDateString("fr-FR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <article className="group">
      <Link href={`/blog/${post.slug}`}>
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-6 transition-all duration-300 hover:border-emerald-500/50 hover:bg-slate-900/80 hover:shadow-lg hover:shadow-emerald-500/5">
          {/* Image placeholder */}
          {post.image && (
            <div className="relative h-48 mb-4 rounded-lg overflow-hidden bg-slate-800">
              <img
                src={post.image}
                alt={post.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </div>
          )}

          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {post.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Title */}
          <h2 className="text-xl font-semibold text-white mb-2 group-hover:text-emerald-400 transition-colors">
            {post.title}
          </h2>

          {/* Description */}
          <p className="text-slate-400 text-sm mb-4 line-clamp-2">
            {post.description}
          </p>

          {/* Meta info */}
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>{formattedDate}</span>
            <span>{post.readingTime}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}
