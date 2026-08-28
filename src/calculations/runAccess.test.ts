import { describe, it, expect } from "vitest";
import { CALCULATION_SCHEMA_VERSION } from "../calculations/types.js";
import { calculationAccessService } from "../services/calculationAccessService.js";

const minimalDraft = {
  schemaVersion: CALCULATION_SCHEMA_VERSION,
  calculationType: "TRAFFIC_INJURY" as const,
  common: { eventDate: "2022-01-01", calculationDate: "2026-08-28" },
  parties: {
    plaintiff: { firstName: "T", lastName: "K", birthDate: "1990-01-01", gender: "MALE" as const },
    defendants: [],
  },
  liability: { injuredFaultRatio: 0, parties: [] },
  disability: { permanentDisabilityRate: 10, disabilityStartDate: "2022-07-01" },
  temporaryIncapacityPeriods: [],
  accidentIncome: { incomeMode: "fixed" as const, fixedAmount: 30000, averageSources: [] },
  hospitalExpenses: [],
  travelExpenses: [],
  caregiverExpenses: [],
  capitalValueDocuments: [],
  zmtsPayments: [],
  cascoPayments: [],
};

describe("assertCalculationAccess", () => {
  it("development ortamında ACCESS_GRANTED_DEVELOPMENT döner", async () => {
    const decision = await calculationAccessService.assertCalculationAccess({
      userId: "user-1",
      draft: minimalDraft,
      action: "RUN",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe("ACCESS_GRANTED_DEVELOPMENT");
    expect(decision.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(decision.calculationHashVersion).toBe(1);
  });

  it("RUN ve REPORT aynı inputHash üretir", async () => {
    const run = await calculationAccessService.assertCalculationAccess({
      userId: "user-1",
      draft: minimalDraft,
      action: "RUN",
    });
    const report = await calculationAccessService.assertCalculationAccess({
      userId: "user-1",
      draft: minimalDraft,
      action: "REPORT",
    });
    expect(run.inputHash).toBe(report.inputHash);
  });
});
