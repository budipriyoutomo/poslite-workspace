import type { PosDb, UserRole } from "@/shared/db";
import { getDb, readState, writeState } from "@/shared/db";
import { AppError } from "@/shared/errors";

import { INITIAL_LOCKOUT, isLocked, registerFailure, registerSuccess } from "../domain/pin-lockout";
import { rememberLogin } from "../domain/recent-logins";
import { pinMatches } from "../infrastructure/pin-hasher";

export interface VerifyPinDeps {
  db: PosDb;
  now: () => Date;
}

export interface SessionUser {
  id: string;
  name: string;
  role: UserRole;
}

const defaultDeps = (): VerifyPinDeps => ({ db: getDb(), now: () => new Date() });

/** Offline PIN login. The lockout and the recent logins are stored in IndexedDB so a reload keeps them. */
export async function verifyPin(input: { userId: string; pin: string }, deps: VerifyPinDeps = defaultDeps()): Promise<SessionUser> {
  const { db } = deps;
  const now = deps.now();
  const lockout = (await readState(db, "pinLockout")) ?? INITIAL_LOCKOUT;
  if (isLocked(lockout, now)) throw new AppError("PIN_LOCKED", "PIN_LOCKED", { lockedUntil: lockout.lockedUntil });

  const user = await db.users.get(input.userId);
  if (!user) throw new AppError("UNKNOWN_USER");

  if (!(await pinMatches(input.pin, user))) {
    await writeState(db, "pinLockout", registerFailure(lockout, now));
    throw new AppError("WRONG_PIN");
  }
  await writeState(db, "pinLockout", registerSuccess());
  await writeState(db, "recentLogins", rememberLogin((await readState(db, "recentLogins")) ?? [], user.id));
  return { id: user.id, name: user.name, role: user.role };
}
