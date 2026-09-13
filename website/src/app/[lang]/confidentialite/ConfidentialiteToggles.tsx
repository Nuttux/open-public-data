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
// Both switches live together because they share state: opting out of
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

  const analyticsOn = !isOptedOut;

  return (
    <div className="fx-consent">
      {/* Audience measurement — on by default, one tap to opt out */}
      <section className="fx-consent-row">
        <div>
          <h3>{t('privacy.toggle.title')}</h3>
          <p>{analyticsOn ? t('privacy.toggle.on') : t('privacy.toggle.off')}</p>
        </div>
        <div className="fx-consent-ctl">
          <button
            type="button"
            className="fx-switch"
            onClick={handleToggle}
            role="switch"
            aria-checked={analyticsOn}
            aria-label={t('privacy.toggle.aria')}
          />
          <span className="fx-consent-state" aria-hidden="true">
            {analyticsOn ? t('privacy.state.on') : t('privacy.state.off')}
          </span>
        </div>
      </section>

      {/* Session replay — off by default, opt-in only */}
      <section className="fx-consent-row">
        <div>
          <h3>{t('privacy.replay.title')}</h3>
          <p>{replayOn ? t('privacy.replay.on') : t('privacy.replay.off')}</p>
        </div>
        <div className="fx-consent-ctl">
          <button
            type="button"
            className="fx-switch"
            onClick={handleReplayToggle}
            disabled={isOptedOut}
            role="switch"
            aria-checked={replayOn}
            aria-label={t('privacy.replay.title')}
          />
          <span className="fx-consent-state" aria-hidden="true">
            {replayOn ? t('privacy.state.on') : t('privacy.state.off')}
          </span>
        </div>
      </section>
    </div>
  );
}
