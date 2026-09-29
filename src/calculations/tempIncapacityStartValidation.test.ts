import { describe, it, expect } from "vitest";
import { validateCalculationDraft } from "./validateDraft.js";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";
import {
  TEMP_INCAPACITY_START_MUST_MATCH_EVENT_DATE,
  TEMP_INCAPACITY_START_MUST_MATCH_EVENT_DATE_MESSAGE,
  findFirstTemporaryIncapacityStart,
} from "./tempIncapacityStartValidation.js";

function baseDraft(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_INJURY" as const,
    common: { eventDate: "2022-09-01", calculationDate: "2024-01-15" },
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
      parties: [{ id: "d1", partyType: "defendant" as const, name: "Mehmet Kaya", faultRatio: 80 }],
    },
    disability: { permanentDisabilityRate: 35, disabilityStartDate: "2022-12-13" },
    temporaryIncapacityPeriods: [
      { id: "t1", startDate: "2022-09-01", endDate: "2022-12-12" },
      { id: "t2", startDate: "2022-10-15", endDate: "2022-11-01" },
    ],
    accidentIncome: { incomeMode: "fixed" as const, fixedAmount: 15000, averageSources: [] },
    hospitalExpenses: [],
    travelExpenses: [],
    caregiverExpenses: [],
    capitalValueDocuments: [],
    zmtsPayments: [],
    cascoPayments: [],
    ...over,
  };
}

describe("tempIncapacityStartValidation", () => {
  it("A) kaza 01.09.2022, ilk geçici İG başlangıç 01.09.2022 → geçerli", () => {
    const res = validateCalculationDraft(baseDraft());
    expect(res.errors.filter((e) => e.code === TEMP_INCAPACITY_START_MUST_MATCH_EVENT_DATE)).toHaveLength(
      0
    );
  });

  it("B) kaza 01.09.2022, başlangıç 02.09.2022 → ERROR + doğru mesaj", () => {
    const res = validateCalculationDraft(
      baseDraft({
        temporaryIncapacityPeriods: [
          { id: "t1", startDate: "2022-09-02", endDate: "2022-12-12" },
        ],
      })
    );
    expect(res.valid).toBe(false);
    const errs = res.errors.filter((e) => e.code === TEMP_INCAPACITY_START_MUST_MATCH_EVENT_DATE);
    expect(errs.length).toBeGreaterThan(0);
    expect(errs.every((e) => e.message === TEMP_INCAPACITY_START_MUST_MATCH_EVENT_DATE_MESSAGE)).toBe(
      true
    );
  });

  it("C) kaza 01.09.2022, başlangıç 31.08.2022 → ERROR + doğru mesaj", () => {
    const res = validateCalculationDraft(
      baseDraft({
        temporaryIncapacityPeriods: [
          { id: "t1", startDate: "2022-08-31", endDate: "2022-12-12" },
        ],
      })
    );
    expect(res.valid).toBe(false);
    expect(
      res.errors.some(
        (e) =>
          e.code === TEMP_INCAPACITY_START_MUST_MATCH_EVENT_DATE &&
          e.message === TEMP_INCAPACITY_START_MUST_MATCH_EVENT_DATE_MESSAGE
      )
    ).toBe(true);
  });

  it("D) geçici İG yok → kural uygulanmaz", () => {
    const res = validateCalculationDraft(
      baseDraft({
        temporaryIncapacityPeriods: [],
      })
    );
    expect(res.errors.filter((e) => e.code === TEMP_INCAPACITY_START_MUST_MATCH_EVENT_DATE)).toHaveLength(
      0
    );
  });

  it("çoklu dönemde kronolojik ilk başlangıç esas alınır", () => {
    const first = findFirstTemporaryIncapacityStart(baseDraft().temporaryIncapacityPeriods);
    expect(first?.startDate).toBe("2022-09-01");
    expect(first?.index).toBe(0);
  });
});
