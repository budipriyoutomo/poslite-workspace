import { describe, expect, it } from "vitest";

import type { ReceiptDocument } from "../domain/receipt-document";
import { renderEscPos } from "./escpos-renderer";

const ESC = 0x1b;
const GS = 0x1d;

const doc: ReceiptDocument = [
  { kind: "text", text: "WARUNG BUDI", align: "center", bold: true },
  { kind: "rule" },
  { kind: "row", left: "1x Es Teh Manis", right: "5.000" },
  { kind: "row", left: "TOTAL", right: "5.000", bold: true },
  { kind: "text", text: "Terima kasih!", align: "center" },
];

const latin1 = (bytes: Uint8Array) => String.fromCharCode(...bytes);
const indexOfBytes = (bytes: Uint8Array, seq: number[]) => latin1(bytes).indexOf(String.fromCharCode(...seq));

describe("renderEscPos", () => {
  it("initializes the printer first and cuts the paper last", async () => {
    const bytes = await renderEscPos(doc, 32);

    expect([...bytes.slice(0, 2)]).toEqual([ESC, 0x40]);
    expect(indexOfBytes(bytes, [GS, 0x56])).toBeGreaterThan(indexOfBytes(bytes, [...Buffer.from("Terima kasih!")]));
  });

  it("prints the same columns as the on-screen preview", async () => {
    const text = latin1(await renderEscPos(doc, 32));

    expect(text).toContain("         WARUNG BUDI");
    expect(text).toContain("--------------------------------");
    expect(text).toContain("1x Es Teh Manis            5.000");
  });

  it("turns bold on for bold blocks only", async () => {
    const bytes = await renderEscPos(doc, 32);
    const boldOn = indexOfBytes(bytes, [ESC, 0x45, 1]);
    const boldOff = indexOfBytes(bytes, [ESC, 0x45, 0]);

    expect(boldOn).toBeGreaterThan(-1);
    expect(boldOn).toBeLessThan(indexOfBytes(bytes, [...Buffer.from("WARUNG BUDI")]));
    expect(boldOff).toBeLessThan(indexOfBytes(bytes, [...Buffer.from("1x Es Teh")]));
  });

  it("encodes accented characters through a printer codepage instead of dropping them", async () => {
    const text = latin1(await renderEscPos([{ kind: "text", text: "Crème brûlée & Jalapeño" }], 32));

    expect(text).not.toContain("?");
    expect(text).toMatch(/Cr.me br.l.e & Jalape.o/);
  });

  it("keeps the byte stream stable", async () => {
    expect(Buffer.from(await renderEscPos(doc, 32)).toString("hex")).toMatchSnapshot();
  });
});
