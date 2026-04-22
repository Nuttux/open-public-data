import { notFound } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Metadata } from "next";
import { loadConversation } from "@/lib/chat/store";
import { SITE_URL } from "@/lib/seo";

const FOLLOWUP_RE = /<followups>[\s\S]*?<\/followups>/g;
function clean(text: string): string {
  return text.replace(FOLLOWUP_RE, "").trim();
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const conv = loadConversation(id);
  if (!conv) return { title: "Conversation introuvable" };
  const title = conv.title.length > 70 ? conv.title.slice(0, 67) + "…" : conv.title;
  const description = conv.preview.length > 160 ? conv.preview.slice(0, 157) + "…" : conv.preview;
  const url = `${SITE_URL}/chat/c/${id}`;
  const ogImage = `${SITE_URL}/api/og/chat/${id}`;
  return {
    title,
    description,
    alternates: { canonical: `/chat/c/${id}` },
    openGraph: {
      title,
      description,
      url,
      images: [{ url: ogImage, width: 1200, height: 630 }],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function SharedConversation({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const conv = loadConversation(id);
  if (!conv) notFound();

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 md:py-16">
      <div className="mb-8 flex items-center justify-between text-xs text-neutral-500">
        <span>Conversation partagée · {new Date(conv.createdAt).toLocaleDateString("fr-FR")}</span>
        <Link href="/chat" className="text-[#2a3680] hover:text-[#1e45e4] transition">
          → Poser tes propres questions
        </Link>
      </div>

      <article className="space-y-6">
        {conv.messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "" : ""}>
            {m.role === "user" ? (
              <div className="rounded-2xl rounded-br-sm bg-neutral-900 px-4 py-3 text-white shadow-sm">
                <div className="text-[10px] uppercase tracking-wider text-white/50 mb-1">Question</div>
                <div className="text-base">{m.content}</div>
              </div>
            ) : (
              <div className="rounded-2xl rounded-bl-sm border border-neutral-200 bg-neutral-50 px-4 py-3 text-neutral-900 shadow-sm">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">Réponse · données publiques Paris</div>
                <div className="chat-md">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{clean(m.content)}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        ))}
      </article>

      <div className="mt-12 rounded-xl border border-neutral-200 bg-[#fafaf7] p-5 text-center">
        <h2 className="text-lg font-semibold text-neutral-900">Explore les données par toi-même</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Cette conversation a été générée à partir des données publiques de la Ville de Paris (budget, subventions, marchés, dette).
        </p>
        <Link
          href="/chat"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#2a3680] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#1e45e4] transition"
        >
          Pose ta question →
        </Link>
      </div>

      <p className="mt-6 text-center text-[11px] text-neutral-400">
        Réponses générées par IA. Vérifie les sources citées.
      </p>
    </main>
  );
}
