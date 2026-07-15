import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("legacy calculation env guard", () => {
  const original = process.env.ENABLE_LEGACY_CALCULATION;

  afterEach(() => {
    if (original === undefined) delete process.env.ENABLE_LEGACY_CALCULATION;
    else process.env.ENABLE_LEGACY_CALCULATION = original;
  });

  it("defaults to disabled when env is undefined", () => {
    delete process.env.ENABLE_LEGACY_CALCULATION;
    expect(process.env.ENABLE_LEGACY_CALCULATION === "true").toBe(false);
  });

  it("is enabled only when explicitly true", () => {
    process.env.ENABLE_LEGACY_CALCULATION = "true";
    expect(process.env.ENABLE_LEGACY_CALCULATION === "true").toBe(true);
    process.env.ENABLE_LEGACY_CALCULATION = "false";
    expect(process.env.ENABLE_LEGACY_CALCULATION === "true").toBe(false);
  });
});

describe("JWT secret production safety", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("throws in production when JWT_SECRET is missing", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.JWT_SECRET;
    vi.resetModules();
    const { resolveJwtSecret } = await import("../middleware/authMiddleware.js");
    expect(() => resolveJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it("throws in production when JWT_SECRET is the insecure default string", async () => {
    process.env.NODE_ENV = "production";
    process.env.JWT_SECRET = "change-me-in-production";
    vi.resetModules();
    const { resolveJwtSecret } = await import("../middleware/authMiddleware.js");
    expect(() => resolveJwtSecret()).toThrow(/JWT_SECRET/);
  });

  it("allows development fallback with warning", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.JWT_SECRET;
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { resolveJwtSecret } = await import("../middleware/authMiddleware.js");
    const secret = resolveJwtSecret();
    expect(secret.length).toBeGreaterThan(10);
    expect(secret).not.toBe("change-me-in-production");
    warn.mockRestore();
  });
});

describe("CalculationAccessService", () => {
  it("denies access by default (no payment system yet)", async () => {
    const { calculationAccessService } = await import("../services/calculationAccessService.js");
    const result = await calculationAccessService.hasCalculationAccess("user-1");
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("CALCULATION_ACCESS_REQUIRED");
  });
});
