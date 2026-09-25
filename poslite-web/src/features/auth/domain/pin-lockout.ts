/** Device-wide PIN throttling (03-offline-sync.md): 5 wrong PINs → 1 minute, doubling after that. */
export interface PinLockoutState {
  failures: number;
  lockedUntil: string | null; // ISO
}

export const INITIAL_LOCKOUT: PinLockoutState = { failures: 0, lockedUntil: null };

const ATTEMPTS_PER_LOCK = 5;
const FIRST_LOCK_MS = 60_000;

export function registerFailure(state: PinLockoutState, now: Date): PinLockoutState {
  const failures = state.failures + 1;
  if (failures % ATTEMPTS_PER_LOCK !== 0) return { ...state, failures };
  const lockMs = FIRST_LOCK_MS * 2 ** (failures / ATTEMPTS_PER_LOCK - 1);
  return { failures, lockedUntil: new Date(now.getTime() + lockMs).toISOString() };
}

export function registerSuccess(): PinLockoutState {
  return INITIAL_LOCKOUT;
}

export function isLocked(state: PinLockoutState, now: Date): boolean {
  return state.lockedUntil !== null && now.getTime() < new Date(state.lockedUntil).getTime();
}
