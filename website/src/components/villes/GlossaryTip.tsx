'use client';

import { useState } from 'react';
import { useT } from '@/lib/localeContext';

interface GlossaryTipProps {
  termKey: string; // i18n key like 'villes.glossaire.fonds_propres'
}

export default function GlossaryTip({ termKey }: GlossaryTipProps) {
  const t = useT();
  const [show, setShow] = useState(false);

  return (
    <span className="relative inline-flex items-center ml-1">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="w-4 h-4 rounded-full bg-slate-700/50 text-slate-500 hover:text-slate-300 hover:bg-slate-600/50 text-[10px] font-bold leading-none flex items-center justify-center transition-colors"
        aria-label="Info"
      >
        ?
      </button>
      {show && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 rounded-lg bg-slate-800 border border-slate-600/50 shadow-xl text-xs text-slate-300 leading-relaxed z-50 pointer-events-none">
          {t(termKey)}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="w-2 h-2 bg-slate-800 border-r border-b border-slate-600/50 transform rotate-45" />
          </div>
        </div>
      )}
    </span>
  );
}
