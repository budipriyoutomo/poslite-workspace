import { describe, expect, it } from "vitest";

import { brandIdentity } from "./brand-identity";

const MEDIA = "https://is3.cloudhost.id/poslite-media";

describe("brandIdentity (ADR-022)", () => {
  it("names the outlet's brand and builds its logo URL from the media base URL", () => {
    expect(brandIdentity({ id: "B", code: "SUSHI", name: "Maharasa Sushi", logoKey: "T/products/logo.png" }, MEDIA)).toEqual({
      name: "Maharasa Sushi",
      logoUrl: `${MEDIA}/T/products/logo.png`,
    });
  });

  it("has no logo without a key or a media base URL", () => {
    expect(brandIdentity({ id: "B", code: "SUSHI", name: "Sushi", logoKey: null }, MEDIA)).toEqual({ name: "Sushi", logoUrl: null });
    expect(brandIdentity({ id: "B", code: "SUSHI", name: "Sushi", logoKey: "k.png" }, null)).toEqual({ name: "Sushi", logoUrl: null });
  });

  it("falls back to the app name before the device knows its brand", () => {
    expect(brandIdentity(undefined, MEDIA)).toEqual({ name: "POSLite", logoUrl: null });
  });
});
