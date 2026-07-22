"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Button from "@/components/fusion/Button";
import SectionHead from "@/components/fusion/SectionHead";
import { useT, useLocale } from "@/lib/localeContext";

type Status = "idle" | "submitting" | "success" | "error";

export default function SignalementClient() {
  const t = useT();
  const { locale } = useLocale();
  const isFr = locale === "fr";
  const search = useSearchParams();

  const [category, setCategory] = useState<string>("erreur_chiffre");
  const [pageUrl, setPageUrl] = useState("");
  const [element, setElement] = useState("");
  const [sourceContradictoire, setSourceContradictoire] = useState("");
  const [description, setDescription] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [errorKey, setErrorKey] = useState<string>("");

  // Pré-remplir l'URL si on arrive depuis un bouton "Signaler" (DataProvenance modal
  // notamment) : `?page=/fr/city/paris/budget`.
  useEffect(() => {
    const fromQuery = search.get("page");
    if (fromQuery) setPageUrl(fromQuery);
    const fromCat = search.get("cat");
    if (fromCat) setCategory(fromCat);
  }, [search]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setErrorKey("");
    try {
      const res = await fetch("/api/signalement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          page_url: pageUrl,
          element,
          source_contradictoire: sourceContradictoire,
          description,
          contact_email: contactEmail,
          website, // honeypot
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        setStatus("success");
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
    if (errorKey === "description_too_short") return t("fx.signalement.err.desc_short");
    if (errorKey === "invalid_email") return t("fx.signalement.err.email");
    if (errorKey === "send_failed") return t("fx.signalement.err.send");
    return t("fx.signalement.err.generic");
  })();

  return (
    <div className="theme-fusion">
      <Navbar />
      <main id="main-content" tabIndex={-1}>
        <section className="fx-page-header">
          <div className="fx-wrap">
            <div className="fx-page-kicker">{t("fx.signalement.kicker")}</div>
            <h1 className="fx-page-title">
              {t("fx.signalement.title.before")}
              <em>{t("fx.signalement.title.em")}</em>
              {t("fx.signalement.title.after")}
            </h1>
            <p className="fx-page-lede">{t("fx.signalement.lede")}</p>
          </div>
        </section>

        <section className="fx-section">
          <div className="fx-wrap" style={{ maxWidth: 720 }}>
            <SectionHead
              number="01"
              kind={t("fx.signalement.form.kind")}
              title={
                <>
                  {t("fx.signalement.form.title.before")}
                  <em>{t("fx.signalement.form.title.em")}</em>
                </>
              }
              subtitle={t("fx.signalement.form.sub")}
            />

            {status === "success" ? (
              <div className="fx-signalement-success" role="status">
                <h3>{t("fx.signalement.success.title")}</h3>
                <p>{t("fx.signalement.success.body")}</p>
                <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Button href="/corrections">{t("fx.signalement.success.btn.history")}</Button>
                  <Button href="/">{t("fx.signalement.success.btn.home")}</Button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="fx-signalement-form" noValidate>
                <label className="fx-field">
                  <span className="fx-field-label">{t("fx.signalement.f.category")}</span>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required
                    aria-label={t("fx.signalement.f.category")}
                  >
                    <option value="erreur_chiffre">{t("fx.signalement.cat.chiffre")}</option>
                    <option value="erreur_methodologie">{t("fx.signalement.cat.methodo")}</option>
                    <option value="lien_casse">{t("fx.signalement.cat.lien")}</option>
                    <option value="autre">{t("fx.signalement.cat.autre")}</option>
                  </select>
                </label>

                <label className="fx-field">
                  <span className="fx-field-label">
                    {t("fx.signalement.f.page")}
                    <span className="fx-field-opt"> · {t("fx.signalement.optional")}</span>
                  </span>
                  <input
                    type="text"
                    value={pageUrl}
                    onChange={(e) => setPageUrl(e.target.value)}
                    placeholder={isFr ? "/fr/city/paris/budget" : "/fr/city/paris/budget"}
                  />
                </label>

                <label className="fx-field">
                  <span className="fx-field-label">
                    {t("fx.signalement.f.element")}
                    <span className="fx-field-opt"> · {t("fx.signalement.optional")}</span>
                  </span>
                  <input
                    type="text"
                    value={element}
                    onChange={(e) => setElement(e.target.value)}
                    placeholder={isFr ? "ex: 11,72 Md€ dans le hero" : "e.g. 11.72 Bn€ in the hero"}
                  />
                </label>

                <label className="fx-field">
                  <span className="fx-field-label">
                    {t("fx.signalement.f.source")}
                    <span className="fx-field-opt"> · {t("fx.signalement.optional")}</span>
                  </span>
                  <input
                    type="text"
                    value={sourceContradictoire}
                    onChange={(e) => setSourceContradictoire(e.target.value)}
                    placeholder={isFr ? "URL d'un dataset ou document officiel" : "URL of an official dataset or document"}
                  />
                </label>

                <label className="fx-field">
                  <span className="fx-field-label">{t("fx.signalement.f.description")}</span>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={6}
                    required
                    minLength={10}
                    maxLength={5000}
                    placeholder={t("fx.signalement.f.description.placeholder")}
                  />
                </label>

                <label className="fx-field">
                  <span className="fx-field-label">
                    {t("fx.signalement.f.email")}
                    <span className="fx-field-opt"> · {t("fx.signalement.optional")}</span>
                  </span>
                  <input
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="vous@exemple.fr"
                  />
                  <span className="fx-field-hint">{t("fx.signalement.f.email.hint")}</span>
                </label>

                {/* Honeypot — caché aux humains, capté par les bots. Si rempli, l'API drop. */}
                <label className="fx-honeypot" aria-hidden="true">
                  Website
                  <input
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </label>

                {status === "error" && (
                  <div className="fx-signalement-error" role="alert">
                    {errorMsg}
                  </div>
                )}

                <div style={{ marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <Button variant="primary" type="submit" disabled={status === "submitting"}>
                    {status === "submitting" ? t("fx.signalement.btn.sending") : t("fx.signalement.btn.send")}
                  </Button>
                  <a href={`mailto:daniel@qipu.org?subject=${encodeURIComponent("[Signalement] ")}`} className="fx-signalement-fallback">
                    {t("fx.signalement.fallback")}
                  </a>
                </div>

                <p className="fx-signalement-note">{t("fx.signalement.note")}</p>
              </form>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
