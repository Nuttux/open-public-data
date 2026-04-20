"use client";

/**
 * Language switcher — mocked. Clicking either option is a no-op until
 * real i18n routing lands on the fusion routes.
 */
export default function LangSwitcher() {
  return (
    <div className="fx-lang" aria-label="Langue">
      <span className="fx-lang-on">FR</span>
      <span className="fx-lang-off">EN</span>
    </div>
  );
}
