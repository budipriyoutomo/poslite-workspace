import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
afterEach(() => cleanup());

// Radix UI measures elements; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
