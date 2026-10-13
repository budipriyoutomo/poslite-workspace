import { execFileSync } from "node:child_process";
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
