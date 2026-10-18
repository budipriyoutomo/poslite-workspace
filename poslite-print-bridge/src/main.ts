import { readFileSync } from "node:fs";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";

import { loadConfig } from "./config.ts";
import { sendRaw } from "./send-raw.ts";
import { createBridgeHandler } from "./server.ts";

const VERSION = "0.1.0";

const config = loadConfig(process.env);
const handler = createBridgeHandler({ token: config.token, allowedOrigins: config.allowedOrigins, printers: config.printers, version: VERSION }, sendRaw);
const server = config.tls
  ? createHttpsServer({ cert: readFileSync(config.tls.certFile), key: readFileSync(config.tls.keyFile) }, handler)
  : createHttpServer(handler);

server.listen(config.port, config.host, () => {
  const scheme = config.tls ? "https" : "http";
  console.log(`POSLite Print Bridge ${VERSION} on ${scheme}://${config.host}:${config.port}`);
  console.log(config.printers.length > 0 ? `Printers: ${config.printers.join(", ")}` : "Printers: any private IPv4 address (set BRIDGE_PRINTERS to restrict)");
});
