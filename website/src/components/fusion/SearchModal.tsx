"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";

type Hit = {
  insee: string;
  slug: string;
  nom: string;
  dep_name: string;
  pop: number;
};

const fmtInt = (n: number) => n.toLocaleString("fr-FR");

/**
 * Global search modal — opened from a navbar button or Cmd/Ctrl+K shortcut.
 * Searches the 35 000 French communes index server-side and lets the user
 * jump to any /ville/[slug] page.
 */
export default function SearchModal() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const t = useT();
  const track = useTrack();

  // Global keyboard: Cmd+K / Ctrl+K to open, Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Listen for the navbar button event
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("fx:open-search", onOpen);
    return () => window.removeEventListener("fx:open-search", onOpen);
  }, []);

  // Reset on close, focus on open
  useEffect(() => {
    if (!open) {
      setQuery("");
      setHits([]);
      setActiveIdx(0);
      return;
    }
    const id = setTimeout(() => inputRef.current?.focus(), 60);
    track("search_modal_open", {});
    return () => clearTimeout(id);
  }, [open, track]);

  // Debounced fetch
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ac = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-communes?q=${encodeURIComponent(q)}`, {
          signal: ac.signal,
        });
        const data = await res.json();
        setHits(data.results ?? []);
        setActiveIdx(0);
        setSearching(false);
      } catch {
        // aborted
      }
    }, 180);
    return () => {
      ac.abort();
      clearTimeout(id);
    };
  }, [query, open]);

  const goTo = useCallback(
    (hit: Hit) => {
      track("search_modal_select", { slug: hit.slug, insee: hit.insee });
      router.push(`/ville/${hit.slug}`);
      setOpen(false);
    },
    [router, track],
  );

  const onKeyInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && hits[activeIdx]) {
      e.preventDefault();
      goTo(hits[activeIdx]);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fx-search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t("fx.search.aria_dialog")}
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="fx-search-modal">
        <div className="fx-search-input-wrap">
          <span className="fx-search-icon" aria-hidden="true">
            ⌕
          </span>
          <input
            ref={inputRef}
            type="search"
            className="fx-search-input"
            placeholder={t("fx.search.placeholder")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyInput}
            aria-label={t("fx.search.aria_input")}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="fx-search-close"
            aria-label={t("fx.search.close")}
            onClick={() => setOpen(false)}
          >
            Esc
          </button>
        </div>

        <div className="fx-search-results">
          {query.trim().length < 2 ? (
            <div className="fx-search-hint">
              <p>{t("fx.search.hint_intro")}</p>
              <ul>
                <li>{t("fx.search.hint_examples")}</li>
                <li>{t("fx.search.hint_keyboard")}</li>
              </ul>
            </div>
          ) : searching && hits.length === 0 ? (
            <div className="fx-search-empty">{t("fx.search.searching")}</div>
          ) : hits.length === 0 ? (
            <div className="fx-search-empty">{t("fx.search.empty")}</div>
          ) : (
            <ul className="fx-search-list">
              {hits.map((h, i) => (
                <li key={h.insee}>
                  <button
                    type="button"
                    className={`fx-search-result ${i === activeIdx ? "is-active" : ""}`}
                    onClick={() => goTo(h)}
                    onMouseEnter={() => setActiveIdx(i)}
                  >
                    <span className="fx-search-result-name">{h.nom}</span>
                    <span className="fx-search-result-meta">
                      {h.dep_name} · {fmtInt(h.pop)} hab · INSEE {h.insee}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="fx-search-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> {t("fx.search.foot.nav")}
          </span>
          <span>
            <kbd>↵</kbd> {t("fx.search.foot.open")}
          </span>
          <span>
            <kbd>Esc</kbd> {t("fx.search.foot.close")}
          </span>
        </div>
      </div>
    </div>
  );
}
