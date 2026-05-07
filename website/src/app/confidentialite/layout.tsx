import type { Metadata } from 'next';
import "../fusion.css";
import { buildLocaleAwareMetadata } from '@/lib/seo';

export async function generateMetadata(): Promise<Metadata> {
  return buildLocaleAwareMetadata({
    title: "Politique de confidentialité — France Open Data",
    description:
      "Politique RGPD : analytics PostHog en mode CNIL-exempt, aucun cookie tiers, opt-out global, transferts encadrés.",
    en: {
      title: "Privacy policy — France Open Data",
      description:
        "GDPR policy: PostHog analytics in CNIL-exempt mode, no third-party cookies, global opt-out, regulated transfers.",
    },
    path: '/confidentialite',
  });
}

export default function ConfidentialiteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
