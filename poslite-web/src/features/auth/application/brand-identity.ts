import type { BrandIdentityRow } from "@/shared/db";
import { mediaUrl } from "@/shared/media/media-url";

import { copy } from "../copy";

/** Name and logo shown on the lock screen (ADR-022): the outlet's brand, else the app name. */
export function brandIdentity(brand: BrandIdentityRow | undefined, mediaBaseUrl: string | null): { name: string; logoUrl: string | null } {
  if (!brand) return { name: copy.title, logoUrl: null };
  return { name: brand.name, logoUrl: mediaUrl(mediaBaseUrl, brand.logoKey) };
}
