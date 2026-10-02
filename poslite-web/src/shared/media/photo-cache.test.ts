import { describe, expect, it } from "vitest";

import { isStoredPhoto } from "./photo-cache";

const APP = "https://pos.poslite.id";

describe("isStoredPhoto (service worker cache rule, ADR-021)", () => {
  it("matches an image from the media host", () => {
    expect(isStoredPhoto(new URL("https://is3.cloudhost.id/poslite/T1/products/P1.jpg"), "image", APP)).toBe(true);
  });

  it("leaves the app's own files and the API to their own rules", () => {
    expect(isStoredPhoto(new URL(`${APP}/products/es-teh.jpg`), "image", APP)).toBe(false);
    expect(isStoredPhoto(new URL("https://api.poslite.id/api/v1/sync/pull"), "", APP)).toBe(false);
  });
});
