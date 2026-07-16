"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getChatSuggestions, CHAT_ASK_EVENT, sectionForPath } from "@/lib/chat/suggestions";
import { useT, useLocale } from "@/lib/localeContext";
import { toolLabel, toolRaw } from "@/lib/chat/toolLabels";

// Le partage écrit sur disque (data/conversations) : indisponible sur un
// hébergement serverless sans stockage. Visible en dev, opt-in en prod
// (NEXT_PUBLIC_CHAT_SHARE=on une fois un vrai store branché).
const SHARE_ENABLED = process.env.NODE_ENV === "development" || process.env.NEXT_PUBLIC_CHAT_SHARE === "on";

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

// Historique multi-conversations, 100 % local (localStorage).
type ArchivedConv = { id: string; ts: number; title: string; messages: Msg[] };
const HISTORY_KEY = "open-public-data:chat:history:v1";
const HISTORY_MAX = 20;
const HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

function loadHistory(): ArchivedConv[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ArchivedConv[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c) => c?.messages?.length && Date.now() - c.ts < HISTORY_MAX_AGE_MS);
  } catch {
    return [];
  }
}

function saveHistory(list: ArchivedConv[]) {
  if (typeof window === "undefined") return;
  let trimmed = list.slice(0, HISTORY_MAX);
  // Quota localStorage : on lâche les plus anciennes plutôt que d'échouer.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
      return;
    } catch {
      trimmed = trimmed.slice(0, Math.max(0, trimmed.length - 5));
    }
  }
}

const FOLLOWUP_REGEX = /<followups>([\s\S]*?)<\/followups>/;
function extractFollowups(text: string): { clean: string; followups: string[] } {
  const m = text.match(FOLLOWUP_REGEX);
  if (!m) return { clean: text, followups: [] };
  let followups: string[] = [];
  try {
    const parsed = JSON.parse(m[1].trim());
    if (Array.isArray(parsed))
      followups = parsed
        .filter((x): x is string => typeof x === "string")
        // Les "pourquoi" causaux mènent à des impasses (les données ne
        // documentent pas les causes) — on les écarte côté client aussi.
        .filter((q) => !/^\s*(pourquoi|why)\b/i.test(q))
        .slice(0, 3);
  } catch { /* ignore */ }
  return { clean: text.replace(FOLLOWUP_REGEX, "").trim(), followups };
}

const TEASER_DISMISS_KEY = "open-public-data:chat:teaser-dismissed";

