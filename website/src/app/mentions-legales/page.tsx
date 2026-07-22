import type { Metadata } from "next";
import "../fusion.css";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import MentionsLegalesClient from "./MentionsLegalesClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Mentions légales",
    description:
      "Mentions légales conformes à la LCEN : éditeur, directeur de publication, hébergeur, propriété intellectuelle, contact.",
    en: {
      title: "Legal notice",
      description:
        "Legal notice in accordance with French LCEN: publisher, publication director, host, intellectual property, contact.",
    },
    path: "/mentions-legales",
  });
}

export default function MentionsLegalesPage() {
  return <MentionsLegalesClient />;
}
