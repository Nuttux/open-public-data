"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type ToolCall = { name: string; input: Record<string, unknown> };
type Msg = { role: "user" | "assistant"; content: string; tools?: ToolCall[]; thinking?: boolean; followups?: string[] };

const STORAGE_KEY = "open-public-data:chat:v1";
const STORAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 jours

function loadStored(): Msg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { ts: number; messages: Msg[] };
    if (!parsed?.messages || Date.now() - parsed.ts > STORAGE_MAX_AGE_MS) return [];
    return parsed.messages;
  } catch {
    return [];
  }
}

function saveStored(messages: Msg[]) {
  if (typeof window === "undefined") return;
  try {
    if (!messages.length) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify({ ts: Date.now(), messages }));
  } catch {
    /* quota / private mode — ignore */
  }
}

const FOLLOWUP_REGEX = /<followups>([\s\S]*?)<\/followups>/;
function extractFollowups(text: string): { clean: string; followups: string[] } {
  const m = text.match(FOLLOWUP_REGEX);
  if (!m) return { clean: text, followups: [] };
  let followups: string[] = [];
  try {
    const parsed = JSON.parse(m[1].trim());
    if (Array.isArray(parsed)) followups = parsed.filter((x): x is string => typeof x === "string").slice(0, 3);
  } catch { /* ignore */ }
  return { clean: text.replace(FOLLOWUP_REGEX, "").trim(), followups };
}

const SUGGESTIONS = [
  "Combien Paris a-t-elle versé en subventions en 2024 ?",
  "Quels secteurs captent le plus de subventions ?",
  "Combien Paris dépense-t-elle en cabinets de conseil ?",
  "Quel est le total de la dette de Paris ?",
];

