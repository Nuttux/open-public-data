"use client";

import { useState, type FormEvent } from "react";
import Link from "@/components/LocalizedLink";
import { useLocale, useT } from "@/lib/localeContext";
import { useTrack } from "@/lib/analyticsContext";
import { fill } from "@/lib/fmt";

/**
 * « Prévenez-moi quand de nouvelles données arrivent » — one line at the foot
 * of a section page (2026-09-16). The site had nothing that brings a reader
 * back between two publications of the City; this is the cheapest thing that
 * does. One field, one button, one sentence for each outcome.
 *
 * Shown only where NEXT_PUBLIC_DATA_ALERTS is "1": the list needs a Resend
 * audience and a verified sender before the block can promise anything.
 */
export const DATA_ALERTS_ON = process.env.NEXT_PUBLIC_DATA_ALERTS === "1";

type Status = "idle" | "submitting" | "sent" | "dev" | "error";

export default function DataAlert({ section, nextData }: { section: string; /** What the reader is waiting for, e.g. « les comptes 2025 ». */ nextData?: string }) {
  const t = useT();
  const { locale } = useLocale();
  const track = useTrack();
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [errorKey, setErrorKey] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setErrorKey("");
    track("alert_submit", { section });
    try {
      const res = await fetch("/api/abonnement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, lang: locale, section, page_url: typeof window !== "undefined" ? window.location.pathname : "", website }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; dev_mode?: boolean };
      if (res.ok && data.ok) {
        setStatus(data.dev_mode ? "dev" : "sent");
        track("alert_sent", { section, dev_mode: !!data.dev_mode });
      } else {
        setStatus("error");
        setErrorKey(data.error ?? "unknown");
        track("alert_error", { section, error: data.error ?? "unknown" });
      }
    } catch {
      setStatus("error");
      setErrorKey("network");
      track("alert_error", { section, error: "network" });
    }
  };

  const lead = nextData ? fill(t("fx.alert.lead_next"), { next: nextData }) : t("fx.alert.lead");

  if (status === "sent" || status === "dev") {
    return (
      <div className="fx-alert" data-block="alert" role="status">
        <p className="fx-alert-done">{t(status === "dev" ? "fx.alert.dev" : "fx.alert.sent")}</p>
      </div>
    );
  }

  return (
    <form className="fx-alert" data-block="alert" onSubmit={submit} noValidate>
      <label className="fx-alert-lead" htmlFor={`alert-email-${section}`}>{lead}</label>
      <div className="fx-alert-row">
        <input
          id={`alert-email-${section}`}
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          required
          placeholder={t("fx.alert.placeholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "submitting"}
        />
        <button type="submit" className="fx-btn fx-btn-primary" disabled={status === "submitting"}>
          {status === "submitting" ? t("fx.alert.sending") : t("fx.alert.cta")}
        </button>
      </div>
      <label className="fx-honeypot" aria-hidden="true">
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>
      <p className="fx-alert-note">
        {status === "error"
          ? errorKey === "invalid_email" ? t("fx.alert.err.email") : errorKey === "not_configured" ? t("fx.alert.err.unavailable") : t("fx.alert.err.generic")
          : <>{t("fx.alert.note")} <Link href="/confidentialite#alertes">{t("fx.alert.note_link")}</Link></>}
      </p>
    </form>
  );
}
