import packageJson from "../../package.json";

/** API base URL (07-api-contract.md); set NEXT_PUBLIC_API_URL per deployment. */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/** Sent as X-App-Version; the server answers 426 when it is below its minimum. */
export const APP_VERSION: string = packageJson.version;

/** Shows "Coba mode demo" on the activation screen (15 · UX-01): on for the sales demo site, off for tenants. */
export const DEMO_ENABLED = process.env.NEXT_PUBLIC_DEMO_ENABLED === "true";
