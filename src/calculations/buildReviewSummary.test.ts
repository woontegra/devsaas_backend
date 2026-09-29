import { describe, it, expect } from "vitest";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";
import type { TrafficInjuryDraft, TrafficDeathDraft } from "./types.js";
import { buildCalculationReviewSummary, buildCalculationReviewSummaryForDraft } from "./buildReviewSummary.js";
import { CALCULATION_HASH_VERSION } from "./hash/calculationHashVersion.js";

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
    disability: { permanentDisabilityRate: 27, disabilityStartDate: "2022-01-08" },
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
    expect(res.calculationHashVersion).toBe(CALCULATION_HASH_VERSION);
    expect(res.summary.calculationType).toBe("TRAFFIC_INJURY");
    if (res.summary.calculationType !== "TRAFFIC_INJURY") return;
    expect(res.summary.plaintiffName).toBe("Ali Veli");
    expect(res.summary.permanentDisabilityRate).toBe(27);
    expect(JSON.stringify(res)).not.toMatch(/totalDamage|finalCompensation|periodDamage/i);
  });

  it("TRAFFIC_DEATH özetinde çalışma durumu ve gelir alanları döner", () => {
    const draft: TrafficDeathDraft = {
      schemaVersion: CALCULATION_SCHEMA_VERSION,
      calculationType: "TRAFFIC_DEATH",
      common: { eventDate: "2020-06-01", calculationDate: "2024-01-15" },
      deceased: {
        birthDate: "1970-01-01",
        deathDate: "2020-06-01",
        gender: "male",
        fullName: "Ahmet",
      },
      employmentStatus: "NOT_WORKING",
      accidentIncome: { incomeMode: "minWage", fixedAmount: null, averageSources: [] },
      nonWorkingSelectedIncome: 9000,
      incomePeriods: [],
      beneficiaries: [],
      supportRelations: [],
      liability: { injuredFaultRatio: 0, parties: [] },
      deathExpenses: { otherExpenses: [] },
      priorPayments: [],
      insurance: {},
    };
    const res = buildCalculationReviewSummaryForDraft(draft);
    expect(res.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(res.summary.calculationType).toBe("TRAFFIC_DEATH");
    if (res.summary.calculationType !== "TRAFFIC_DEATH") return;
    expect(res.summary.employmentStatusLabel).toBe("Çalışmıyor");
    expect(res.summary.nonWorkingSelectedIncome).toBe(9000);
    expect(res.summary.plaintiffBeneficiaryCount).toBe(0);
    expect(res.summary.outOfCaseBeneficiaryCount).toBe(0);
    expect(res.summary.referenceMinWageAtEvent).not.toBeNull();
  });
});
