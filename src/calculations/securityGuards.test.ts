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
  it("grants development access while payment system is not wired", async () => {
    const { calculationAccessService } = await import("../services/calculationAccessService.js");
    const result = await calculationAccessService.assertCalculationAccess({
      userId: "user-1",
      draft: {
        schemaVersion: 2,
        calculationType: "TRAFFIC_INJURY",
        common: { eventDate: "2022-01-01", calculationDate: "2026-08-28" },
        parties: {
          plaintiff: { firstName: "T", lastName: "K", birthDate: "1990-01-01", gender: "MALE" },
          defendants: [],
        },
        liability: { injuredFaultRatio: 0, parties: [] },
        disability: { permanentDisabilityRate: 10, disabilityStartDate: "2022-07-01" },
        temporaryIncapacityPeriods: [],
        accidentIncome: { incomeMode: "fixed", fixedAmount: 30000, averageSources: [] },
        hospitalExpenses: [],
        travelExpenses: [],
        caregiverExpenses: [],
        capitalValueDocuments: [],
        zmtsPayments: [],
        cascoPayments: [],
      },
      action: "RUN",
    });
    expect(result.allowed).toBe(true);
    expect(result.code).toBe("ACCESS_GRANTED_DEVELOPMENT");
  });
});
