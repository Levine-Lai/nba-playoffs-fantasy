"use client";

import { DependencyList, useEffect } from "react";

export function useVisibilityPolling(load: () => Promise<void> | void, intervalMs: number, deps: DependencyList) {
  useEffect(() => {
    let active = true;
    let inFlight = false;
    let timer: number | null = null;

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

    const clearTimer = () => {
      if (timer !== null) {
        window.clearInterval(timer);
        timer = null;
      }
    };

    const startPolling = () => {
      clearTimer();
      if (document.visibilityState === "hidden") {
        return;
      }

      void run();
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          void run();
        }
      }, intervalMs);
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
      clearTimer();
      document.removeEventListener("visibilitychange", startPolling);
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, deps);
}
