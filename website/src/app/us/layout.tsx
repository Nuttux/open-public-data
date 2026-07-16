import "@/app/fusion.css";
import UsChrome from "@/components/us/UsChrome";

/**
 * Layout for every /us route: registry-driven US chrome on top (ADR-0010
 * D2), inside the fusion theme. French chat/search never render here —
 * ChatPanel and SearchModal suppress themselves on /us paths.
 */
export default function UsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="theme-fusion">
      <UsChrome />
      {children}
    </div>
  );
}
