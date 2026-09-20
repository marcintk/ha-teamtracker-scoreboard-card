import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");

describe("git hooks wiring (issue #176)", () => {
  it("has an executable .githooks/pre-push that runs the coverage gate", () => {
    const hookPath = path.join(root, ".githooks", "pre-push");
    const stat = statSync(hookPath);
    expect(stat.mode & 0o111).toBeTruthy();
    const content = readFileSync(hookPath, "utf8");
    expect(content).toContain("npm run test:coverage");
  });

  it("has an executable .githooks/pre-commit that runs check + typecheck and blocks main", () => {
    const hookPath = path.join(root, ".githooks", "pre-commit");
    const stat = statSync(hookPath);
    expect(stat.mode & 0o111).toBeTruthy();
    const content = readFileSync(hookPath, "utf8");
    expect(content).toContain("npm run check");
    expect(content).toContain("npm run typecheck");
    expect(content).toContain("git rev-parse --abbrev-ref HEAD");
    expect(content).toContain("main");
  });

  it("wires package.json prepare script to point git at .githooks", () => {
    const pkgPath = path.join(root, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
    expect(pkg.scripts.prepare).toContain("git config core.hooksPath .githooks");
  });
});
