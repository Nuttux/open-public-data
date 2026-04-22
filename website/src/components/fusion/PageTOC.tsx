"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTrack } from "@/lib/analyticsContext";

export type TOCItem = {
  id: string;
  label: string;
};

type Props = {
  items: TOCItem[];
  /** Offset de scroll pour compenser une navbar sticky au-dessus. */
  scrollOffset?: number;
};

/**
 * Barre de navigation interne sticky — visible uniquement en mobile.
 * Permet de sauter aux grandes sections de la page sans scroller 10 écrans.
 * Highlight auto de la section courante via IntersectionObserver.
 */
export default function PageTOC({ items, scrollOffset = 96 }: Props) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);
  const track = useTrack();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Prend la section la plus proche du haut qui est intersectée
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      {
        rootMargin: `-${scrollOffset + 20}px 0px -70% 0px`,
        threshold: 0,
      },
    );
    for (const it of items) {
      const el = document.getElementById(it.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items, scrollOffset]);

  const onClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const el = document.getElementById(id);
    if (!el) return;
    track("toc_click", { section_id: id, page: pathname });
    const y = el.getBoundingClientRect().top + window.scrollY - scrollOffset;
    window.scrollTo({ top: y, behavior: "smooth" });
    setActiveId(id);
  };

  return (
    <nav className="fx-page-toc" aria-label="Navigation dans la page">
      <ul>
        {items.map((it) => (
          <li key={it.id}>
            <a
              href={`#${it.id}`}
              onClick={(e) => onClick(e, it.id)}
              className={activeId === it.id ? "is-active" : ""}
            >
              {it.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
