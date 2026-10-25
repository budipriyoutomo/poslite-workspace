import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

/**
 * The bridge's token when BRIDGE_TOKEN is not set (P1-5): made once, kept in a file only this
 * user can read, and handed to a POS through the pairing code instead of typed by hand.
 */
export function ensureToken(file: string): string {
  if (existsSync(file)) {
    const saved = readFileSync(file, "utf8").trim();
    if (saved.length >= 32) return saved;
  }
  const token = randomBytes(24).toString("base64url");
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return token;
}
