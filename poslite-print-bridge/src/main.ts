import { readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { homedir } from "node:os";
import path from "node:path";

import { loadConfig } from "./config.ts";
import { sendRaw } from "./send-raw.ts";
import { createBridgeHandler } from "./server.ts";
import { ensureToken } from "./token-file.ts";

const VERSION = "0.1.0";

const config = loadConfig(process.env);
const token = config.token || ensureToken(process.env.BRIDGE_TOKEN_FILE || path.join(homedir(), ".poslite-bridge-token"));
const handler = createBridgeHandler({ token, allowedOrigins: config.allowedOrigins, printers: config.printers, version: VERSION }, sendRaw);
const server = config.tls
  ? createHttpsServer({ cert: readFileSync(config.tls.certFile), key: readFileSync(config.tls.keyFile) }, handler)
  : createHttpServer(handler);

server.listen(config.port, config.host, () => {
  const scheme = config.tls ? "https" : "http";
  console.log(`POSLite Print Bridge ${VERSION} on ${scheme}://${config.host}:${config.port}`);
  console.log(`Pairing code and test print: http://localhost:${config.port}/ (this PC only)`);
  console.log(config.printers.length > 0 ? `Printers: ${config.printers.join(", ")}` : "Printers: any private IPv4 address (set BRIDGE_PRINTERS to restrict)");
});
