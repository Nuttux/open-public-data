import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Button from "@/components/fusion/Button";
import SectionHead from "@/components/fusion/SectionHead";
import LocaleRefresh from "@/components/LocaleRefresh";
import { readLocale } from "@/lib/seo";
import fr from "@/i18n/fr";
import en from "@/i18n/en";

export default async function ContactClient() {
  const locale = await readLocale();
  // Same lookup as the context t(): active dictionary, FR fallback, then key.
  // (The context's city-label rewrite is a no-op outside /fr/city/*.)
  const dict = locale === "en" ? en : fr;
  const t = (key: string): string => dict[key] ?? fr[key] ?? key;

  return (
    <div className="theme-fusion">
      <LocaleRefresh />
      <Navbar />
      <main id="main-content" tabIndex={-1}>

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
              <a href="mailto:daniel@qipu.org">Daniel Shavit · daniel@qipu.org ↗</a>
            </div>
            <div>
              <div className="n">{t("fx.contact.c2.n")}</div>
              <h3>{t("fx.contact.c2.h")}</h3>
              <p>{t("fx.contact.c2.p")}</p>
              <a href="https://github.com/AbstractsMachine/france-open-data-pipeline/issues" target="_blank" rel="noopener noreferrer">
                github.com/…/issues ↗
              </a>
            </div>
            <div>
              <div className="n">{t("fx.contact.c3.n")}</div>
              <h3>{t("fx.contact.c3.h")}</h3>
              <p>{t("fx.contact.c3.p")}</p>
              <a href="mailto:daniel@qipu.org?subject=Presse">Daniel Shavit · daniel@qipu.org ↗</a>
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

      <section className="fx-section" id="signaler">
        <div className="fx-wrap">
          <SectionHead
            number="02"
            kind={t("fx.contact.s02.kind")}
            title={
              <>
                {t("fx.contact.s02.title.before")}
                <em>{t("fx.contact.s02.title.em")}</em>
                {t("fx.contact.s02.title.after")}
              </>
            }
            subtitle={t("fx.contact.s02.sub")}
          />
          <ol className="fx-steps">
            <li>
              <strong>{t("fx.contact.s02.step1.h")}</strong>
              <span>{t("fx.contact.s02.step1.p")}</span>
            </li>
            <li>
              <strong>{t("fx.contact.s02.step2.h")}</strong>
              <span>{t("fx.contact.s02.step2.p")}</span>
            </li>
            <li>
              <strong>{t("fx.contact.s02.step3.h")}</strong>
              <span>{t("fx.contact.s02.step3.p")}</span>
            </li>
          </ol>
          <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Button variant="primary" href="/signalement">
              {t("fx.contact.s02.btn.issue")}
            </Button>
            <Button href="/corrections">{t("fx.contact.s02.btn.history")}</Button>
          </div>
        </div>
      </section>

      </main>
      <Footer />
    </div>
  );
}
