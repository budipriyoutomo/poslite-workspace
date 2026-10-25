import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import path from "node:path";

import { DATABASE_ENV } from "../../playwright.config";

/** Unique per run: the database is fresh, but specs must not depend on each other's rows. */
export const uniq = () => Date.now().toString(36).slice(-5);

/**
 * The operator CLI prompts for the password on a TTY, so the test calls the same
 * `create_admin` use-case directly.
 */
export function createOperator(email: string, password: string) {
  const script = [
    "import asyncio, sys",
    "from poslite.platform_admin.api import create_admin",
    "from poslite.shared.config import get_settings",
    "from poslite.shared.infrastructure.database import create_engine, session_factory",
    "async def main():",
    "    engine = create_engine(get_settings().system_database_url)",
    "    try: await create_admin(session_factory(engine), email=sys.argv[1], name='E2E Ops', password=sys.argv[2])",
    "    finally: await engine.dispose()",
    "asyncio.run(main())",
  ].join("\n");
  execFileSync("uv", ["run", "python", "-c", script, email, password], {
    cwd: path.join(__dirname, "../../../poslite-api"),
    env: { ...process.env, ...DATABASE_ENV },
    stdio: "inherit",
  });
}

/** RFC 6238 TOTP (SHA-1, 30 s, 6 digits) — what an authenticator app shows for `secret` (P1-8). */
export function totp(secret: string, at = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.replace(/=+$/, "")) bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
