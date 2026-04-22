"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  enableReplay,
  disableReplay,
  isReplayOptedIn,
  isOptedOutAnalytics,
} from "@/components/AnalyticsProvider";

/**
 * Small, opt-in-only footer widget that asks users if they want to let us
 * record their session (anonymously) to help debug the site. No banner, no
 * blocker — just a tiny button that transforms consent into a civic act.
 *
 * Visible only when analytics is not fully opted-out. Activation toggles
 * PostHog session recording live without reload.
 */
export default function ReplayOptIn() {
  const [mounted, setMounted] = useState(false);
  const [on, setOn] = useState(false);
  const [optedOut, setOptedOut] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setMounted(true);
    setOn(isReplayOptedIn());
    setOptedOut(isOptedOutAnalytics());
  }, []);

  if (!mounted || optedOut) return null;

  const toggle = () => {
    if (on) {
      disableReplay();
      setOn(false);
      setConfirming(false);
    } else {
      enableReplay();
      setOn(true);
      setConfirming(true);
      setTimeout(() => setConfirming(false), 2400);
    }
  };

  return (
    <div className="fx-replay-optin">
      <button
        type="button"
        className={on ? "fx-replay-btn is-on" : "fx-replay-btn"}
        onClick={toggle}
        aria-pressed={on}
      >
        <span className="fx-replay-dot" aria-hidden="true">
          {on ? "●" : "○"}
        </span>
        <span className="fx-replay-label">
          {on
            ? confirming
              ? "Merci — enregistrement activé"
              : "Enregistrement anonyme activé · désactiver"
            : "Aider ce site : autoriser l'enregistrement anonyme"}
        </span>
      </button>
      <Link href="/confidentialite" className="fx-replay-more">
        détails →
      </Link>
    </div>
  );
}
