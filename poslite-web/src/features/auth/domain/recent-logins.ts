/**
 * Who logged in on this device lately, most recent first. The lock screen opens on the last one
 * (usually the cashier coming back) and lists the others before everyone else; a cashier still
 * picks a name before the PIN, so each attempt checks one PIN hash (03-offline-sync, Offline Auth).
 */
export const MAX_RECENT_LOGINS = 5;

export function rememberLogin(recent: readonly string[], userId: string): string[] {
  return [userId, ...recent.filter((id) => id !== userId)].slice(0, MAX_RECENT_LOGINS);
}

export function orderForLockScreen<T extends { id: string; name: string }>(users: readonly T[], recent: readonly string[]): T[] {
  const rank = (id: string) => {
    const i = recent.indexOf(id);
    return i === -1 ? recent.length : i;
  };
  return [...users].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name));
}
