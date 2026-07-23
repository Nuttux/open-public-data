import "@/app/fusion.css";
import RegistryChrome from "@/components/RegistryChrome";
import { ForcedLocale } from "@/lib/localeContext";

/**
 * Layout for every /us route: the shared registry-driven chrome (ADR-0010 D2),
 * inside the fusion theme. French chat/search never render here — ChatPanel and
 * SearchModal suppress themselves on /us paths.
 */
export default function UsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ForcedLocale locale="en">
      <div className="theme-fusion">
        <RegistryChrome country="us" />
        {children}
      </div>
    </ForcedLocale>
  );
}
