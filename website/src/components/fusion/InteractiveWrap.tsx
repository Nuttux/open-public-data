"use client";

import type { ReactNode } from "react";
import { useT } from "@/lib/localeContext";

type Props = {
  children: ReactNode;
  label?: string;
  caveat?: string;
};

export default function InteractiveWrap({ children, label, caveat }: Props) {
  const t = useT();
  return (
    <div className="fx-interactive" role="group" aria-label={label ?? t("fx.interactive.badge")}>
      <div className="fx-interactive-badge">
        <span className="fx-interactive-icon" aria-hidden>🧮</span>
        <span className="fx-interactive-label">{label ?? t("fx.interactive.badge")}</span>
        <span className="fx-interactive-caveat">{caveat ?? t("fx.interactive.caveat")}</span>
      </div>
      <div className="fx-interactive-body">{children}</div>
    </div>
  );
}
