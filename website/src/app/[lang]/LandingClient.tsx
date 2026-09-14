"use client";

// Direct imports — the fusion barrel pulls in server-only components
// (ProjetThumb, ProjetFiche) that fail to bundle for the client (they read
// node:fs via fusion-data). The landing model builder is likewise kept out of
// the barrel and imports only client-safe pieces.
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Landing from "@/components/landing/Landing";
import { buildParisLandingModel } from "@/lib/paris-landing-model";
import type { LandingStats } from "@/lib/fusion-data";
import type { BlogPostMeta } from "@/lib/blog";
import { useT, useLocale } from "@/lib/localeContext";

type Props = { stats: LandingStats; posts: BlogPostMeta[] };

export default function LandingClient({ stats, posts }: Props) {
  const t = useT();
  const { locale } = useLocale();
  const model = buildParisLandingModel(t, locale, stats, posts);

  return (
    <div className="theme-fusion">
      <Navbar />
      <Landing model={model} />
      <Footer />
    </div>
  );
}
