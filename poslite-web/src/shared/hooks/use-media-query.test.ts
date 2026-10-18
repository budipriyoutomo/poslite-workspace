import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMediaQuery } from "./use-media-query";

/** A controllable matchMedia: `set(true)` flips every query and notifies listeners. */
function stubMatchMedia(initial: boolean) {
  let matches = initial;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return matches;
    },
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
  return (next: boolean) => {
    matches = next;
    listeners.forEach((fn) => fn());
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("useMediaQuery", () => {
  it("reports whether the query matches", () => {
    stubMatchMedia(true);
    expect(renderHook(() => useMediaQuery("(min-width: 768px)")).result.current).toBe(true);
  });

  it("follows changes, e.g. a tablet rotated to portrait", () => {
    const set = stubMatchMedia(true);
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"));
    act(() => set(false));
    expect(result.current).toBe(false);
  });

  it("falls back to the given value where matchMedia is missing", () => {
    vi.stubGlobal("matchMedia", undefined);
    expect(renderHook(() => useMediaQuery("(min-width: 768px)", true)).result.current).toBe(true);
  });
});
