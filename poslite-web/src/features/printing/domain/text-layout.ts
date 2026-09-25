import type { ReceiptDocument } from "./receipt-document";

const CONTINUATION = "  ";

/** Greedy word wrap that keeps leading indentation; continuation lines are indented further. */
function wrap(text: string, width: number): string[] {
  const indent = text.match(/^ */)![0];
  const lines: string[] = [];
  let line = indent;
  for (const word of text.trimStart().split(" ")) {
    const candidate = line.trim() ? `${line} ${word}` : `${line}${word}`;
    if (candidate.length <= width || !line.trim()) {
      line = candidate;
    } else {
      lines.push(line);
      line = `${indent}${CONTINUATION}${word}`;
    }
  }
  lines.push(line);
  return lines.map((l) => l.slice(0, width));
}

function row(left: string, right: string, width: number): string[] {
  const lines = wrap(left, width);
  const last = lines[lines.length - 1]!;
  if (last.length + 1 + right.length <= width) {
    lines[lines.length - 1] = last + " ".repeat(width - last.length - right.length) + right;
    return lines;
  }
  return [...lines, right.padStart(width)];
}

/** Monospace rendering of a receipt for 58 mm (32 columns) or 80 mm (48 columns) paper. */
export function renderText(doc: ReceiptDocument, columns: number): string[] {
  return doc.flatMap((block) => {
    if (block.kind === "rule") return ["-".repeat(columns)];
    if (block.kind === "row") return row(block.left, block.right, columns);
    return block.text.split("\n").flatMap((part) =>
      wrap(part, columns).map((l) => (block.align === "center" ? " ".repeat(Math.floor((columns - l.length) / 2)) + l : l)),
    );
  });
}