export default function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Hydrate from localStorage once + handle ?q= deep-link
  useEffect(() => {
    setMessages(loadStored());
    setHydrated(true);
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const q = params.get("q");
      if (q) {
        setOpen(true);
        // Strip param so refresh doesn't re-trigger
        params.delete("q");
        const newSearch = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (newSearch ? `?${newSearch}` : ""));
        setTimeout(() => send(q), 300);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every change after hydration
  useEffect(() => {
    if (hydrated) saveStored(messages);
  }, [messages, hydrated]);

  function reset() {
    setMessages([]);
    saveStored([]);
    setError(null);
    setInput("");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const [shareState, setShareState] = useState<"idle" | "saving" | "copied" | "error">("idle");

  async function shareAnswer() {
    if (!messages.length) return;
    setShareState("saving");
    try {
      const res = await fetch("/api/chat/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: messages.map((m) => ({ role: m.role, content: m.content })) }),
      });
      if (!res.ok) throw new Error("save failed");
      const { url } = await res.json();
      const fullUrl = `${window.location.origin}${url}`;
      await navigator.clipboard.writeText(fullUrl);
      setShareState("copied");
      setTimeout(() => setShareState("idle"), 2500);
    } catch {
      setShareState("error");
      setTimeout(() => setShareState("idle"), 2500);
    }
  }

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setError(null);
    const userMsg: Msg = { role: "user", content: text };
    const assistantMsg: Msg = { role: "assistant", content: "", tools: [], thinking: false };
    const wireHistory = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));
    setMessages([...messages, userMsg, assistantMsg]);
    setInput("");
    setLoading(true);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: wireHistory }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      const apply = (event: string, dataRaw: string) => {
        let data: unknown = null;
        try { data = JSON.parse(dataRaw); } catch { return; }
        if (event === "text") {
          const delta = data as string;
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") copy[copy.length - 1] = { ...last, content: last.content + delta };
            return copy;
          });
        } else if (event === "thinking") {
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") copy[copy.length - 1] = { ...last, thinking: true };
            return copy;
          });
        } else if (event === "tool") {
          const tc = data as ToolCall;
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant") copy[copy.length - 1] = { ...last, tools: [...(last.tools ?? []), tc] };
            return copy;
          });
        } else if (event === "error") {
          setError((data as { message?: string }).message ?? "Erreur");
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Parse follow-ups from final assistant message + clean tag from display
          setMessages((m) => {
            const copy = [...m];
            const last = copy[copy.length - 1];
            if (last?.role === "assistant" && last.content) {
              const { clean, followups } = extractFollowups(last.content);
              copy[copy.length - 1] = { ...last, content: clean, followups };
            }
            return copy;
          });
          break;
        }
        buf += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          let event = "message";
          let dataLine = "";
          for (const line of chunk.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) dataLine += line.slice(5).trim();
          }
          if (dataLine) apply(event, dataLine);
        }
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setMessages((m) => {
          const copy = [...m];
          const last = copy[copy.length - 1];
          if (last?.role === "assistant" && !last.content) copy[copy.length - 1] = { ...last, content: "_(arrêté)_" };
          return copy;
        });
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <>
      {/* Floating launcher — pill with explicit label, no ambiguity vs help chat */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="group fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-[#2a3680]! pl-4 pr-5 py-3 text-white shadow-lg shadow-[#2a3680]/30 hover:scale-[1.03] hover:bg-[#1e45e4]! transition"
          aria-label="Poser une question aux données"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          <span className="text-sm font-medium leading-none">
            Interroger les données
          </span>
          <span className="ml-1 rounded-full bg-[#e11d1d] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider leading-none">
            IA
          </span>
        </button>
      )}

      {/* Backdrop — light veil for light site */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-neutral-900/15 transition-opacity"
          aria-hidden
        />
      )}

      {/* Panel — light theme matching site */}
      <div
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-neutral-200 bg-white shadow-[-12px_0_40px_rgba(0,0,0,0.10)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
        role="dialog"
        aria-label="Chat données publiques"
      >
        <header className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[#e11d1d]" />
            <div>
              <div className="text-sm font-semibold text-neutral-900">Chat</div>
              <div className="text-[11px] text-neutral-500">Données publiques · Paris</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {hasMessages && (
              <button
                onClick={reset}
                className="rounded px-2 py-1 text-[11px] text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition"
                title="Nouvelle conversation"
              >
                ↺ Nouveau
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition"
              aria-label="Fermer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {!hasMessages && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-neutral-800">
                  Pose une question sur les finances de la Ville de Paris.
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  Les réponses s'appuient uniquement sur les données publiques du site.
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-neutral-400">Exemples</div>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="group flex w-full items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-left text-xs text-neutral-700 hover:bg-neutral-50 hover:border-neutral-900 hover:text-neutral-900 transition"
                  >
                    <span>{s}</span>
                    <span className="text-neutral-300 group-hover:text-neutral-900 transition">→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm ${
                  m.role === "user"
                    ? "bg-neutral-900! text-white rounded-br-sm"
                    : "bg-neutral-50! text-neutral-900 border border-neutral-200 rounded-bl-sm"
                }`}
              >
                {m.role === "assistant" ? (
                  <div>
                    {m.tools && m.tools.length > 0 && (
                      <div className="mb-2 space-y-0.5">
                        {m.tools.map((t, j) => (
                          <div key={j} className="text-[10px] font-mono text-neutral-500 truncate">
                            <span className="text-[#e11d1d]">→</span> {t.name}
                            <span className="text-neutral-400">
                              ({Object.entries(t.input).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")})
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {m.content ? (
                      <>
                        <div className="chat-md">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                        </div>
                        {!loading && i === messages.length - 1 && (
                          <div className="mt-2.5 flex items-center gap-3 border-t border-neutral-200 pt-2">
                            <button
                              onClick={shareAnswer}
                              disabled={shareState === "saving"}
                              className="text-[11px] text-neutral-500 hover:text-[#2a3680] transition disabled:opacity-50"
                              title="Générer un lien partageable de la conversation"
                            >
                              {shareState === "saving"
                                ? "⏳ Création…"
                                : shareState === "copied"
                                ? "✓ Lien copié !"
                                : shareState === "error"
                                ? "✗ Erreur"
                                : "🔗 Partager"}
                            </button>
                          </div>
                        )}
                        {m.followups && m.followups.length > 0 && !loading && (
                          <div className="mt-2.5 space-y-1">
                            <div className="text-[10px] uppercase tracking-wider text-neutral-400">Continuer</div>
                            {m.followups.map((f, k) => (
                              <button
                                key={k}
                                onClick={() => send(f)}
                                className="group flex w-full items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-left text-[11px] text-neutral-700 hover:bg-neutral-50 hover:border-[#2a3680] hover:text-[#2a3680] transition"
                              >
                                <span>{f}</span>
                                <span className="text-neutral-300 group-hover:text-[#2a3680] transition">→</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    ) : m.thinking && (!m.tools || m.tools.length === 0) ? (
                      <div className="flex items-center gap-2 py-1 text-[11px] text-neutral-500 italic">
                        <span className="inline-flex gap-1">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e11d1d]/70" />
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e11d1d]/70 [animation-delay:150ms]" />
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e11d1d]/70 [animation-delay:300ms]" />
                        </span>
                        Réflexion…
                      </div>
                    ) : (
                      <span className="inline-flex gap-1 py-1">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neutral-400 [animation-delay:300ms]" />
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{m.content}</div>
                )}
              </div>
            </div>
          ))}

          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="border-t border-neutral-200 bg-neutral-50/50 p-3"
        >
          <div className="flex items-end gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              placeholder="Pose ta question…"
              className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 disabled:opacity-50 transition"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-900! text-white hover:bg-neutral-800! disabled:opacity-30 disabled:cursor-not-allowed transition"
              aria-label={loading ? "Arrêter" : "Envoyer"}
              onClick={(e) => {
                if (loading) {
                  e.preventDefault();
                  abortRef.current?.abort();
                }
              }}
            >
              {loading ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="1.5" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              )}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-neutral-500">
            Réponses générées par IA à partir des données publiques. Vérifie les sources citées.
          </p>
        </form>
      </div>
    </>
  );
}
