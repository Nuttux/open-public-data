"use client";

import { useState } from "react";
import { useTrack } from "@/lib/analyticsContext";

/**
 * « Partager ce chiffre » / « Partager ce graphe » — the share button of a
 * section's number or scene. Native share sheet where the browser has one
 * (phones), the clipboard elsewhere. `object` names what is shared
 * (hero, competition…) so share_click can be read object by object; `anchor`
 * makes the shared address open on that object.
 */
export default function ShareButton({
  label,
  done,
  title,
  object,
  anchor,
}: {
  label: string;
  done: string;
  title: string;
  object: string;
  anchor?: string;
}) {
  const [ok, setOk] = useState(false);
  const track = useTrack();
  const share = async () => {
    if (typeof window === "undefined") return;
    const url = anchor ? `${window.location.origin}${window.location.pathname}${window.location.search}#${anchor}` : window.location.href;
    let method = "none";
    try {
      const nav: Navigator | null = typeof navigator !== "undefined" ? navigator : null;
      if (nav && typeof nav.share === "function") {
        method = "native";
        await nav.share({ title, url });
      } else if (nav && nav.clipboard) {
        method = "copy";
        await nav.clipboard.writeText(url);
        setOk(true);
        setTimeout(() => setOk(false), 2000);
      }
    } catch {
      /* cancelled */
    }
    track("share_click", { method, entity_type: "section", object, url });
  };
  return (
    <button type="button" className="fx-sec-share" onClick={share} aria-live="polite">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
        <path d="M16 6l-4-4-4 4" />
        <path d="M12 2v13" />
      </svg>
      {ok ? done : label}
    </button>
  );
}
