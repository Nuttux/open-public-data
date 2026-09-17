"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "@/lib/navigation";
import { useLocale, useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";

type Hit = { slug: string; nome: string; uf: string; pop: number | null };

/**
 * The field of the Brazil hub (2026-09-18) : type a município, pick it, land
 * on its page. Two letters call /api/search-municipios ; arrows, Enter and
 * Escape work ; « belem pa » narrows to a state. The CommunePicker's markup
 * (fx-picker), so it looks like the commune comparator's field.
 */
export default function MunicipioSearch({ placeholder, label, hrefFor }: { placeholder: string; label: string; /** Where a pick leads ; the município's page by default. */ hrefFor?: (slug: string) => string }) {
  const t = useT();
  const { locale } = useLocale();
  const router = useRouter();
  const track = useTrack();
  const int = new Intl.NumberFormat(locale === "en" ? "en-US" : "pt-BR", { maximumFractionDigits: 0 });
  const id = useId();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [total, setTotal] = useState(0);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const typed = q.trim();
    if (typed.length < 2) { setHits([]); setTotal(0); return; }
    const ctrl = new AbortController();
    const h = setTimeout(() => {
      fetch(`/api/search-municipios?q=${encodeURIComponent(typed)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d: { results: Hit[]; total?: number }) => { setHits(d.results ?? []); setTotal(d.total ?? 0); setActive(0); })
        .catch(() => {});
    }, 120);
    return () => { clearTimeout(h); ctrl.abort(); };
  }, [q]);

  const go = (h: Hit) => {
    track("search_result_click", { page: "brasil", entity_name: h.nome, q: q.trim() });
    router.push(hrefFor ? hrefFor(h.slug) : `/brasil/${h.slug}`);
  };
  const listId = `${id}-list`;
  const show = open && q.trim().length >= 2;

  return (
    <div className="fx-picker">
      <input
        id={id}
        type="search"
        autoComplete="off"
        placeholder={placeholder}
        aria-label={label}
        role="combobox"
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        value={q}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(hits.length - 1, 0))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { if (show && hits[active]) { e.preventDefault(); go(hits[active]); } }
          else if (e.key === "Escape") { setOpen(false); setQ(""); }
        }}
      />
      {show ? (
        <div className="fx-picker-pop">
          <p className="fx-picker-h" aria-live="polite">{hits.length === 0 ? t("br.hub.find_none") : total > hits.length ? `${int.format(total)} ${t("br.hub.find_n")}` : `${hits.length} ${t("br.hub.find_n")}`}</p>
          <ul id={listId} role="listbox">
            {hits.map((h, i) => (
              <li key={h.slug} id={`${id}-${i}`} role="option" aria-selected={i === active} className={i === active ? "on" : ""} onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => go(h)}>
                <span className="nom">{h.nome} ({h.uf})</span>
                <span className="meta">{h.pop ? `${int.format(h.pop)} ${t("br.hub.hab")}` : ""}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
