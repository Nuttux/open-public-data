"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { ProjetPhotoResolved } from "@/lib/fusion-data";
import ProjetThumb from "./ProjetThumb";
import { useFmtEur } from "@/lib/use-fmt";

export type TopProjetGridItem = {
  id: string;
  name: string;
  amount: number;
  photo: ProjetPhotoResolved;
};

/**
 * The ranked photo-card grid of top investment projects (`fx-arr-top-grid`).
 * Markup extracted verbatim from ArrondissementFiche / ChapitreFiche
 * (identical modulo the bottom label line, exposed as `detail`).
 */
export default function TopProjetsGrid<T extends TopProjetGridItem>({
  items,
  href,
  detail,
}: {
  items: T[];
  /** Builds the fiche link of a project card. */
  href: (item: T) => string;
  /** Bottom label line of a card (e.g. "12ᵉ arr." or the chapitre label). */
  detail: (item: T) => ReactNode;
}) {
  const fmtEur = useFmtEur();

  return (
    <div className="fx-arr-top-grid">
      {items.map((p, i) => {
        const f = fmtEur(p.amount);
        return (
          <Link
            key={p.id}
            href={href(p)}
            scroll={false}
            className="fx-arr-top-item"
          >
            <div className="fx-arr-top-thumb">
              <ProjetThumb photo={p.photo.photo} generic={p.photo.generic} typologie={p.photo.typologie} aspectRatio="4 / 3" fallbackLabel={p.name} />
            </div>
            <div className="fx-arr-top-meta">
              <div className="fx-arr-top-rank">{String(i + 1).padStart(2, "0")}</div>
              <div className="fx-arr-top-name">{p.name.slice(0, 80)}</div>
              <div className="fx-arr-top-amount">{f.v} <span className="u">{f.u}</span></div>
              <div className="fx-arr-top-chap">{detail(p)}</div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
