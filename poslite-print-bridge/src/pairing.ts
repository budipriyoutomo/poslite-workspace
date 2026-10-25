import { randomInt } from "node:crypto";

const CODE_TTL_MS = 5 * 60_000;
const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60_000;

export type Redeemed = "paired" | "wrong" | "locked";

/**
 * Pairing (P1-5): the bridge's local page shows a 6-digit code; the POS sends it once and gets the
 * bridge token back, so nobody types a long secret. A code lasts 5 minutes and pairs one device;
 * five wrong codes lock pairing for 5 minutes.
 */
export class Pairing {
  private code = "";
  private expiresAt = 0;
  private failures = 0;
  private lockedUntil = 0;
  private readonly now: () => number;
  private readonly randomCode: () => number;

  constructor(deps: { now?: () => number; randomCode?: () => number } = {}) {
    this.now = deps.now ?? Date.now;
    this.randomCode = deps.randomCode ?? (() => randomInt(0, 1_000_000));
  }

  private renew(): void {
    this.code = String(this.randomCode()).padStart(6, "0");
    this.expiresAt = this.now() + CODE_TTL_MS;
  }

  current(): { code: string; expiresAt: number } {
    if (this.code === "" || this.now() >= this.expiresAt) this.renew();
    return { code: this.code, expiresAt: this.expiresAt };
  }

  redeem(given: string): Redeemed {
    if (this.now() < this.lockedUntil) return "locked";
    const { code } = this.current();
    if (given.trim() !== code) {
      this.failures += 1;
      if (this.failures >= MAX_FAILURES) {
        this.failures = 0;
        this.lockedUntil = this.now() + LOCK_MS;
      }
      return "wrong";
    }
    this.failures = 0;
    this.renew();
    return "paired";
  }
}
