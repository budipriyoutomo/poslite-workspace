import type { ReceiptPrinter } from "./receipt-printer";

const ROOT_ID = "poslite-print-root";

/**
 * `system` driver (04-printing.md): the browser print dialog with a monospace receipt sized for
 * thermal paper (see @media print in globals.css). Works with any printer installed in the OS;
 * Chrome's --kiosk-printing makes it silent.
 */
export const systemPrinter: ReceiptPrinter = {
  async print(lines) {
    document.getElementById(ROOT_ID)?.remove();
    const root = document.createElement("div");
    root.id = ROOT_ID;
    const pre = document.createElement("pre");
    pre.textContent = lines.join("\n");
    root.append(pre);
    document.body.append(root);
    window.addEventListener("afterprint", () => root.remove(), { once: true });
    window.print();
  },
};
