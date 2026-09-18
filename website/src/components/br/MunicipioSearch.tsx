"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "@/lib/navigation";
import { useLocale, useT } from "@/lib/localeContext";
import { fill } from "@/lib/fmt";
import { useTrack } from "@/lib/analyticsContext";
import { searchQueryProps } from "@/lib/analytics-helpers";

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

  // Les plus peuplés, chargés une fois : cliquer le champ ouvrait le vide, et
  // on ne pouvait pas deviner qu'il fallait taper deux lettres (2026-09-18).
  const [top, setTop] = useState<Hit[]>([]);
  const [nbTotal, setNbTotal] = useState(0);
  useEffect(() => {
    fetch("/api/search-municipios?top=1")
      .then((r) => r.json())
      .then((d: { results: Hit[]; total?: number }) => { setTop(d.results ?? []); setNbTotal(d.total ?? 0); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const typed = q.trim();
    if (typed.length < 2) { setHits([]); setTotal(0); return; }
    const ctrl = new AbortController();
    const h = setTimeout(() => {
      fetch(`/api/search-municipios?q=${encodeURIComponent(typed)}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then(async (d: { results: Hit[]; total?: number }) => {
          const res = d.results ?? [];
          setHits(res); setTotal(d.total ?? 0); setActive(0);
          // Ce que les gens cherchent, et surtout ce qu'ils cherchent en vain :
          // results_count à zéro est le signal qui manquait (2026-09-18).
          track("search_query", await searchQueryProps(typed, d.total ?? res.length, "br_municipios"));
        })
        .catch(() => {});
    }, 120);
    return () => { clearTimeout(h); ctrl.abort(); };
  }, [q, track]);

  const go = (h: Hit) => {
    // Le texte tapé ne part pas en clair : la fenêtre française envoie une
    // empreinte, ce champ envoyait la frappe (2026-09-18). Même grammaire ici.
    track("search_result_click", {
      corpus: "br_municipios",
      entity_name: h.nome,
      q_len: q.trim().length,
      rank: lignes.indexOf(h) + 1,
      top: !tape,
    });
    router.push(hrefFor ? hrefFor(h.slug) : `/brasil/${h.slug}`);
  };
  const listId = `${id}-list`;
  const tape = q.trim().length >= 2;
  const show = open && (tape || top.length > 0);
  const lignes = tape ? hits : top;
  const entete = tape
    ? (hits.length === 0 ? t("br.hub.find_none") : `${int.format(total > hits.length ? total : hits.length)} ${t("br.hub.find_n")}`)
    : fill(t("br.hub.find_top"), { n: int.format(nbTotal) });

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
        onFocus={() => {
          setOpen(true);
          track("search_open", { corpus: "br_municipios", surface: "champ" });
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, Math.max(hits.length - 1, 0))); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { if (show && lignes[active]) { e.preventDefault(); go(lignes[active]); } }
          else if (e.key === "Escape") { setOpen(false); setQ(""); }
        }}
      />
      {show ? (
        <div className="fx-picker-pop">
          <p className="fx-picker-h" aria-live="polite">{entete}</p>
          <ul id={listId} role="listbox">
            {lignes.map((h, i) => (
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
