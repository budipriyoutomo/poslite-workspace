// PIN verification offline with WebCrypto (03-offline-sync.md "Offline Auth"): the server sends
// pin_hash = base64(PBKDF2-SHA256(pin, salt, iterations, 32 bytes)); the PIN never leaves the device.

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

function toBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

export async function hashPin(pin: string, salt: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromBase64(salt), iterations }, key, 256);
  return toBase64(bits);
}

/** Compares in constant time so the check does not leak how many characters matched. */
function constantTimeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function pinMatches(pin: string, user: { pinHash: string; pinSalt: string; pinIterations: number }): Promise<boolean> {
  return constantTimeEqual(await hashPin(pin, user.pinSalt, user.pinIterations), user.pinHash);
}
