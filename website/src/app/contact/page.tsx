import type { Metadata } from "next";
import "../fusion.css";
import { buildLocaleAwareMetadata } from "@/lib/seo";
import ContactClient from "./ContactClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Contact",
    description:
      "Contactez le collectif Qipu : corrections, suggestions, partenariats, demandes presse.",
    en: {
      title: "Contact",
      description:
        "Get in touch with the Qipu collective: corrections, suggestions, partnerships, press requests.",
    },
    path: "/contact",
  });
}

export default function ContactPage() {
  return <ContactClient />;
}
