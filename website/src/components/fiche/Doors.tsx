"use client";

import type { ReactNode } from "react";
import Link from "@/components/LocalizedLink";

/**
 * A door: a link to another section or page, with what it holds in one line
 * and, when it has one, its number. Doors are what « Voir aussi » and the
 * hub are made of. `fx-door` is a link role in analytics (link_click.role).
 */
export function Door({ href, title, sub, value, unit, hard }: {
  href: string;
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  unit?: ReactNode;
  /** A full page load (explorers, hubs) rather than a drawer. */
  hard?: boolean;
}) {
  const body = (
    <>
      <span className="t">{title}</span>
      {sub ? <span className="s">{sub}</span> : null}
      {value !== undefined && value !== null ? (
        <span className="v tnum">
          {value}
          {unit ? <small>{unit}</small> : null}
        </span>
      ) : null}
    </>
  );
  return hard ? (
    <Link href={href} className="fx-door">{body}</Link>
  ) : (
    <Link href={href} scroll={false} className="fx-door">{body}</Link>
  );
}

/** The section that follows, with its number: the way out of a page that
 *  is not the footer. */
export function NextDoor({ href, kicker, title, sub, value, unit }: { href: string; kicker: string; title: ReactNode; sub?: ReactNode; value?: ReactNode; unit?: ReactNode }) {
  return (
    <Link href={href} className="fx-next" data-section="next">
      <span className="ck">{kicker}</span>
      <span className="ct">{title}</span>
      {sub ? <span className="cc">{sub}</span> : null}
      {value !== undefined && value !== null ? (
        <span className="cv tnum">
          {value}
          {unit ? <small>{unit}</small> : null}
        </span>
      ) : null}
    </Link>
  );
}
