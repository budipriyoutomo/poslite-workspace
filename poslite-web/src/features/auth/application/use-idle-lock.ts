"use client";

import { useEffect } from "react";

import { useSession } from "./session-store";

const CHECK_EVERY_MS = 30_000;

/** Locks an idle device; any tap or key press counts as activity (throttled to limit writes). */
export function useIdleLock() {
  useEffect(() => {
    const { lockIfIdle } = useSession.getState();
    lockIfIdle();
    const timer = window.setInterval(() => useSession.getState().lockIfIdle(), CHECK_EVERY_MS);
    const onActivity = () => {
      const { lastActiveAt, touch } = useSession.getState();
      if (Date.now() - lastActiveAt > CHECK_EVERY_MS) touch();
    };
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, []);
}
