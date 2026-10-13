import "@testing-library/jest-dom/vitest";

import { cleanup, configure } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";

// The store module itself, not the feature index: the index pulls in components (next/navigation).
import { useSessionStore } from "@/features/auth/application/session-store";

// findBy*/waitFor default to 1s; a busy machine or CI runner renders a mocked fetch slower than that.
configure({ asyncUtilTimeout: 3000 });

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
afterEach(() => cleanup());

// Screens run for a signed-in owner working in one brand (ADR-022); auth tests reset this.
export const TEST_BRAND = "01K5ZB00000000000000000001";
beforeEach(() => {
  if (typeof localStorage?.setItem !== "function") return; // node-environment tests (architecture)
  useSessionStore.getState().signIn({
    token: "tok",
    expires_at: "2099-01-01T00:00:00Z",
    user: { id: "U", name: "Budi", role: "owner" },
    tenant: { id: "T", slug: "m", name: "Warung", status: "active" },
  });
  useSessionStore.getState().selectBrand(TEST_BRAND);
});

// Radix UI (checkbox, switch, select) measures elements; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
