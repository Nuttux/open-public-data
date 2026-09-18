"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Le sommaire d'une page longue : une puce par section, son chiffre à côté,
 * la puce active suit le défilement et se ramène dans la barre. Né sur la
 * page commune (2026-09-16), partagé depuis que « Ma contribution » a besoin
 * du même geste : voir le plan sans faire défiler.
 */
export default function SectionChips({ items, label, onPick }: { items: { id: string; label: string; value?: string }[]; label: string; onPick?: (id: string) => void }) {
  const [active, setActive] = useState(items[0]?.id ?? "");
  const barRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const targets = items.map((i) => document.getElementById(i.id)).filter((el): el is HTMLElement => Boolean(el));
    if (!targets.length) return;
    // La section active = la dernière dont le titre est passé sous la barre.
    const pick = () => {
      let current = targets[0].id;
      for (const el of targets) {
        if (el.getBoundingClientRect().top <= 140) current = el.id;
      }
      setActive(current);
    };
    pick();
    window.addEventListener("scroll", pick, { passive: true });
    window.addEventListener("resize", pick);
    return () => {
      window.removeEventListener("scroll", pick);
      window.removeEventListener("resize", pick);
    };
  }, [items]);

  useEffect(() => {
    const bar = barRef.current;
    const chip = bar?.querySelector<HTMLAnchorElement>(`a[href="#${active}"]`);
    if (!bar || !chip) return;
    const cl = chip.offsetLeft;
    const cr = cl + chip.offsetWidth;
    if (cl < bar.scrollLeft + 8) bar.scrollTo({ left: Math.max(0, cl - 16), behavior: "smooth" });
    else if (cr > bar.scrollLeft + bar.clientWidth - 8) bar.scrollTo({ left: cr - bar.clientWidth + 16, behavior: "smooth" });
  }, [active]);

  return (
    <nav className="fx-pv-chips" aria-label={label} ref={barRef}>
      {items.map((s) => (
        <a key={s.id} href={`#${s.id}`} className={s.id === active ? "is-active" : ""} aria-current={s.id === active ? "location" : undefined} onClick={() => onPick?.(s.id)}>
          {s.label}{s.value ? <b className="tnum">{s.value}</b> : null}
        </a>
      ))}
    </nav>
  );
}
