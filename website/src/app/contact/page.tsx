import type { Metadata } from "next";
import "../fusion.css";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import ContactClient from "./ContactClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Contact — France Open Data",
    description:
      "Contactez le collectif France Open Data : corrections, suggestions, partenariats, demandes presse.",
    en: {
      title: "Contact — France Open Data",
      description:
        "Get in touch with the France Open Data collective: corrections, suggestions, partnerships, press requests.",
    },
    path: "/contact",
  });
}

export default function ContactPage() {
  return <ContactClient />;
}
