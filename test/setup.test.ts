import { describe, expect, it } from "vitest";

describe("global test setup", () => {
  it("provides a global matchMedia stub without any test-local stubbing", () => {
    expect(typeof window.matchMedia).toBe("function");
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    expect(mql).toHaveProperty("matches");
    expect(typeof mql.addEventListener).toBe("function");
    expect(typeof mql.removeEventListener).toBe("function");
  });
});
