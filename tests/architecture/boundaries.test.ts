// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { ESLint } from "eslint";
import { afterEach, describe, expect, it } from "vitest";

// Lints a throwaway project with the real eslint.config.mjs so the layer rules
// in docs/architecture/02-frontend-architecture.md are proven, not assumed.
const CONFIG = resolve(__dirname, "../../eslint.config.mjs");
const TSCONFIG = JSON.stringify({ compilerOptions: { baseUrl: ".", paths: { "@/*": ["./src/*"] } } });

let projectDir: string | undefined;
const originalCwd = process.cwd();

afterEach(() => {
  process.chdir(originalCwd);
  if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  projectDir = undefined;
});

async function boundaryErrors(files: Record<string, string>, target: string): Promise<string[]> {
  projectDir = mkdtempSync(join(tmpdir(), "poslite-arch-"));
  writeFileSync(join(projectDir, "tsconfig.json"), TSCONFIG);
  // A real installed package, so it is classified as an external module.
  mkdirSync(join(projectDir, "node_modules/dexie"), { recursive: true });
  writeFileSync(join(projectDir, "node_modules/dexie/package.json"), '{"name":"dexie","main":"index.js"}');
  writeFileSync(join(projectDir, "node_modules/dexie/index.js"), "module.exports = {};\n");
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(projectDir, path)), { recursive: true });
    writeFileSync(join(projectDir, path), content);
  }
  // The TypeScript import resolver reads tsconfig.json from process.cwd(), not ESLint's cwd.
  process.chdir(projectDir);
  const eslint = new ESLint({ cwd: projectDir, overrideConfigFile: CONFIG });
  const [result] = await eslint.lintFiles([target]);
  return (result?.messages ?? []).filter((m) => m.ruleId?.startsWith("boundaries/")).map((m) => m.message);
}

const leaf = "export const x = 1;\n";

describe("frontend layer boundaries", () => {
  it("allows a component to use its own feature's application layer", async () => {
    const errors = await boundaryErrors(
      {
        "src/features/cart/application/use-cart.ts": leaf,
        "src/features/cart/components/CartPanel.tsx": 'import { x } from "../application/use-cart";\nexport const y = x;\n',
      },
      "src/features/cart/components/CartPanel.tsx",
    );
    expect(errors).toEqual([]);
  });

  it("rejects domain importing the application layer", async () => {
    const errors = await boundaryErrors(
      {
        "src/features/cart/application/use-cart.ts": leaf,
        "src/features/cart/domain/cart.ts": 'import { x } from "../application/use-cart";\nexport const y = x;\n',
      },
      "src/features/cart/domain/cart.ts",
    );
    expect(errors).toHaveLength(1);
  });

  it("rejects domain importing an external library", async () => {
    const errors = await boundaryErrors(
      { "src/features/cart/domain/cart.ts": 'import Dexie from "dexie";\nexport const y = Dexie;\n' },
      "src/features/cart/domain/cart.ts",
    );
    expect(errors).toHaveLength(1);
  });

  it("allows domain to use shared money but not shared db", async () => {
    const files = {
      "src/shared/money/index.ts": leaf,
      "src/shared/db/index.ts": leaf,
      "src/features/cart/domain/ok.ts": 'import { x } from "@/shared/money";\nexport const y = x;\n',
      "src/features/cart/domain/bad.ts": 'import { x } from "@/shared/db";\nexport const y = x;\n',
    };
    expect(await boundaryErrors(files, "src/features/cart/domain/ok.ts")).toEqual([]);
    expect(await boundaryErrors(files, "src/features/cart/domain/bad.ts")).toHaveLength(1);
  });

  it("rejects importing another feature's internals but allows its public index", async () => {
    const files = {
      "src/features/catalog/domain/product.ts": leaf,
      "src/features/catalog/index.ts": 'export { x } from "./domain/product";\n',
      "src/features/cart/application/bad.ts": 'import { x } from "@/features/catalog/domain/product";\nexport const y = x;\n',
      "src/features/cart/application/ok.ts": 'import { x } from "@/features/catalog";\nexport const y = x;\n',
    };
    expect(await boundaryErrors(files, "src/features/cart/application/bad.ts")).toHaveLength(1);
    expect(await boundaryErrors(files, "src/features/cart/application/ok.ts")).toEqual([]);
  });
});
