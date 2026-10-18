import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createServer, type Socket } from "node:net";
import { describe, it } from "node:test";

import { sendRaw } from "./send-raw.ts";

/** A local stand-in for a printer on port 9100: collects what it receives. */
async function fakePrinter() {
  const received: Buffer[] = [];
  const server = createServer((socket) => socket.on("data", (chunk) => received.push(chunk)));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const closed = new Promise<void>((resolve) => server.on("connection", (s) => s.on("close", () => resolve())));
  return { port, received, closed, stop: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

describe("sendRaw", () => {
  it("writes every byte to the printer and closes the connection", async () => {
    const printer = await fakePrinter();
    const data = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 256));

    await sendRaw({ host: "127.0.0.1", port: printer.port }, data);
    await printer.closed;

    assert.deepEqual(Buffer.concat(printer.received), data);
    await printer.stop();
  });

  it("finishes even when the printer keeps its side of the connection open", async () => {
    const received: Buffer[] = [];
    const sockets: Socket[] = [];
    const server = createServer({ allowHalfOpen: true }, (socket) => {
      sockets.push(socket);
      socket.on("data", (chunk) => received.push(chunk));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;

    await sendRaw({ host: "127.0.0.1", port }, Buffer.from([1, 2, 3]), { timeoutMs: 2_000, lingerMs: 50 });

    assert.deepEqual(Buffer.concat(received), Buffer.from([1, 2, 3]));
    sockets.forEach((s) => s.destroy()); // this "printer" never closes on its own
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("reports a printer that refuses the connection as unreachable", async () => {
    const printer = await fakePrinter();
    await printer.stop(); // nothing listens on the port any more

    await assert.rejects(sendRaw({ host: "127.0.0.1", port: printer.port }, Buffer.from([1])), { message: "PRINTER_UNREACHABLE" });
  });

  it("gives up on a printer that never answers", async () => {
    const hanging = () => {
      const socket = new EventEmitter() as EventEmitter & { setTimeout: (ms: number, cb: () => void) => void; destroy: () => void };
      socket.setTimeout = (_ms, cb) => setImmediate(cb);
      socket.destroy = () => undefined;
      return socket as unknown as Socket;
    };

    await assert.rejects(sendRaw({ host: "192.168.1.50", port: 9100 }, Buffer.from([1]), { timeoutMs: 10, connect: hanging }), { message: "PRINTER_TIMEOUT" });
  });
});
