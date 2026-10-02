/**
 * URL of a stored image (ADR-021): the server's media base URL + the object key. Keys that are
 * already a URL (legacy, external) or an app path (demo menu) are used as they are.
 */
export function mediaUrl(baseUrl: string | null, key: string | null): string | null {
  if (!key) return null;
  if (key.includes("://") || key.startsWith("/")) return key;
  return baseUrl ? `${baseUrl.replace(/\/+$/, "")}/${key}` : null;
}
