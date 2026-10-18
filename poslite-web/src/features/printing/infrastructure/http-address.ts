/** A printer address as typed by the cashier: `192.168.1.50`, `printer.local:8043`, `http://…`. HTTPS by default. */
export const httpBase = (address: string) => (/^https?:\/\//.test(address) ? address : `https://${address}`).replace(/\/+$/, "");
