import type { Metadata } from 'next';
import { buildPageMetadata } from '@/lib/seo';

export const metadata: Metadata = buildPageMetadata({
  title: 'Politique de confidentialité',
  description:
    "Politique de confidentialité de Données Lumières : analytics, cookies, données personnelles, conformité RGPD.",
  path: '/confidentialite',
});

export default function ConfidentialiteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
