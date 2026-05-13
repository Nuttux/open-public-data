"use client";

import Link from "next/link";
import { useT } from "@/lib/localeContext";

type Props = {
  /** Anchor id inside /methode, e.g. "budget", "dette", "subventions". */
  anchor: string;
  /** Override the CTA label. */
  label?: string;
};

export default function MethodeInlineLink({ anchor, label }: Props) {
  const t = useT();
  return (
    <Link href={`/methode#${anchor}`} className="fx-meth-inline" prefetch={false}>
      <span className="fx-meth-inline-ico" aria-hidden>📐</span>
      <span className="fx-meth-inline-lbl">{t("fx.meth.inline.label")}</span>
      <span className="fx-meth-inline-target">{label ?? t("fx.meth.inline.target")}</span>
    </Link>
  );
}
