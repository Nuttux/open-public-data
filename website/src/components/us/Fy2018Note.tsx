"use client";

import { useT } from "@/lib/localeContext";

/**
 * The ONE shared FY2018-break note (SF-BUILD-PLAN cross-cutting rule 1).
 *
 * Every SF page whose series kink at FY2018 links or renders this: the
 * PeopleSoft migration (July 2017) changed contract numbers, nonprofit
 * flags, program detail and vendor granularity all at once — readers who
 * don't know that will invent policy stories. Identical component path
 * across blocks (`components/us/Fy2018Note.tsx`); the orchestrator
 * reconciles the copy at merge if blocks diverge.
 */
export default function Fy2018Note({ id }: { id?: string }) {
  const t = useT();
  return (
    <div className="fx-callout" id={id ?? "fy2018-note"}>
      <b>{t("us.fy2018.title")}</b> {t("us.fy2018.body")}
    </div>
  );
}
