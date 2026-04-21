import type { Metadata } from "next";
import "./fusion.css";

import { loadLandingStats } from "@/lib/fusion-data";
import LandingClient from "./LandingClient";

export const metadata: Metadata = {
  title: "Où va l'argent public à Paris ? — France Open Data",
  description:
    "Les finances publiques françaises, rendues lisibles. Budget, dépenses, subventions, dette — sourcés, vérifiables, publiés en licence ouverte.",
  alternates: { canonical: "/" },
};

export default function LandingPage() {
  const stats = loadLandingStats();
  return <LandingClient stats={stats} />;
}
