import fs from "fs";
import path from "path";
import matter from "gray-matter";
import readingTime from "reading-time";

// Blog posts directory
const POSTS_PATH = path.join(process.cwd(), "content/blog");

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  date: string;
  author?: string;
  tags?: string[];
  image?: string;
  /** Editorial category (Enquête / Explication / Portrait) — drives the chips
   *  filter on /analyses. Falls back to tag-based inference if absent. */
  category?: string;
  /** When true, post is reachable by direct URL but excluded from the listing
   *  (used for the manifesto / about page that lives in the blog dir). */
  hidden?: boolean;
  readingTime: string;
  content: string;
}

export interface BlogPostMeta {
  slug: string;
  title: string;
  description: string;
  date: string;
  author?: string;
  tags?: string[];
  image?: string;
  category?: string;
  hidden?: boolean;
  readingTime: string;
}

/**
 * Get all MDX files from the blog directory
 */
function getMDXFiles(): string[] {
  if (!fs.existsSync(POSTS_PATH)) {
    return [];
  }
  return fs
    .readdirSync(POSTS_PATH)
    .filter((file) => file.endsWith(".mdx") || file.endsWith(".md"));
}

/**
 * Parse a single MDX file and extract frontmatter + content
 */
function parseMDXFile(fileName: string): BlogPost {
  const filePath = path.join(POSTS_PATH, fileName);
  const fileContent = fs.readFileSync(filePath, "utf-8");
  const { data, content } = matter(fileContent);
  const slug = fileName.replace(/\.mdx?$/, "");
  const stats = readingTime(content);

  return {
    slug,
    title: data.title || "Untitled",
    description: data.description || "",
    date: data.date || new Date().toISOString(),
    author: data.author,
    tags: data.tags || [],
    image: data.image,
    category: typeof data.category === "string" ? data.category : undefined,
    hidden: data.hidden === true,
    readingTime: stats.text,
    content,
  };
}

/**
 * Get all blog posts, sorted by date (newest first)
 */
export function getAllPosts(): BlogPostMeta[] {
  const files = getMDXFiles();
  const posts = files
    .map((file) => {
      const post = parseMDXFile(file);
      // Return metadata only (not content)
      const { content: _, ...meta } = post;
      return meta;
    })
    .filter((p) => !p.hidden);

  // Sort by date, newest first
  return posts.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

/**
 * Get a single post by slug
 */
export function getPostBySlug(slug: string): BlogPost | null {
  const files = getMDXFiles();
  const fileName = files.find(
    (file) => file.replace(/\.mdx?$/, "") === slug
  );

  if (!fileName) {
    return null;
  }

  return parseMDXFile(fileName);
}

/**
 * Get all unique tags from all posts
 */
export function getAllTags(): string[] {
  const posts = getAllPosts();
  const tags = new Set<string>();
  posts.forEach((post) => {
    post.tags?.forEach((tag) => tags.add(tag));
  });
  return Array.from(tags).sort();
}

/**
 * Get all post slugs (for static generation)
 */
export function getAllPostSlugs(): string[] {
  return getMDXFiles().map((file) => file.replace(/\.mdx?$/, ""));
}
