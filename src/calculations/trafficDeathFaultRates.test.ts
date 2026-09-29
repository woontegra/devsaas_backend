import { describe, expect, it } from "vitest";
import { validateCalculationDraft } from "./validateDraft.js";
import { blocksTrafficDeathSupportPeriods } from "./validateTrafficDeath.js";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";
import type { TrafficDeathDraft } from "./types.js";
import { coerceResponsibleParties, trafficDeathFaultSum } from "./trafficDeathFaultRates.js";

const common = {
  eventDate: "2020-06-01",
  calculationDate: "2024-01-15",
};

function baseDeath(over: Partial<TrafficDeathDraft> = {}): TrafficDeathDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_DEATH",
    common: { ...common },
    deceased: {
      birthDate: "1970-01-01",
      deathDate: "2020-06-01",
      gender: "male",
      fullName: "Tanyol Ergin",
    },
    employmentStatus: "WORKING",
    accidentIncome: { incomeMode: "fixed", fixedAmount: 10000, averageSources: [] },
    nonWorkingSelectedIncome: null,
    incomePeriods: [],
    beneficiaries: [
      {
        id: "c1",
        fullName: "Yüksel Ergin",
        relation: "spouse",
        birthDate: "1975-01-01",
        gender: "female",
        claimantStatus: "PLAINTIFF",
      },
      {
        id: "c2",
        fullName: "Ebru Aydın",
        relation: "child",
        birthDate: "2000-05-20",
        gender: "female",
        claimantStatus: "PLAINTIFF",
      },
    ],
    supportRelations: [],
    liability: { injuredFaultRatio: 0, parties: [] },
    deceasedFaultRate: 20,
    responsibleParties: [
      { id: "d1", type: "INDIVIDUAL_DRIVER", faultRatio: 60 },
      { id: "o1", type: "INDIVIDUAL_VEHICLE_OWNER", faultRatio: 20 },
    ],
    externalFaultRate: 0,
    deathExpenses: { otherExpenses: [] },
    priorPayments: [],
    insurance: {},
    ...over,
  };
}

describe("TRAFFIC_DEATH deceased + responsible fault rates", () => {
  it("1) claimants are not used for fault sum", () => {
    const draft = baseDeath({
      claimantFaultRates: { c1: 40, c2: 40 },
    });
    expect(trafficDeathFaultSum(draft.deceasedFaultRate, draft.responsibleParties, draft.externalFaultRate)).toBe(100);
    const res = validateCalculationDraft(draft);
    expect(res.warnings.some((w) => w.code === "FAULT_SUM_NOT_100")).toBe(false);
    expect(res.completedSections).toContain("liability");
    expect(res.errors.some((e) => e.field.startsWith("claimantFaultRates"))).toBe(false);
  });

  it("2) müteveffa + two sorumlular totaling 100 completes liability", () => {
    const res = validateCalculationDraft(baseDeath());
    expect(res.warnings.some((w) => w.code === "FAULT_SUM_NOT_100")).toBe(false);
    expect(res.completedSections).toContain("liability");
    expect(res.missingSections).not.toContain("liability");
  });

  it("6) total 90 produces warning and incomplete liability", () => {
    const res = validateCalculationDraft(baseDeath({ externalFaultRate: 0, deceasedFaultRate: 10 }));
    expect(res.warnings.some((w) => w.code === "FAULT_SUM_NOT_100")).toBe(true);
    expect(res.completedSections).not.toContain("liability");
    expect(res.missingSections).toContain("liability");
  });

  it("6) total 110 produces warning and incomplete liability", () => {
    const res = validateCalculationDraft(baseDeath({ externalFaultRate: 10 }));
    expect(res.warnings.some((w) => w.code === "FAULT_SUM_NOT_100")).toBe(true);
    expect(res.missingSections).toContain("liability");
  });

  it("rejects deceased, responsible or external rates outside 0–100", () => {
    const negative = validateCalculationDraft(baseDeath({ deceasedFaultRate: -1 }));
    expect(negative.errors.some((e) => e.field === "deceasedFaultRate" && e.code === "OUT_OF_RANGE")).toBe(true);

    const party = validateCalculationDraft(
      baseDeath({
        responsibleParties: [{ id: "d1", type: "INDIVIDUAL_DRIVER", faultRatio: 101 }],
      })
    );
    expect(
      party.errors.some((e) => e.field === "responsibleParties.d1.faultRatio" && e.code === "OUT_OF_RANGE")
    ).toBe(true);

    const over = validateCalculationDraft(baseDeath({ externalFaultRate: 101 }));
    expect(over.errors.some((e) => e.field === "externalFaultRate" && e.code === "OUT_OF_RANGE")).toBe(true);
  });

  it("8) coerce ignores claimant-shaped rows and insurer types", () => {
    const coerced = coerceResponsibleParties([
      { id: "c1", type: "spouse", faultRatio: 40 },
      { id: "zmts", type: "COMPULSORY_TRAFFIC_INSURER", faultRatio: 10 },
      { id: "d1", type: "INDIVIDUAL_DRIVER", faultRatio: 60 },
      { id: "corp", type: "CORPORATE_VEHICLE_OWNER", faultRatio: 20 },
      { id: "own", type: "INDIVIDUAL_VEHICLE_OWNER", faultRatio: 20 },
    ]);
    expect(coerced.map((p) => p.type)).toEqual([
      "INDIVIDUAL_DRIVER",
      "CORPORATE_VEHICLE_OWNER",
      "INDIVIDUAL_VEHICLE_OWNER",
    ]);
  });

  it("incomplete fault sum does not block support-periods computation", () => {
    const res = validateCalculationDraft(baseDeath({ deceasedFaultRate: 10 }));
    expect(res.valid).toBe(false);
    expect(res.missingSections).toContain("liability");
    expect(blocksTrafficDeathSupportPeriods(res)).toBe(false);
  });
});
