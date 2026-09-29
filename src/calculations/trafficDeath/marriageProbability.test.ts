import { describe, expect, it } from "vitest";
import { CALCULATION_SCHEMA_VERSION } from "../types.js";
import type { TrafficDeathDraft } from "../types.js";
import { resolveMarriageProbability } from "./marriageProbability.js";

function draft(over: Partial<TrafficDeathDraft> = {}): TrafficDeathDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_DEATH",
    common: { eventDate: "2020-06-01", calculationDate: "2024-01-15" },
    deceased: { birthDate: "1970-01-01", deathDate: "2020-06-01", gender: "male", fullName: "Ahmet" },
    employmentStatus: "WORKING",
    accidentIncome: { incomeMode: "fixed", fixedAmount: 9000, averageSources: [] },
    nonWorkingSelectedIncome: null,
    incomePeriods: [],
    beneficiaries: [
      {
        id: "sp",
        fullName: "Ayşe",
        relation: "spouse",
        birthDate: "1990-06-01",
        gender: "female",
        claimantStatus: "PLAINTIFF",
      },
    ],
    supportRelations: [],
    liability: { injuredFaultRatio: 0, parties: [] },
    deathExpenses: { otherExpenses: [] },
    priorPayments: [],
    insurance: {},
    ...over,
  };
}

describe("resolveMarriageProbability", () => {
  it("woman 31-35 with 0 children is 17%", () => {
    const result = resolveMarriageProbability(draft({ marriageProbabilityDeduction: { under18ChildCount: 0 } }));
    expect(result.spouseAgeRangeKey).toBe("31-35");
    expect(result.baseMarriageProbabilityRate).toBe(17);
    expect(result.finalMarriageProbabilityRate).toBe(17);
    expect(result.applied).toBe(true);
  });

  it("woman 31-35 with 2 children is 7%", () => {
    const result = resolveMarriageProbability(draft({ marriageProbabilityDeduction: { under18ChildCount: 2 } }));
    expect(result.childReductionRate).toBe(10);
    expect(result.finalMarriageProbabilityRate).toBe(7);
  });

  it("man 21-25 with 1 child is 66%", () => {
    const result = resolveMarriageProbability(
      draft({
        beneficiaries: [
          {
            id: "sp",
            fullName: "Ali",
            relation: "spouse",
            birthDate: "2000-01-01",
            gender: "male",
            claimantStatus: "PLAINTIFF",
          },
        ],
        marriageProbabilityDeduction: { under18ChildCount: 1 },
      })
    );
    expect(result.spouseAgeRangeKey).toBe("21-25");
    expect(result.baseMarriageProbabilityRate).toBe(71);
    expect(result.childReductionRate).toBe(5);
    expect(result.finalMarriageProbabilityRate).toBe(66);
  });

  it("does not go below 0", () => {
    const result = resolveMarriageProbability(
      draft({
        beneficiaries: [
          {
            id: "sp",
            fullName: "Ayşe",
            relation: "spouse",
            birthDate: "1975-01-01",
            gender: "female",
            claimantStatus: "PLAINTIFF",
          },
        ],
        marriageProbabilityDeduction: { under18ChildCount: 1 },
      })
    );
    expect(result.baseMarriageProbabilityRate).toBe(2);
    expect(result.finalMarriageProbabilityRate).toBe(0);
    expect(result.applied).toBe(true);
  });

  it("skips the deduction when there is no spouse", () => {
    const result = resolveMarriageProbability(draft({ beneficiaries: [] }));
    expect(result.applied).toBe(false);
    expect(result.status).toBe("NO_SPOUSE");
    expect(result.finalMarriageProbabilityRate).toBe(0);
  });

  it("uses rate 0 outside the table", () => {
    const young = resolveMarriageProbability(
      draft({
        beneficiaries: [
          {
            id: "sp",
            fullName: "Genç",
            relation: "spouse",
            birthDate: "2010-01-01",
            gender: "female",
            claimantStatus: "PLAINTIFF",
          },
        ],
      })
    );
    expect(young.status).toBe("AGE_OUT_OF_RANGE");
    expect(young.applied).toBe(false);
    expect(young.finalMarriageProbabilityRate).toBe(0);
    expect(young.infoMessage).toContain("uygulanmamaktadır");
  });

  it("asks for gender instead of guessing a rate", () => {
    const result = resolveMarriageProbability(
      draft({
        beneficiaries: [
          {
            id: "sp",
            fullName: "Ayşe",
            relation: "spouse",
            birthDate: "1990-06-01",
            gender: "" as TrafficDeathDraft["beneficiaries"][number]["gender"],
            claimantStatus: "PLAINTIFF",
          },
        ],
      })
    );
    expect(result.status).toBe("MISSING_GENDER");
    expect(result.applied).toBe(false);
    expect(result.finalMarriageProbabilityRate).toBe(0);
  });
});
