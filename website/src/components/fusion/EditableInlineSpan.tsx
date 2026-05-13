"use client";

/**
 * EditableInlineSpan — un span "éditable" inline NYT-style.
 *
 * Le pattern : au lieu d'un formulaire séparé, les paramètres du calcul sont
 * intégrés dans la phrase narrative du hero. Chaque paramètre apparaît comme
 * un span souligné en pointillé, cliquable, qui ouvre un picker (popover
 * desktop / sheet bottom mobile) pour modifier la valeur.
 *
 * 3 variantes exportées :
 *  - <EditableNumber>   — input numérique + presets optionnels
 *  - <EditableSelect>   — select natif stylisé (parts fiscales, etc.)
 *  - <EditableCommune>  — search + autocomplete (réutilise l'API
 *                         /api/search-communes)
 *
 * Tous les pickers :
 *  - role=button + aria-expanded sur le trigger
 *  - ESC ferme + focus revient au trigger
 *  - click outside ferme
 *  - mobile <600px : la popover devient une sheet bottom (CSS-only via
 *    media query sur `.db-editable-popover`).
 *
 * Pas de portal — le popover est un sibling du trigger, positionné en
 * absolute. C'est suffisant tant qu'on n'a pas de overflow:hidden parent
 * proche (ce n'est pas le cas dans le hero).
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ─── Trigger commun ────────────────────────────────────────────────────

type TriggerProps = {
  label: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  ariaLabel: string;
  popoverId: string;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

function Trigger({
  label,
  isOpen,
  onToggle,
  ariaLabel,
  popoverId,
  triggerRef,
}: TriggerProps) {
  return (
    <button
      ref={triggerRef}
      type="button"
      className="db-editable-span"
      aria-expanded={isOpen}
      aria-haspopup="dialog"
      aria-controls={popoverId}
      aria-label={ariaLabel}
      onClick={onToggle}
    >
      <span className="db-editable-span-label">{label}</span>
      {/* SVG chevron (12px, stroke 1.5) — remplace ▾ Unicode pour un alignement
          baseline propre et un gap maîtrisé avec le texte. */}
      <svg
        aria-hidden
        className="db-editable-span-chevron"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="3 5 6 8 9 5" />
      </svg>
    </button>
  );
}

// ─── Hook : gestion ouverture/fermeture (ESC + click outside) ──────────

