"use client";

// Direct imports only — the fusion barrel pulls in server-only components that
// read node:fs (same trap as Paris LandingClient). The landing model builder is
// client-safe (it only formats the plain data the server page passed in).
import Navbar from "@/components/fusion/Navbar";
import Footer from "@/components/fusion/Footer";
import Landing from "@/components/landing/Landing";
import {
  buildMarseilleLandingModel,
  type MarseilleLandingData,
} from "@/lib/marseille/marseille-landing-model";
import { useLocale } from "@/lib/localeContext";

export default function MarseilleLandingClient({ data }: { data: MarseilleLandingData }) {
  const { locale } = useLocale();
  const model = buildMarseilleLandingModel(locale, data);
  return (
    <div className="theme-fusion">
      <Navbar />
      <Landing model={model} />
      <Footer />
    </div>
  );
}
