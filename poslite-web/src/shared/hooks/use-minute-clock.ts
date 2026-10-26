"use client";

import { useEffect, useState } from "react";

/** The time, re-read every minute: for "n mnt lalu" and anything else counted in minutes. */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
