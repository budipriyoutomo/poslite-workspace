import { describe, expect, it } from "vitest";

import { buildTestPage } from "./test-page";
import { renderText } from "./text-layout";

const input = { connection: "Web Serial", printedAt: "2026-10-18T03:15:00.000Z", timezone: "Asia/Jakarta" };

describe("printer test page", () => {
  it("shows a ruler exactly as wide as the paper, to spot a wrong paper width", () => {
    expect(renderText(buildTestPage({ ...input, columns: 32 }), 32)).toContain("1234567890".repeat(4).slice(0, 32));
    expect(renderText(buildTestPage({ ...input, columns: 48 }), 48)).toContain("1234567890".repeat(5).slice(0, 48));
  });

  it("names the connection, paper and time it was printed", () => {
    const text = renderText(buildTestPage({ ...input, columns: 32 }), 32);

    expect(text).toContain("Koneksi: Web Serial");
    expect(text).toContain("Kertas : 58 mm (32 kolom)");
    expect(text).toContain("Waktu  : 18/10/26 10:15");
  });

  it("includes accented characters to check the printer codepage", () => {
    expect(renderText(buildTestPage({ ...input, columns: 32 }), 32)).toContain("Karakter: é è ñ ü ç");
  });
});
