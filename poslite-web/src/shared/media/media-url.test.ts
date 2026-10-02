import { describe, expect, it } from "vitest";

import { mediaUrl } from "./media-url";

describe("mediaUrl (ADR-021)", () => {
  it("joins the server's media base URL and the object key", () => {
    expect(mediaUrl("https://is3.cloudhost.id/poslite", "T1/products/P1.jpg")).toBe("https://is3.cloudhost.id/poslite/T1/products/P1.jpg");
  });

  it("ignores a trailing slash on the base URL", () => {
    expect(mediaUrl("http://localhost:8000/media/", "T1/a.png")).toBe("http://localhost:8000/media/T1/a.png");
  });

  it("keeps a full URL or an app path as it is", () => {
    expect(mediaUrl("https://cdn.example.id", "https://old.example.com/teh.jpg")).toBe("https://old.example.com/teh.jpg");
    expect(mediaUrl(null, "/products/es-teh.jpg")).toBe("/products/es-teh.jpg");
  });

  it("has no URL without a key, or without a base URL to put a key on", () => {
    expect(mediaUrl("https://cdn.example.id", null)).toBeNull();
    expect(mediaUrl(null, "T1/products/P1.jpg")).toBeNull();
  });
});
