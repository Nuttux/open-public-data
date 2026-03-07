'use client';

import { type ReactNode } from 'react';
import { GlossaryProvider } from '@/lib/glossaryContext';
import { LocaleProvider } from '@/lib/localeContext';
import GlossaryDrawer from './GlossaryDrawer';
import type { Locale } from '@/i18n/config';

interface GlossaryShellProps {
  locale: Locale;
  children: ReactNode;
}

export default function GlossaryShell({ locale, children }: GlossaryShellProps) {
  return (
    <LocaleProvider locale={locale}>
      <GlossaryProvider>
        {children}
        <GlossaryDrawer />
      </GlossaryProvider>
    </LocaleProvider>
  );
}
