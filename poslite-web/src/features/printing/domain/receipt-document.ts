/** Printer-neutral receipt model (04-printing.md): rendered to text/HTML now, ESC/POS bytes later. */
export type ReceiptBlock =
  | { kind: "text"; text: string; align?: "left" | "center"; bold?: boolean }
  | { kind: "row"; left: string; right: string; bold?: boolean }
  | { kind: "rule" };

export type ReceiptDocument = ReceiptBlock[];
