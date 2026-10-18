export interface ListenConfig {
  host: string;
  port: number;
  token: string;
  allowedOrigins: string[];
  printers: string[];
  tls: { certFile: string; keyFile: string } | null;
}

const MIN_TOKEN_LENGTH = 16;

const list = (value: string | undefined) => (value ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/**
 * Configuration from environment variables (see README). Localhost by default: a tablet on the LAN
 * needs `BRIDGE_HOST=0.0.0.0` plus TLS, because an HTTPS POS page may only call another host over HTTPS.
 */
export function loadConfig(env: Record<string, string | undefined>): ListenConfig {
  const token = env.BRIDGE_TOKEN ?? "";
  if (token.length < MIN_TOKEN_LENGTH) throw new Error(`BRIDGE_TOKEN must be set (at least ${MIN_TOKEN_LENGTH} characters)`);
  const port = Number(env.BRIDGE_PORT ?? 9180);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("BRIDGE_PORT must be a port number");
  const certFile = env.BRIDGE_TLS_CERT;
  const keyFile = env.BRIDGE_TLS_KEY;
  if (Boolean(certFile) !== Boolean(keyFile)) throw new Error("BRIDGE_TLS_CERT and BRIDGE_TLS_KEY must be set together");
  return {
    host: env.BRIDGE_HOST || "127.0.0.1",
    port,
    token,
    allowedOrigins: list(env.BRIDGE_ALLOWED_ORIGINS),
    printers: list(env.BRIDGE_PRINTERS),
    tls: certFile && keyFile ? { certFile, keyFile } : null,
  };
}
