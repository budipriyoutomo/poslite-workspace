/**
 * Product photos from object storage (ADR-021): images from another origin. Keys are never
 * reused, so the service worker can keep them cache-first and show them offline.
 */
export function isStoredPhoto(url: URL, destination: string, appOrigin: string): boolean {
  return destination === "image" && url.origin !== appOrigin;
}