function usePopover() {
  const [isOpen, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    // Restaure le focus sur le trigger pour l'accessibilité clavier.
    setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node | null;
      if (
        t &&
        !popoverRef.current?.contains(t) &&
        !triggerRef.current?.contains(t)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [isOpen, close]);

  return { isOpen, setOpen, close, triggerRef, popoverRef };
}

// ─── Variante 1 : EditableNumber ───────────────────────────────────────

type Preset = { label: string; value: number };

type EditableNumberProps = {
  value: number;
  onChange: (v: number) => void;
  /** Texte affiché dans le trigger (déjà formaté) */
  display: string;
  /** Suffixe affiché dans le picker au-dessus de l'input (ex. "€/mois") */
  suffix?: string;
  /** Min / max / step de l'input numérique */
  min?: number;
  max?: number;
  step?: number;
  /** Presets cliquables dans le picker (chips) */
  presets?: Preset[];
  /** Aria-label du trigger (ex. "Modifier le salaire mensuel") */
  ariaLabel: string;
  /** Label discret du picker (ex. "Salaire net mensuel") */
  pickerLabel?: string;
  /** Locale pour separer milliers (default fr-FR) */
  locale?: string;
};

export function EditableNumber({
  value,
  onChange,
  display,
  suffix,
  min = 0,
  max = 50_000,
  step = 50,
  presets,
  ariaLabel,
  pickerLabel,
  locale = "fr-FR",
}: EditableNumberProps) {
  const { isOpen, setOpen, close, triggerRef, popoverRef } = usePopover();
  const popoverId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  return (
    <span className="db-editable-wrap">
      <Trigger
        label={display}
        isOpen={isOpen}
        onToggle={() => setOpen((o) => !o)}
        ariaLabel={ariaLabel}
        popoverId={popoverId}
        triggerRef={triggerRef}
      />
      {isOpen && (
        <div
          id={popoverId}
          ref={popoverRef}
          role="dialog"
          aria-label={ariaLabel}
          className="db-editable-popover db-editable-popover-num"
        >
          {pickerLabel && (
            <p className="db-editable-popover-label">{pickerLabel}</p>
          )}
          <div className="db-editable-popover-input-row">
            <input
              ref={inputRef}
              type="number"
              className="db-editable-popover-input tnum"
              value={value || ""}
              min={min}
              max={max}
              step={step}
              inputMode="numeric"
              onChange={(e) => {
                const n = Number(e.target.value);
                onChange(Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0)));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  close();
                }
              }}
              aria-label={ariaLabel}
            />
            {suffix && (
              <span className="db-editable-popover-suffix">{suffix}</span>
            )}
          </div>
          <input
            type="range"
            min={min}
            max={Math.min(max, 10_000)}
            step={step}
            value={Math.min(value, Math.min(max, 10_000))}
            onChange={(e) => onChange(Number(e.target.value))}
            className="db-editable-popover-slider"
            aria-hidden
            tabIndex={-1}
          />
          {presets && presets.length > 0 && (
            <div className="db-editable-popover-presets">
              {presets.map((p) => {
                const active = p.value === value;
                return (
                  <button
                    key={p.label}
                    type="button"
                    className={`db-editable-popover-preset${
                      active ? " is-active" : ""
                    }`}
                    onClick={() => onChange(p.value)}
                  >
                    <span className="lbl">{p.label}</span>
                    <span className="val tnum">
                      {p.value.toLocaleString(locale)} €
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          <div className="db-editable-popover-foot">
            <button
              type="button"
              className="db-editable-popover-done"
              onClick={close}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </span>
  );
}

// ─── Variante 2 : EditableSelect ───────────────────────────────────────

type SelectOption<V extends string | number> = {
  value: V;
  label: string;
};

type EditableSelectProps<V extends string | number> = {
  value: V;
  onChange: (v: V) => void;
  options: SelectOption<V>[];
  /** Texte affiché dans le trigger */
  display: string;
  ariaLabel: string;
  pickerLabel?: string;
};

export function EditableSelect<V extends string | number>({
  value,
  onChange,
  options,
  display,
  ariaLabel,
  pickerLabel,
}: EditableSelectProps<V>) {
  const { isOpen, setOpen, close, triggerRef, popoverRef } = usePopover();
  const popoverId = useId();

  return (
    <span className="db-editable-wrap">
      <Trigger
        label={display}
        isOpen={isOpen}
        onToggle={() => setOpen((o) => !o)}
        ariaLabel={ariaLabel}
        popoverId={popoverId}
        triggerRef={triggerRef}
      />
      {isOpen && (
        <div
          id={popoverId}
          ref={popoverRef}
          role="dialog"
          aria-label={ariaLabel}
          className="db-editable-popover db-editable-popover-select"
        >
          {pickerLabel && (
            <p className="db-editable-popover-label">{pickerLabel}</p>
          )}
          <ul className="db-editable-popover-list" role="listbox">
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <li key={String(opt.value)} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`db-editable-popover-option${
                      active ? " is-active" : ""
                    }`}
                    onClick={() => {
                      onChange(opt.value);
                      close();
                    }}
                  >
                    {opt.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </span>
  );
}

// ─── Variante 3 : EditableCommune ──────────────────────────────────────

export type EditableCommuneHit = {
  insee: string;
  slug: string;
  nom: string;
  dep_name: string;
  pop: number;
};

type EditableCommuneProps = {
  /** Affichage dans le trigger (ex. "Paris") */
  display: string;
  ariaLabel: string;
  pickerLabel?: string;
  placeholder?: string;
  /** Callback déclenché quand l'utilisateur sélectionne une commune */
  onPick: (hit: EditableCommuneHit) => void;
  /** Texte de l'aide affiché en bas du picker */
  helpText?: string;
};

export function EditableCommune({
  display,
  ariaLabel,
  pickerLabel,
  placeholder,
  onPick,
  helpText,
}: EditableCommuneProps) {
  const { isOpen, setOpen, close, triggerRef, popoverRef } = usePopover();
  const popoverId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<EditableCommuneHit[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    } else {
      setQuery("");
      setHits([]);
    }
  }, [isOpen]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const id = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search-communes?q=${encodeURIComponent(q)}`,
          { signal: ac.signal },
        );
        const data = await res.json();
        if (!ac.signal.aborted) setHits(data.results ?? []);
      } catch {
        // aborted or network error
      }
    }, 180);
    return () => {
      ac.abort();
      clearTimeout(id);
    };
  }, [query]);

  return (
    <span className="db-editable-wrap">
      <Trigger
        label={display}
        isOpen={isOpen}
        onToggle={() => setOpen((o) => !o)}
        ariaLabel={ariaLabel}
        popoverId={popoverId}
        triggerRef={triggerRef}
      />
      {isOpen && (
        <div
          id={popoverId}
          ref={popoverRef}
          role="dialog"
          aria-label={ariaLabel}
          className="db-editable-popover db-editable-popover-commune"
        >
          {pickerLabel && (
            <p className="db-editable-popover-label">{pickerLabel}</p>
          )}
          <input
            ref={inputRef}
            type="search"
            className="db-editable-popover-search"
            placeholder={placeholder || ""}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            aria-label={ariaLabel}
          />
          {hits.length > 0 && (
            <ul className="db-editable-popover-hits" role="listbox">
              {hits.slice(0, 8).map((h) => (
                <li key={h.insee} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="db-editable-popover-hit"
                    onMouseDown={(e) => {
                      // mousedown évite que blur ferme avant le click
                      e.preventDefault();
                      onPick(h);
                      close();
                    }}
                  >
                    <span className="db-editable-popover-hit-name">
                      {h.nom}
                    </span>
                    <span className="db-editable-popover-hit-meta">
                      {h.dep_name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hits.length === 0 && query.trim().length >= 2 && (
            <p className="db-editable-popover-empty">…</p>
          )}
          {helpText && (
            <p className="db-editable-popover-help">{helpText}</p>
          )}
        </div>
      )}
    </span>
  );
}