function ChatPanelInner() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teaserDismissed, setTeaserDismissed] = useState(true);
  const [view, setView] = useState<"chat" | "history">("chat");
  const [historyList, setHistoryList] = useState<ArchivedConv[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const t = useT();
  const { locale } = useLocale();
  const pathname = usePathname() ?? "/";
  const section = sectionForPath(pathname);
  const suggestions = getChatSuggestions(section, locale);
  // Question mise en avant à côté du launcher — uniquement sur les pages de
  // données (le label parle des graphes ; la landing reste épurée : pilule seule).
  const teaser = section === "default" ? null : suggestions[0];

  // Auto-scroll intelligent : on ne suit le flux que si l'utilisateur est
  // déjà en bas — remonter lire pendant le streaming ne doit pas être happé.
  const stickToBottomRef = useRef(true);
  function onScrollArea() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }
  useEffect(() => {
    if (stickToBottomRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, loading]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus trap (RGAA) : Tab reste dans le panneau tant qu'il est ouvert.
  useEffect(() => {
    if (!open) return;
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !panelRef.current.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onTab);
    return () => window.removeEventListener("keydown", onTab);
  }, [open]);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(timer);
    }
  }, [open]);

  // Hydrate from localStorage once + handle ?q= deep-link
  useEffect(() => {
    setMessages(loadStored());
    setHistoryList(loadHistory());
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

  // Teaser : masqué si déjà écarté dans cette session.
  useEffect(() => {
    try {
      setTeaserDismissed(sessionStorage.getItem(TEASER_DISMISS_KEY) === "1");
    } catch {
      setTeaserDismissed(false);
    }
  }, []);

  function dismissTeaser() {
    setTeaserDismissed(true);
    try {
      sessionStorage.setItem(TEASER_DISMISS_KEY, "1");
    } catch {
      /* private mode — ignore */
    }
  }

  // « Pose cette question » déclenché ailleurs sur le site (chips, page /chat).
  // Ref pour que l'écouteur voie toujours le dernier send (sinon closure périmée).
  const sendRef = useRef<(text: string) => void>(() => {});
  useEffect(() => {
    const onAsk = (e: Event) => {
      const q = (e as CustomEvent<string>).detail;
      if (typeof q !== "string" || !q.trim()) return;
      setOpen(true);
      setTimeout(() => sendRef.current(q), 250);
    };
    window.addEventListener(CHAT_ASK_EVENT, onAsk);
    return () => window.removeEventListener(CHAT_ASK_EVENT, onAsk);
  }, []);

  // Archive la conversation courante (si au moins un échange complet).
  function archiveCurrent(msgs: Msg[]): ArchivedConv[] {
    if (msgs.length < 2 || !msgs.some((m) => m.role === "assistant" && m.content)) return historyList;
    const conv: ArchivedConv = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      ts: Date.now(),
      title: (msgs.find((m) => m.role === "user")?.content ?? "…").slice(0, 90),
      messages: msgs,
    };
    const next = [conv, ...historyList].slice(0, HISTORY_MAX);
    setHistoryList(next);
    saveHistory(next);
    return next;
  }

  function reset() {
    abortRef.current?.abort();
    setLoading(false);
    archiveCurrent(messages);
    setMessages([]);
    saveStored([]);
    setError(null);
    setInput("");
    setView("chat");
    stickToBottomRef.current = true;
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function restoreConv(conv: ArchivedConv) {
    // La courante part en archive, la restaurée sort de la liste.
    const withCurrent = archiveCurrent(messages);
    const next = withCurrent.filter((c) => c.id !== conv.id);
    setHistoryList(next);
    saveHistory(next);
    setMessages(conv.messages);
    setError(null);
    setView("chat");
    stickToBottomRef.current = true;
  }

  function deleteConv(id: string) {
    const next = historyList.filter((c) => c.id !== id);
    setHistoryList(next);
    saveHistory(next);
  }

  function clearHistory() {
    setHistoryList([]);
    saveHistory([]);
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
    setView("chat");
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
        body: JSON.stringify({ messages: wireHistory, locale }),
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
          if (last?.role === "assistant" && !last.content) copy[copy.length - 1] = { ...last, content: t("chat.stopped") };
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
  sendRef.current = send;

  return (
    <>
      {/* Teaser contextuel — une vraie question, adaptée à la page courante.
          Desktop uniquement (le mobile garde le launcher seul). */}
      {!open && !teaserDismissed && teaser && (
        <div className="fixed bottom-21 right-5 z-40 hidden max-w-70 items-start gap-1 md:flex">
          <button
            onClick={() => {
              dismissTeaser();
              setOpen(true);
              setTimeout(() => sendRef.current(teaser), 250);
            }}
            className="rounded-xl rounded-br-sm border! border-solid! border-neutral-200! bg-white! px-3.5 py-2.5 text-left text-[13px] leading-snug text-neutral-800 shadow-lg shadow-neutral-900/8 transition hover:border-[#2a3680]! hover:text-[#2a3680]"
          >
            <span className="mb-0.5 block text-[9.5px] font-semibold uppercase tracking-wider text-neutral-400">
              {t("chat.teaser_label")}
            </span>
            {teaser}
          </button>
          <button
            onClick={dismissTeaser}
            aria-label={t("chat.teaser_dismiss")}
            className="rounded-full bg-white! border! border-solid! border-neutral-200! p-1 text-neutral-400 shadow-sm transition hover:bg-neutral-100! hover:text-neutral-700"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Floating launcher — pill with explicit label, no ambiguity vs help chat */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="group fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[#2a3680]! text-white shadow-lg shadow-[#2a3680]/30 hover:scale-[1.03] hover:bg-[#1e45e4]! transition md:h-auto md:w-auto md:justify-start md:gap-2.5 md:py-3 md:pl-4 md:pr-5"
          aria-label={t("chat.launcher")}
          title={t("chat.launcher")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
          </svg>
          <span className="hidden text-sm font-medium leading-none md:inline">
            {t("chat.launcher")}
          </span>
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5 md:hidden">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e11d1d] opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[#e11d1d]" />
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
        ref={panelRef}
        className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md lg:max-w-lg flex-col border-l border-neutral-200 bg-white shadow-[-12px_0_40px_rgba(0,0,0,0.10)] transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        aria-hidden={!open}
        role="dialog"
        aria-label={t("chat.aria_dialog")}
      >
        <header className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50/60 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[#e11d1d]" />
            <div>
              <div className="text-sm font-semibold text-neutral-900">{t("chat.title")}</div>
              <div className="text-[11px] text-neutral-500">{t("chat.subtitle")}</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {historyList.length > 0 && (
              <button
                onClick={() => setView((v) => (v === "history" ? "chat" : "history"))}
                className={`rounded-full border! border-solid! px-2.5 py-1 text-[11px] font-medium transition ${
                  view === "history"
                    ? "border-neutral-900! bg-neutral-900! text-white"
                    : "border-neutral-200! bg-white! text-neutral-700 hover:border-neutral-900! hover:text-neutral-900"
                }`}
                title={t("chat.history")}
              >
                {t("chat.history")}
              </button>
            )}
            {hasMessages && (
              <button
                onClick={reset}
                className="rounded-full border! border-solid! border-neutral-200! bg-white! px-2.5 py-1 text-[11px] font-medium text-neutral-700 hover:border-neutral-900! hover:text-neutral-900 transition"
                title={t("chat.new_title")}
              >
                ↺ {t("chat.new")}
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              className="rounded p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 transition"
              aria-label={t("chat.close")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </header>

        <div ref={scrollRef} onScroll={onScrollArea} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {view === "history" && (
            <div className="space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-neutral-400">{t("chat.history")}</div>
              {historyList.length === 0 && <p className="text-xs text-neutral-500">{t("chat.history_empty")}</p>}
              {historyList.map((c) => (
                <div
                  key={c.id}
                  className="flex items-start gap-2 rounded-md border! border-solid! border-neutral-200! bg-white! px-3 py-2.5"
                >
                  <button onClick={() => restoreConv(c)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-xs text-neutral-800">{c.title}</div>
                    <div className="mt-0.5 text-[10px] text-neutral-400">
                      {new Date(c.ts).toLocaleString(locale === "en" ? "en-GB" : "fr-FR", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" · "}
                      {Math.ceil(c.messages.length / 2)} {t("chat.msgs")}
                    </div>
                  </button>
                  <button
                    onClick={() => deleteConv(c.id)}
                    aria-label={t("chat.delete")}
                    title={t("chat.delete")}
                    className="rounded p-1 text-neutral-400 transition hover:bg-neutral-100! hover:text-red-600"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
              {historyList.length > 0 && (
                <button onClick={clearHistory} className="text-[11px] text-neutral-500 underline-offset-2 hover:text-red-600 hover:underline transition">
                  {t("chat.clear_all")}
                </button>
              )}
              <p className="text-[10px] leading-relaxed text-neutral-400">{t("chat.history_hint")}</p>
            </div>
          )}

          {view === "chat" && !hasMessages && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-neutral-800">
                  {t("chat.empty_title")}
                </p>
                <p className="mt-1 text-xs text-neutral-500">
                  {t("chat.empty_sub")}
                </p>
              </div>
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-neutral-400">{t("chat.examples")}</div>
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="group flex w-full items-center justify-between gap-2 rounded-md border! border-solid! border-neutral-200! bg-white! px-3 py-2.5 text-left text-xs text-neutral-700 hover:bg-neutral-50! hover:border-neutral-900! hover:text-neutral-900 transition"
                  >
                    <span>{s}</span>
                    <span className="text-neutral-300 group-hover:text-neutral-900 transition">→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === "chat" && messages.map((m, i) => (
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
                          <div
                            key={j}
                            className="text-[11px] text-neutral-500 italic truncate"
                            title={toolRaw(t.name, t.input)}
                          >
                            <span className="not-italic text-[#e11d1d]">→</span> {toolLabel(t.name, t.input, locale)}
                            {loading && i === messages.length - 1 && j === (m.tools?.length ?? 0) - 1 && !m.content ? "…" : ""}
                          </div>
                        ))}
                      </div>
                    )}
                    {m.content ? (
                      <>
                        <div className="chat-md">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                        </div>
                        {SHARE_ENABLED && !loading && i === messages.length - 1 && (
                          <div className="mt-2.5 flex items-center gap-3 border-t border-neutral-200 pt-2">
                            <button
                              onClick={shareAnswer}
                              disabled={shareState === "saving"}
                              className="text-[11px] text-neutral-500 hover:text-[#2a3680] transition disabled:opacity-50"
                              title={t("chat.share_title")}
                            >
                              {shareState === "saving"
                                ? t("chat.share_saving")
                                : shareState === "copied"
                                ? t("chat.share_copied")
                                : shareState === "error"
                                ? t("chat.share_error")
                                : t("chat.share")}
                            </button>
                          </div>
                        )}
                        {m.followups && m.followups.length > 0 && !loading && (
                          <div className="mt-2.5 space-y-1">
                            <div className="text-[10px] uppercase tracking-wider text-neutral-400">{t("chat.continue")}</div>
                            {m.followups.map((f, k) => (
                              <button
                                key={k}
                                onClick={() => send(f)}
                                className="group flex w-full items-center justify-between gap-2 rounded-md border! border-solid! border-neutral-200! bg-white! px-2.5 py-1.5 text-left text-[11px] text-neutral-700 hover:bg-neutral-50! hover:border-[#2a3680]! hover:text-[#2a3680] transition"
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
                        {t("chat.thinking")}
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

          {view === "chat" && error && (
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
              enterKeyHint="send"
              placeholder={t("chat.placeholder")}
              className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 disabled:opacity-50 transition"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-neutral-900! text-white hover:bg-neutral-800! disabled:opacity-30 disabled:cursor-not-allowed transition"
              aria-label={loading ? t("chat.aria_stop") : t("chat.aria_send")}
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
            {t("chat.disclaimer")}
          </p>
        </form>
      </div>
    </>
  );
}

/**
 * v0 US : le chat est soudé à Paris — prompt système, outils, chemins de
 * données (ADR-0010 D4). Sur les routes /us on ne rend rien, tant qu'un
 * « place context pack » US n'existe pas. Wrapper séparé pour garder
 * l'ordre des hooks stable quel que soit le chemin.
 */
export default function ChatPanel() {
  const pathname = usePathname() ?? "/";
  if (pathname === "/us" || pathname.startsWith("/us/")) return null;
  return <ChatPanelInner />;
}
