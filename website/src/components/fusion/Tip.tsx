import type { ReactNode } from "react";

type Props = {
  /** Hover/focus tooltip text. */
  label: string;
  children: ReactNode;
  className?: string;
};

/**
 * Inline tooltip matching the mockup's `.tip` pattern : dotted underline on
 * the term, dark tooltip bubble shown on hover/focus. Pure CSS, keyboard-reachable
 * via `tabindex={0}`. No JS state needed.
 */
export default function Tip({ label, children, className }: Props) {
  return (
    <span
      tabIndex={0}
      role="note"
      aria-label={label}
      className={["fx-tip", className ?? ""].filter(Boolean).join(" ")}
      data-tip={label}
    >
      {children}
    </span>
  );
}
