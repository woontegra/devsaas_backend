import { describe, it, expect } from "vitest";
import { resolveCanSaveCalculation } from "../services/subscriptionAccessService.js";
import {
  assertClientInputHashMatches,
  extractPlaintiffDisplayName,
  SavedCalculationError,
} from "../services/savedCalculationService.js";
import { CALCULATION_SCHEMA_VERSION } from "../calculations/types.js";
import type { TrafficInjuryDraft } from "../calculations/types.js";

const minimalDraft: TrafficInjuryDraft = {
  schemaVersion: CALCULATION_SCHEMA_VERSION,
  calculationType: "TRAFFIC_INJURY",
  common: { eventDate: "2022-01-01", calculationDate: "2026-08-28", internalFileName: "Dosya-1" },
  parties: {
    plaintiff: { firstName: "Ali", lastName: "Veli", birthDate: "1990-01-01", gender: "MALE" },
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
};

describe("resolveCanSaveCalculation", () => {
  it("tek hesap (starter) planında kayıt izni vermez", () => {
    expect(
      resolveCanSaveCalculation({
        plan: "starter",
        subscriptionActive: true,
        isAdmin: false,
        isDevelopmentAccess: false,
      })
    ).toBe(false);
  });

  it("single planında kayıt izni vermez", () => {
    expect(
      resolveCanSaveCalculation({
        plan: "single",
        subscriptionActive: true,
        isAdmin: false,
        isDevelopmentAccess: false,
      })
    ).toBe(false);
  });

  it("monthly/yıllık abonelik planlarında kayıt izni verir", () => {
    for (const plan of ["monthly", "yearly", "pro"]) {
      expect(
        resolveCanSaveCalculation({
          plan,
          subscriptionActive: true,
          isAdmin: false,
          isDevelopmentAccess: false,
        })
      ).toBe(true);
    }
  });

  it("admin ve development erişiminde kayıt izni verir", () => {
    expect(
      resolveCanSaveCalculation({
        plan: "starter",
        subscriptionActive: true,
        isAdmin: true,
        isDevelopmentAccess: false,
      })
    ).toBe(true);

    expect(
      resolveCanSaveCalculation({
        plan: "starter",
        subscriptionActive: false,
        isAdmin: false,
        isDevelopmentAccess: true,
      })
    ).toBe(true);
  });

  it("abonelik süresi dolmuşsa kayıt izni vermez", () => {
    expect(
      resolveCanSaveCalculation({
        plan: "monthly",
        subscriptionActive: false,
        isAdmin: false,
        isDevelopmentAccess: false,
      })
    ).toBe(false);
  });
});

describe("assertClientInputHashMatches", () => {
  it("eşleşen hash kabul edilir", () => {
    expect(() => assertClientInputHashMatches("abc", "abc")).not.toThrow();
  });

  it("farklı hash INPUT_HASH_MISMATCH fırlatır", () => {
    expect(() => assertClientInputHashMatches("old", "new")).toThrow(SavedCalculationError);
    try {
      assertClientInputHashMatches("old", "new");
    } catch (e) {
      expect(e).toBeInstanceOf(SavedCalculationError);
      expect((e as SavedCalculationError).code).toBe("INPUT_HASH_MISMATCH");
      expect((e as SavedCalculationError).status).toBe(409);
    }
  });
});

describe("extractPlaintiffDisplayName", () => {
  it("davacı adını birleştirir", () => {
    expect(extractPlaintiffDisplayName(minimalDraft)).toBe("Ali Veli");
  });
});
