import { describe, it, expect } from "vitest";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";
import type { TrafficInjuryDraft } from "../types.js";
import type { TrafficInjuryDraft } from "./types.js";
import { buildCalculationReviewSummary } from "./buildReviewSummary.js";

function sampleDraft(): TrafficInjuryDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_INJURY",
    common: { eventDate: "2022-01-01", calculationDate: "2026-08-28" },
    parties: {
      plaintiff: { firstName: "Ali", lastName: "Veli", birthDate: "1990-01-01", gender: "MALE" },
      defendants: [],
    },
    liability: { injuredFaultRatio: 10, parties: [] },
    disability: { permanentDisabilityRate: 27, disabilityStartDate: "2022-07-01" },
    temporaryIncapacityPeriods: [{ id: "t1", startDate: "2022-01-01", endDate: "2022-01-07" }],
    accidentIncome: { incomeMode: "fixed", fixedAmount: 30000, averageSources: [] },
    hospitalExpenses: [],
    travelExpenses: [],
    caregiverExpenses: [],
    capitalValueDocuments: [],
    zmtsPayments: [],
    cascoPayments: [],
  };
}

describe("buildCalculationReviewSummary", () => {
  it("inputHash ve özet döner; parasal motor alanı yok", () => {
    const res = buildCalculationReviewSummary(sampleDraft());
    expect(res.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(res.calculationHashVersion).toBe(1);
    expect(res.summary.calculationType).toBe("TRAFFIC_INJURY");
    if (res.summary.calculationType !== "TRAFFIC_INJURY") return;
    expect(res.summary.plaintiffName).toBe("Ali Veli");
    expect(res.summary.permanentDisabilityRate).toBe(27);
    expect(JSON.stringify(res)).not.toMatch(/totalDamage|finalCompensation|periodDamage/i);
  });
});
