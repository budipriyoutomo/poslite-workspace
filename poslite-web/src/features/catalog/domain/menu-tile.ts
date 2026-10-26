// 15 · UX-06: how a menu item looks without a photo.

/** Eight colours that tell categories apart; "neutral" for a product whose category is unknown. */
export const TONES = ["emerald", "sky", "amber", "rose", "violet", "lime", "orange", "cyan"] as const;
export type Tone = (typeof TONES)[number] | "neutral";

/** A category's colour, by its place in the categories' order. */
export function categoryTone(categoryIds: string[], categoryId: string): Tone {
  const i = categoryIds.indexOf(categoryId);
  return i < 0 ? "neutral" : TONES[i % TONES.length]!;
}

/** "Nasi Gudeg" → "NG", "Kopi" → "KO": the placeholder of an item without a photo. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}
