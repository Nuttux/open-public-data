import type { Metadata } from "next";
import "../fusion.css";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import AccessibiliteClient from "./AccessibiliteClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Déclaration d'accessibilité — France Open Data",
    description:
      "Déclaration d'accessibilité RGAA 4.1 : niveau de conformité, méthode d'évaluation, contenus non accessibles, voies de recours.",
    en: {
      title: "Accessibility statement — France Open Data",
      description:
        "RGAA 4.1 accessibility statement: compliance level, evaluation method, non-accessible content, complaint procedure.",
    },
    path: "/accessibilite",
  });
}

export default function AccessibilitePage() {
  return <AccessibiliteClient />;
}
