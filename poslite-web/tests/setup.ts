import "@testing-library/jest-dom/vitest";
// Global in-memory IndexedDB so components using the app database (getDb) can render in jsdom.
import "fake-indexeddb/auto";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs without globals, so Testing Library cannot register its own cleanup.
afterEach(() => cleanup());
