'use client';

import { createContext, useContext } from 'react';

export type TrackFn = (eventName: string, properties?: Record<string, unknown>) => void;

const AnalyticsContext = createContext<TrackFn>(() => {});

export const AnalyticsProvider = AnalyticsContext.Provider;

export function useTrack(): TrackFn {
  return useContext(AnalyticsContext);
}
