import type { Metadata } from "next";
import "../fusion.css";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import SignalementClient from "./SignalementClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Signaler une erreur — France Open Data",
    description:
      "Signalez une erreur dans un chiffre, dans la méthodologie, ou un lien cassé. Toutes les corrections appliquées sont publiées dans le changelog.",
    en: {
      title: "Report an error — France Open Data",
      description:
        "Report an error in a number, in the methodology, or a broken link. All applied corrections are published in the changelog.",
    },
    path: "/signalement",
  });
}

export default function SignalementPage() {
  return <SignalementClient />;
}
