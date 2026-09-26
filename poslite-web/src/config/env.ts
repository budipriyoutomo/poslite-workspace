import packageJson from "../../package.json";

/** API base URL (07-api-contract.md); set NEXT_PUBLIC_API_URL per deployment. */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";

/** Sent as X-App-Version; the server answers 426 when it is below its minimum. */
export const APP_VERSION: string = packageJson.version;
