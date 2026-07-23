import type { Metadata } from "next";
import "@/app/fusion.css";

import Landing from "@/components/landing/Landing";
import { buildSfLandingModel } from "@/lib/us/sf-landing-model";

export const metadata: Metadata = {
  title: { absolute: "US · San Francisco" },
  description:
    "San Francisco's budget, payments, contracts, payroll and places — the city's money and its historical record, every figure linked to its source.",
};

export default function SfHubPage() {
  const model = buildSfLandingModel();
  return <Landing model={model} />;
}
