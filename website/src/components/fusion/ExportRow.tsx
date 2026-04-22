import type { ReactNode } from "react";

type Item = {
  label: ReactNode;
  href?: string;
  /** Visual emphasis — shown as the "primary" ink-filled button. */
  primary?: boolean;
  /** If set, forces the browser to download the file (instead of open in tab). */
  download?: string | boolean;
  /** Open in a new tab. */
  external?: boolean;
};

type Props = {
  title?: ReactNode;
  items: Item[];
};

/**
 * Export / downloads strip shown at the bottom of data pages. The mockup
 * puts this under the "Sources" section with a ghost label on the left.
 */
export default function ExportRow({ title = "Téléchargements", items }: Props) {
  return (
    <div className="fx-export-row">
      <span className="fx-export-label">{title}</span>
      {items.map((it, i) => {
        const cls = it.primary ? "fx-btn fx-btn-primary" : "fx-btn";
        if (it.href) {
          const downloadAttr =
            it.download === true
              ? ""
              : typeof it.download === "string"
                ? it.download
                : undefined;
          return (
            <a
              key={i}
              className={cls}
              href={it.href}
              download={downloadAttr}
              target={it.external ? "_blank" : undefined}
              rel={it.external ? "noopener noreferrer" : undefined}
            >
              {it.label}
            </a>
          );
        }
        return (
          <span key={i} className={cls} style={{ cursor: "default", opacity: 0.7 }}>
            {it.label}
          </span>
        );
      })}
    </div>
  );
}
