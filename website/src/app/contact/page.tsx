import type { Metadata } from "next";
import "../fusion.css";
import ContactClient from "./ContactClient";

export const metadata: Metadata = {
  title: "Contact — France Open Data",
  description:
    "Contactez le collectif France Open Data : corrections, suggestions, partenariats, demandes presse.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return <ContactClient />;
}
