"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useLocale, useT } from "@/lib/localeContext";
import { nomDistinct } from "@/lib/nom-commune";

export type CommuneChoice = { slug: string; nom: string; pop: number; dep_name?: string };

/**
 * Choisir une commune en tapant son nom — n'importe laquelle des 34 900, pas
 * seulement celles du département que proposait l'ancienne liste déroulante.
 *
 * Le champ reste VIDE, avec « Comparer avec une autre commune de France… » :
 * pré-rempli du nom de la commune comparée, il se lisait comme une valeur figée
 * et personne ne devinait qu'on pouvait y taper (retour du 13 septembre). La
 * commune comparée est dite au-dessus, par le parent.
 *
 * Vide, le champ propose des communes de taille proche. Dès deux
 * lettres, il interroge /api/search-communes (sans accents, code INSEE
 * compris). Clavier : flèches, Entrée, Échap. Le choix est rendu au parent,
 * qui décide où aller.
 */
export default function CommunePicker({
  current,
  exclude,
  suggestions,
  onPick,
  label,
  suggestHeading,
}: {
  current: CommuneChoice | null;
  /** La commune de la page : on ne la compare pas à elle-même. */
  exclude: string;
  suggestions: CommuneChoice[];
  onPick: (c: CommuneChoice) => void;
  label: string;
  /** The heading over `suggestions` when the field is empty ; the commune page's
   *  « Même département, taille proche » by default. */
  suggestHeading?: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const int = new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 0 });
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<CommuneChoice[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const typed = q.trim();
  const searching = typed.length >= 2;

  useEffect(() => {
    if (!searching) {
      setResults(null);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`/api/search-communes?q=${encodeURIComponent(typed)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d: { results: CommuneChoice[] }) => {
          // La commune déjà comparée RESTE dans les résultats (marquée) : la
          // retirer faisait disparaître Saint-Denis (Seine-Saint-Denis) quand
          // c'était elle, et l'autre Saint-Denis passait pour la seule.
          setResults(d.results.filter((c) => c.slug !== exclude).slice(0, 8));
          setActive(0);
          setLoading(false);
        })
        .catch((e: Error) => {
          if (e.name === "AbortError") return;
          setResults([]);
          setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [typed, searching, exclude]);

  const list = searching ? results ?? [] : suggestions;
  const listId = `${id}-list`;

  const pick = (c: CommuneChoice) => {
    setOpen(false);
    setQ("");
    inputRef.current?.blur();
    onPick(c);
  };

  const heading = searching
    ? loading
      ? t("fx.pick.loading")
      : list.length
        ? t("fx.pick.results")
        : t("fx.pick.empty")
    : suggestHeading ?? t("fx.pick.suggest");

  return (
    <div className={`fx-picker${open ? " open" : ""}`}>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && list[active] ? `${id}-${active}` : undefined}
        value={q}
        placeholder={t("fx.pick.placeholder")}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        onFocus={() => setOpen(true)}
        // Le clic sur une proposition passe avant la fermeture.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((a) => Math.min(a + 1, Math.max(list.length - 1, 0)));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            if (open && list[active]) {
              e.preventDefault();
              pick(list[active]);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
            setQ("");
          }
        }}
      />
      {open ? (
        <div className="fx-picker-pop">
          <p className="fx-picker-h" aria-live="polite">{heading}</p>
          <ul id={listId} role="listbox">
            {list.map((c, i) => (
              <li
                key={c.slug}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? "on" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(c)}
              >
                <span className="nom">{nomDistinct(c)}</span>
                <span className="meta">{[
                  nomDistinct(c) === c.nom ? c.dep_name : null,
                  `${int.format(c.pop)} ${t("fx.natbud.hab")}`,
                  c.slug === current?.slug ? t("fx.pick.actuelle") : null,
                ].filter(Boolean).join(" · ")}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
