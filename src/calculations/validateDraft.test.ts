import { describe, it, expect } from "vitest";
import { validateCalculationDraft } from "./validateDraft.js";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";

function baseTrafficInjury() {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_INJURY" as const,
    common: { eventDate: "2020-06-01", calculationDate: "2024-01-15" },
    parties: {
      plaintiff: {
        firstName: "Ali",
        lastName: "Veli",
        birthDate: "1985-03-10",
        gender: "MALE" as const,
      },
      defendants: [
        {
          id: "d1",
          type: "INDIVIDUAL_DRIVER" as const,
          firstName: "Mehmet",
          lastName: "Kaya",
        },
      ],
    },
    liability: {
      injuredFaultRatio: 20,
      parties: [{ id: "d1", partyType: "defendant" as const, name: "Gerçek Kişi Şoför", faultRatio: 80 }],
    },
    disability: { permanentDisabilityRate: 35, disabilityStartDate: "2020-09-01" },
    temporaryIncapacityPeriods: [
      { id: "t1", startDate: "2020-06-01", endDate: "2020-09-01", dayCount: 93 },
    ],
    accidentIncome: { fixedAmount: 15000, useAverage: false, averageSources: [] },
    hospitalExpenses: [],
    travelExpenses: [],
    caregiverExpenses: [],
  };
}

const MONETARY_KEYS = [
  "total",
  "result",
  "compensation",
  "presentValue",
  "activePeriodValue",
  "passivePeriodValue",
  "yearlyTable",
  "lifeExpectancyAmount",
  "supportAmount",
  "disabilityAmount",
  "estimatedAmount",
  "approximateAmount",
];

describe("validateCalculationDraft (phase 1.5 model)", () => {
  it("returns valid for a complete traffic injury draft", () => {
    const res = validateCalculationDraft(baseTrafficInjury());
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.schemaVersion).toBe(2);
  });

  it("errors when birthDate is missing", () => {
    const draft = baseTrafficInjury();
    draft.parties.plaintiff.birthDate = "";
    const res = validateCalculationDraft(draft);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field.includes("birthDate") || e.code === "REQUIRED")).toBe(true);
  });

  it("errors when birthDate is on or after eventDate", () => {
    const draft = baseTrafficInjury();
    draft.parties.plaintiff.birthDate = "2021-01-01";
    const res = validateCalculationDraft(draft);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === "INVALID_DATE_ORDER")).toBe(true);
  });

  it("errors when eventDate is after calculationDate", () => {
    const draft = baseTrafficInjury();
    draft.common.eventDate = "2025-01-01";
    draft.common.calculationDate = "2024-01-01";
    const res = validateCalculationDraft(draft);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === "EVENT_AFTER_CALCULATION")).toBe(true);
  });

  it("errors when fault ratio is out of 0-100", () => {
    const draft = baseTrafficInjury();
    draft.liability.injuredFaultRatio = 150;
    const res = validateCalculationDraft(draft);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === "OUT_OF_RANGE")).toBe(true);
  });

  it("errors on negative fixed income amount", () => {
    const draft = baseTrafficInjury();
    draft.accidentIncome.fixedAmount = -100;
    const res = validateCalculationDraft(draft);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === "NEGATIVE_AMOUNT")).toBe(true);
  });

  it("requires net amount when average income is gross", () => {
    const draft = baseTrafficInjury();
    draft.accidentIncome = {
      fixedAmount: null,
      useAverage: true,
      averageSources: [
        {
          id: "a1",
          kind: "min_wage",
          amountKind: "gross",
          amount: 20000,
        },
      ],
    };
    const res = validateCalculationDraft(draft);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field.includes("netAmount"))).toBe(true);
  });

  it("warns when fault ratios do not sum to 100", () => {
    const draft = baseTrafficInjury();
    draft.liability.injuredFaultRatio = 10;
    draft.liability.parties[0]!.faultRatio = 50;
    const res = validateCalculationDraft(draft);
    expect(res.warnings.some((w) => w.code === "FAULT_SUM_NOT_100")).toBe(true);
  });

  it("response never contains monetary result keys", () => {
    const res = validateCalculationDraft(baseTrafficInjury());
    const json = JSON.stringify(res);
    for (const k of MONETARY_KEYS) {
      expect(json).not.toContain(`"${k}"`);
    }
  });
});
