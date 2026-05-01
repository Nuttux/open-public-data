"use client";

import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Button from "@/components/fusion/Button";
import SectionHead from "@/components/fusion/SectionHead";
import { useT } from "@/lib/localeContext";

export default function ContactClient() {
  const t = useT();

  return (
    <div className="theme-fusion">
      <Navbar />

      <section className="fx-page-header">
        <div className="fx-wrap">
          <div className="fx-page-kicker">{t("fx.contact.kicker")}</div>
          <h1 className="fx-page-title">
            {t("fx.contact.title.before")}<br />
            {t("fx.contact.title.em_prefix")}<em>{t("fx.contact.title.em")}</em>{t("fx.contact.title.after")}
          </h1>
          <p className="fx-page-lede">{t("fx.contact.lede")}</p>
        </div>
      </section>

      <section className="fx-section">
        <div className="fx-wrap">
          <SectionHead
            number="01"
            kind={t("fx.contact.s01.kind")}
            title={
              <>
                {t("fx.contact.s01.title.before")}
                <em>{t("fx.contact.s01.title.em")}</em>
              </>
            }
            subtitle={t("fx.contact.s01.sub")}
          />
          <div className="fx-sources">
            <div>
              <div className="n">{t("fx.contact.c1.n")}</div>
              <h3>{t("fx.contact.c1.h")}</h3>
              <p>{t("fx.contact.c1.p")}</p>
              <a href="mailto:contact@franceopendata.org">contact@franceopendata.org ↗</a>
            </div>
            <div>
              <div className="n">{t("fx.contact.c2.n")}</div>
              <h3>{t("fx.contact.c2.h")}</h3>
              <p>{t("fx.contact.c2.p")}</p>
              <a href="https://github.com/Nuttux/open-public-data/issues" target="_blank" rel="noopener noreferrer">
                github.com/…/issues ↗
              </a>
            </div>
            <div>
              <div className="n">{t("fx.contact.c3.n")}</div>
              <h3>{t("fx.contact.c3.h")}</h3>
              <p>{t("fx.contact.c3.p")}</p>
              <a href="mailto:presse@franceopendata.org">presse@franceopendata.org ↗</a>
            </div>
          </div>

          <div className="fx-note" style={{ marginTop: 32 }}>
            {t("fx.contact.note")}
          </div>

          <div style={{ marginTop: 32, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" href="/analyses">{t("fx.contact.btn.analyses")}</Button>
            <Button href="/">{t("fx.contact.btn.home")}</Button>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
