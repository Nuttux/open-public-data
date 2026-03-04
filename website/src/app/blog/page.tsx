import { getAllPosts } from "@/lib/blog";
import BlogPageClient from "./BlogPageClient";

export const metadata = {
  title: "Blog - Budget Paris",
  description: "Articles et analyses sur les finances publiques de la Ville de Paris",
};

export default function BlogPage() {
  const posts = getAllPosts();
  return <BlogPageClient posts={posts} />;
}
