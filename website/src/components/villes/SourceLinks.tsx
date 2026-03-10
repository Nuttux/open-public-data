'use client';

import { useT } from '@/lib/localeContext';

type SourceKey = 'dgfip' | 'ofgl' | 'decp' | 'scdl';

interface SourceLinksProps {
  sources: SourceKey[];
}

const SOURCE_CONFIG: Record<SourceKey, { labelKey: string; urlKey: string }> = {
  dgfip: { labelKey: 'villes.source_dgfip', urlKey: 'villes.source_dgfip_url' },
  ofgl: { labelKey: 'villes.source_ofgl', urlKey: 'villes.source_ofgl_url' },
  decp: { labelKey: 'villes.source_decp', urlKey: 'villes.source_decp_url' },
  scdl: { labelKey: 'villes.source_scdl', urlKey: 'villes.source_scdl_url' },
};

export default function SourceLinks({ sources }: SourceLinksProps) {
  const t = useT();

  return (
    <div className="mt-6 space-y-1">
      <p className="text-xs text-slate-500 font-medium mb-2">{t('villes.source_nationale')}</p>
      <div className="flex flex-wrap gap-2">
        {sources.map((key) => {
          const config = SOURCE_CONFIG[key];
          return (
            <a
              key={key}
              href={t(config.urlKey)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-slate-400 hover:text-teal-400 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-lg transition-colors"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {t(config.labelKey)}
            </a>
          );
        })}
      </div>
    </div>
  );
}
