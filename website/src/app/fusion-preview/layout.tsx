import type { Metadata } from "next";
import "../fusion.css";

export const metadata: Metadata = {
  title: "Design system — 06-fusion",
  robots: { index: false, follow: false },
};

export default function FusionPreviewLayout({ children }: { children: React.ReactNode }) {
  return <div className="theme-fusion">{children}</div>;
}
