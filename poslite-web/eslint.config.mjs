import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

// Layer rules from docs/architecture/02-frontend-architecture.md (verified by tests/architecture).
const sameFeature = { feature: "{{from.element.captured.feature}}" };
const featureLayer = (type) => ({ to: { element: { type, captured: sameFeature } } });

const architecture = {
  files: ["src/**/*.{ts,tsx}"],
  plugins: { boundaries },
  settings: {
    "boundaries/elements": [
      { type: "domain", pattern: "src/features/(*)/domain", capture: ["feature"] },
      { type: "application", pattern: "src/features/(*)/application", capture: ["feature"] },
      { type: "infrastructure", pattern: "src/features/(*)/infrastructure", capture: ["feature"] },
      { type: "components", pattern: "src/features/(*)/components", capture: ["feature"] },
      // Feature root (index.ts = public API). Must come after the layer folders above.
      { type: "feature-public", pattern: "src/features/(*)", capture: ["feature"] },
      { type: "shared", pattern: "src/shared/(*)", capture: ["module"] },
      { type: "app", pattern: "src/app" },
      { type: "config", pattern: "src/config" },
    ],
  },
  rules: {
    "boundaries/dependencies": [
      2,
      {
        default: "disallow",
        checkAllOrigins: true,
        policies: [
          // Libraries (react, dexie, zod, …) and node core are fine everywhere except domain — see last policy.
          { allow: [{ to: { module: { origin: "{external,core}" } } }] },
          { from: { element: { type: "app" } }, allow: [{ to: { element: { types: { anyOf: ["app", "feature-public", "shared", "config"] } } } }] },
          { from: { element: { type: "feature-public" } }, allow: [featureLayer("domain"), featureLayer("application"), featureLayer("components")] },
          { from: { element: { type: "components" } }, allow: [featureLayer("components"), featureLayer("application"), featureLayer("domain"), { to: { element: { types: { anyOf: ["feature-public", "shared"] } } } }] },
          { from: { element: { type: "application" } }, allow: [featureLayer("application"), featureLayer("domain"), featureLayer("infrastructure"), { to: { element: { types: { anyOf: ["feature-public", "shared", "config"] } } } }] },
          { from: { element: { type: "infrastructure" } }, allow: [featureLayer("infrastructure"), featureLayer("domain"), { to: { element: { types: { anyOf: ["shared", "config"] } } } }] },
          { from: { element: { type: "domain" } }, allow: [featureLayer("domain"), { to: { element: { type: "shared", captured: { module: "{money,id}" } } } }] },
          { from: { element: { type: "shared" } }, allow: [{ to: { element: { types: { anyOf: ["shared", "config"] } } } }] },
          { from: { element: { type: "config" } }, allow: [{ to: { element: { type: "config" } } }] },
          // Domain is pure TypeScript: no framework, storage, or network libraries (ADR-002, AGENTS §5).
          { from: { element: { type: "domain" } }, disallow: [{ to: { module: { origin: "external" } } }] },
          // …except the test runner, so domain unit tests can sit next to the code they test.
          { from: { element: { type: "domain" } }, allow: [{ to: { module: { origin: "external", source: "vitest" } } }] },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  architecture,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-expect-error": "allow-with-description" }],
      "no-restricted-globals": ["error", { name: "alert", message: "Use a sonner toast." }, { name: "confirm", message: "Use a shadcn Dialog." }],
    },
  },
  globalIgnores(["public/sw.js", ".next/**", "out/**", "build/**", "coverage/**", "playwright-report/**", "next-env.d.ts", "src/shared/api/schema.d.ts"]),
]);

export default eslintConfig;
