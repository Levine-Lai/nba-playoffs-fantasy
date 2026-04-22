"use client";

import { DependencyList, useEffect } from "react";

type VisibilityPollingOptions = {
  intervalMs?: number | null;
  nextRefreshAt?: string | null;
};

export function useVisibilityPolling(
  load: () => Promise<void> | void,
  options: VisibilityPollingOptions,
  deps: DependencyList
) {
  useEffect(() => {
    let active = true;
    let inFlight = false;
    let intervalTimer: number | null = null;
    let timeoutTimer: number | null = null;

    const run = async () => {
      if (!active || inFlight) {
        return;
      }

      inFlight = true;

      try {
        await load();
      } finally {
        inFlight = false;
      }
    };

    const clearTimers = () => {
      if (intervalTimer !== null) {
        window.clearInterval(intervalTimer);
        intervalTimer = null;
      }

      if (timeoutTimer !== null) {
        window.clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
    };

    const scheduleOneShotRefresh = () => {
      if (!options.nextRefreshAt) {
        return;
      }

      const nextRefreshTimestamp = new Date(options.nextRefreshAt).getTime();
      if (!Number.isFinite(nextRefreshTimestamp)) {
        return;
      }

      const delayMs = nextRefreshTimestamp - Date.now();
      if (delayMs <= 1000) {
        return;
      }

      timeoutTimer = window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          void run();
        }
      }, delayMs);
    };

    const startPolling = () => {
      clearTimers();
      if (document.visibilityState === "hidden") {
        return;
      }

      void run();

      if (options.intervalMs && options.intervalMs > 0) {
        intervalTimer = window.setInterval(() => {
          if (document.visibilityState === "visible") {
            void run();
          }
        }, options.intervalMs);
        return;
      }

      scheduleOneShotRefresh();
    };

    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") {
        void run();
      }
    };

    startPolling();
    document.addEventListener("visibilitychange", startPolling);
    window.addEventListener("focus", refreshOnFocus);

    return () => {
      active = false;
      clearTimers();
      document.removeEventListener("visibilitychange", startPolling);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, deps);
}
