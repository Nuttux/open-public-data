"use client";

/**
 * THE ENTRY STRIP — one claim across the top of the map, and a way to close it.
 *
 * ── WHY IT REPLACED THE PLATE ─────────────────────────────────────────────
 * `CityEntry` was a card over the city doing five jobs: a headline, a
 * paragraph of instructions, a stats line, a trailer and a methodology link.
 * Five things stacked over the one thing a reader came for. Rewriting the
 * paragraph never fixed it, because the paragraph was not the problem.
 *
 * The entry has ONE job. The map can show a beautiful city; it cannot say
 * that none of it was drawn by hand — that every building, street and
 * decision came out of the city's own files. That claim is invisible on
 * screen, it is the whole difference between this and a rendering, and it is
 * the only thing the entry has to make.
 *
 * ── AND EVERYTHING ELSE BELONGS SOMEWHERE ELSE ────────────────────────────
 * · **How to use it** — the controls teach that. The year is 26 px with a
 *   play button beside it and a list that changes as it moves. A control
 *   that says what it is does not need a sentence underneath repeating it.
 * · **The numbers** — 166,166 buildings is PROOF, not invitation. Nobody
 *   enters because of it. They sit under the map beside the methodology
 *   link, where a reader deciding whether to TRUST the thing is looking:
 *   the same question asked twice.
 * · **The film** — a second door is fine, and it already has a home in the
 *   century strip. Offering it here would make this do two jobs again, and
 *   it is an interruption rather than an invitation to someone who is
 *   already inside the map and possibly already dragging it.
 *
 * So there is no primary button. Daniel, on the version that had one:
 * *"why is it start draggign the year i dont get it"* — and he was right: in
 * a plate the button lets you IN, and in a strip you are already in, so a
 * button telling you to drag is an instruction wearing a button's clothes.
 *
 * ── AND IT IS NOT COVERING A SLOW LOAD ────────────────────────────────────
 * MEASURED on a cold page: the city is on screen at **1,153 ms**, and 1,022
 * on a warm one. The plate was never hiding a blank canvas — it was covering
 * a city that had already drawn. That was the last argument for it.
 */

import { useEffect, useRef, type ReactNode } from "react";

const CSS = `
.fx-city-strip{position:absolute;left:0;top:0;right:var(--fx-city-ledger,0px);z-index:6;
  display:flex;align-items:flex-start;gap:20px;
  padding:14px clamp(16px,2.4vw,26px) 15px;
  background:color-mix(in srgb, var(--bg,#faf8f3) 94%, transparent);
  border-bottom:1px solid var(--ink,#161310);
  -webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
.fx-city-strip-kick{display:block;font-family:var(--f-mono,ui-monospace,monospace);
  font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--accent-warm,#8a6a3b);margin:0 0 3px}
.fx-city-strip h1{margin:0;font-family:var(--f-disp,Georgia,serif);font-weight:700;
  font-size:clamp(17px,2vw,21px);line-height:1.18;letter-spacing:-.02em;
  color:var(--ink,#161310)}
.fx-city-strip h1 em{font-style:italic}
.fx-city-strip p{margin:4px 0 0;font-size:12.5px;line-height:1.45;max-width:64ch;
  color:color-mix(in srgb, var(--ink,#161310) 72%, transparent)}
.fx-city-strip-x{margin-left:auto;flex:none;border:0;background:transparent;cursor:pointer;
  font-size:19px;line-height:1;padding:2px 4px;
  color:color-mix(in srgb, var(--ink,#161310) 55%, transparent)}
.fx-city-strip-x:hover{color:var(--ink,#161310)}
.fx-city-strip-x:focus-visible{outline:2px solid var(--ink,#161310);outline-offset:2px}
/* THE STRIP IS NOT A LID either: it takes the pointer only on itself, so a
   reader who grabs the city below gets the city. */
@media (max-width:640px){
  .fx-city-strip{padding:11px 14px 12px}
  .fx-city-strip p{display:none}
}
`;

/**
 * ── AND THE STRIP MEASURES ITSELF ─────────────────────────────────────────
 * The map's own controls sit at the top of the stage too, so they have to
 * step below this while it is up — `fusion.css` §AND THE MAP'S OWN CONTROLS
 * STEP DOWN. The first version guessed the height at 92 px. MEASURED on the
 * running page it is **113**, so the search box landed four pixels ABOVE the
 * strip's own bottom edge and sat on the border.
 *
 * A number typed in one file about the size of something rendered in another
 * is the same defect as the rest of this session's: an absolute where a
 * relative answer exists. The strip publishes its own height instead, and the
 * stylesheet reads it.
 */
export default function CityEntryStrip({
  kicker,
  title,
  claim,
  closeLabel,
  onClose,
}: {
  kicker: string;
  /** the page's <h1> — it stays in the server-rendered HTML */
  title: ReactNode;
  /** the one sentence: what makes the map different from a picture */
  claim: string;
  closeLabel: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const shell = el.closest(".fx-city-shell") as HTMLElement | null;
    if (!shell) return;
    const put = (): void =>
      shell.style.setProperty("--fx-city-strip-h", `${Math.round(el.offsetHeight)}px`);
    put();
    const ro = new ResizeObserver(put);
    ro.observe(el);
    return () => {
      ro.disconnect();
      shell.style.removeProperty("--fx-city-strip-h");
    };
  }, []);
  return (
    <div className="fx-city-strip" ref={ref}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div>
        <span className="fx-city-strip-kick">{kicker}</span>
        <h1>{title}</h1>
        <p>{claim}</p>
      </div>
      <button
        type="button"
        className="fx-city-strip-x"
        onClick={onClose}
        aria-label={closeLabel}
      >
        ×
      </button>
    </div>
  );
}
