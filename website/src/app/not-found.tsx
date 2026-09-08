import type { Metadata } from 'next';
import NotFoundClient from './NotFoundClient';

export const metadata: Metadata = {
  title: 'Page introuvable',
  robots: { index: false, follow: false },
};

/**
 * Custom 404, in-brand, with a couple of real entry points back into the
 * explorer. Static on purpose — see NotFoundClient for why.
 */
export default function NotFound() {
  return <NotFoundClient />;
}
