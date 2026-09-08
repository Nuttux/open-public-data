"use client";

import { useState, type FormEvent } from "react";
import Button from "@/components/fusion/Button";
import { useT } from "@/lib/localeContext";

type Status = "idle" | "submitting" | "success" | "dev" | "error";

const TOPICS = ["question", "correction", "presse", "partenariat", "autre"] as const;

/**
 * Formulaire de contact : arrive dans la boîte via /api/contact (Resend), avec
 * l'adresse du visiteur en répondre-à. Le mailto reste sous le bouton comme
 * plan B. Trois issues, toutes honnêtes : envoyé / reçu en mode test (non
 * envoyé) / échec — jamais un « merci » sur un message perdu.
 */
export default function ContactForm() {
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [topic, setTopic] = useState<string>("question");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [errorKey, setErrorKey] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setErrorKey("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          topic,
          message,
          page_url: typeof window !== "undefined" ? window.location.pathname : "",
          website,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; dev_mode?: boolean };
      if (res.ok && data.ok) {
        setStatus(data.dev_mode ? "dev" : "success");
      } else {
        setStatus("error");
        setErrorKey(data.error ?? "unknown");
      }
    } catch {
      setStatus("error");
      setErrorKey("network");
    }
  };

  const errorMsg = (() => {
    if (status !== "error") return "";
    if (errorKey === "invalid_email") return t("fx.contactform.err.email");
    if (errorKey === "message_too_short") return t("fx.contactform.err.short");
    if (errorKey === "mail_not_configured") return t("fx.contactform.err.unavailable");
    if (errorKey === "send_failed") return t("fx.contactform.err.send");
    return t("fx.contactform.err.generic");
  })();

  if (status === "success" || status === "dev") {
    return (
      <div className="fx-signalement-success" role="status">
        <h3>{t(status === "dev" ? "fx.contactform.devmode.title" : "fx.contactform.success.title")}</h3>
        <p>{t(status === "dev" ? "fx.contactform.devmode.body" : "fx.contactform.success.body")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="fx-signalement-form" noValidate>
      <label className="fx-field">
        <span className="fx-field-label">
          {t("fx.contactform.f.name")}
          <span className="fx-field-opt"> · {t("fx.contactform.optional")}</span>
        </span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
      </label>

      <label className="fx-field">
        <span className="fx-field-label">{t("fx.contactform.f.email")}</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="vous@exemple.fr"
        />
        <span className="fx-field-hint">{t("fx.contactform.f.email.hint")}</span>
      </label>

      <label className="fx-field">
        <span className="fx-field-label">{t("fx.contactform.f.topic")}</span>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label={t("fx.contactform.f.topic")}>
          {TOPICS.map((k) => (
            <option key={k} value={k}>{t(`fx.contactform.topic.${k}`)}</option>
          ))}
        </select>
      </label>

      <label className="fx-field">
        <span className="fx-field-label">{t("fx.contactform.f.message")}</span>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={7}
          required
          minLength={10}
          maxLength={5000}
          placeholder={t("fx.contactform.f.message.placeholder")}
        />
      </label>

      {/* Honeypot — caché aux humains, capté par les bots. Si rempli, l'API drop. */}
      <label className="fx-honeypot" aria-hidden="true">
        Website
        <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </label>

      {status === "error" && (
        <div className="fx-signalement-error" role="alert">{errorMsg}</div>
      )}

      <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Button variant="primary" type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? t("fx.contactform.btn.sending") : t("fx.contactform.btn.send")}
        </Button>
        <a href="mailto:daniel@qipu.org" className="fx-signalement-fallback">{t("fx.contactform.fallback")}</a>
      </div>
    </form>
  );
}
