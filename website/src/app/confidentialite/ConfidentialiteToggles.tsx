'use client';

import { useState, useEffect } from 'react';
import {
  optOutAnalytics as optOut,
  optInAnalytics as optIn,
  isOptedOutAnalytics as isCurrentlyOptedOut,
  isReplayOptedIn,
  enableReplay,
  disableReplay,
} from '@/components/AnalyticsProvider';
import { useT } from '@/lib/localeContext';

// Client leaf of the /confidentialite page (the rest is server-rendered).
// Both toggles live together because they share state: opting out of
// analytics also disables (and turns off) session replay.
export default function ConfidentialiteToggles() {
  const t = useT();
  const [isOptedOut, setIsOptedOut] = useState(false);
  const [replayOn, setReplayOn] = useState(false);

  useEffect(() => {
    setIsOptedOut(isCurrentlyOptedOut());
    setReplayOn(isReplayOptedIn());
  }, []);

  const handleToggle = () => {
    if (isOptedOut) {
      optIn();
      setIsOptedOut(false);
    } else {
      optOut();
      setIsOptedOut(true);
      setReplayOn(false);
    }
  };

  const handleReplayToggle = () => {
    if (replayOn) {
      disableReplay();
      setReplayOn(false);
    } else {
      enableReplay();
      setReplayOn(true);
    }
  };

  return (
    <>
      {/* Session replay opt-in */}
      <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              {t('privacy.replay.title')}
            </h3>
            <p className="text-slate-400 text-sm mt-1">
              {replayOn
                ? t('privacy.replay.on')
                : t('privacy.replay.off')}
            </p>
          </div>
          <button
            onClick={handleReplayToggle}
            disabled={isOptedOut}
            className={`
              relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent
              transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900
              disabled:opacity-40 disabled:cursor-not-allowed
              ${replayOn ? 'bg-emerald-600' : 'bg-slate-600'}
            `}
            role="switch"
            aria-checked={replayOn}
            aria-label="Toggle session replay"
          >
            <span
              className={`
                pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0
                transition duration-200 ease-in-out
                ${replayOn ? 'translate-x-5' : 'translate-x-0'}
              `}
            />
          </button>
        </div>
      </section>

      {/* Full opt-out toggle */}
      <section className="bg-slate-800/50 border border-slate-700 rounded-xl p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              {t('privacy.toggle.title')}
            </h3>
            <p className="text-slate-400 text-sm mt-1">
              {isOptedOut ? t('privacy.toggle.off') : t('privacy.toggle.on')}
            </p>
          </div>
          <button
            onClick={handleToggle}
            className={`
              relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent
              transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900
              ${isOptedOut ? 'bg-slate-600' : 'bg-blue-600'}
            `}
            role="switch"
            aria-checked={!isOptedOut}
            aria-label={t('privacy.toggle.aria')}
          >
            <span
              className={`
                pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0
                transition duration-200 ease-in-out
                ${isOptedOut ? 'translate-x-0' : 'translate-x-5'}
              `}
            />
          </button>
        </div>
      </section>
    </>
  );
}
