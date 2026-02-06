/**
 * GlossaryShell - Client wrapper for the glossary system
 *
 * Bundles the GlossaryProvider (context) and GlossaryDrawer (UI)
 * into a single client component that can be used in the server-side
 * root layout (app/layout.tsx).
 */

'use client';

import { type ReactNode } from 'react';
import { GlossaryProvider } from '@/lib/glossaryContext';
import GlossaryDrawer from './GlossaryDrawer';

interface GlossaryShellProps {
  children: ReactNode;
}

export default function GlossaryShell({ children }: GlossaryShellProps) {
  return (
    <GlossaryProvider>
      {children}
      <GlossaryDrawer />
    </GlossaryProvider>
  );
}
