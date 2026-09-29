import { describe, it, expect } from "vitest";
import { validateCalculationDraft } from "./validateDraft.js";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";
import { calculateTrafficInjury } from "./trafficInjury/calculateTrafficInjury.js";
import {
  DISABILITY_START_DATE_REQUIRED,
  DISABILITY_START_DATE_REQUIRED_MESSAGE,
  DisabilityStartDateRequiredError,
} from "./disabilityStartDateValidation.js";

function baseDraft(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_INJURY" as const,
    common: { eventDate: "2022-09-01", calculationDate: "2024-09-01" },
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
    disability: { permanentDisabilityRate: 20, disabilityStartDate: "2023-01-20" },
    temporaryIncapacityPeriods: [
      { id: "t1", startDate: "2022-09-01", endDate: "2022-12-12" },
      { id: "t2", startDate: "2022-12-13", endDate: "2023-01-19" },
    ],
    accidentIncome: { incomeMode: "fixed" as const, fixedAmount: 30000, averageSources: [] },
    hospitalExpenses: [],
    travelExpenses: [],
    caregiverExpenses: [],
    capitalValueDocuments: [],
    zmtsPayments: [],
    cascoPayments: [],
    ...over,
  };
}

describe("disabilityStartDateValidation", () => {
  it("1) rate=20, disabilityStartDate='' → DISABILITY_START_DATE_REQUIRED", () => {
    const res = validateCalculationDraft(
      baseDraft({
        disability: { permanentDisabilityRate: 20, disabilityStartDate: "" },
      })
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === DISABILITY_START_DATE_REQUIRED)).toBe(true);
    expect(
      res.errors.some(
        (e) =>
          e.code === DISABILITY_START_DATE_REQUIRED &&
          e.message === DISABILITY_START_DATE_REQUIRED_MESSAGE
      )
    ).toBe(true);
  });

  it("2) rate=20, disabilityStartDate null/undefined → hata", () => {
    const withoutDate = validateCalculationDraft(
      baseDraft({
        disability: { permanentDisabilityRate: 20 },
      })
    );
    expect(withoutDate.valid).toBe(false);
    expect(withoutDate.errors.some((e) => e.code === DISABILITY_START_DATE_REQUIRED)).toBe(true);

    const explicitNull = validateCalculationDraft(
      baseDraft({
        disability: { permanentDisabilityRate: 20, disabilityStartDate: null },
      })
    );
    expect(explicitNull.valid).toBe(false);
    expect(explicitNull.errors.some((e) => e.code === DISABILITY_START_DATE_REQUIRED)).toBe(true);
  });

  it("3) rate=20, geçerli disabilityStartDate → validation devam eder", () => {
    const res = validateCalculationDraft(baseDraft());
    expect(res.errors.some((e) => e.code === DISABILITY_START_DATE_REQUIRED)).toBe(false);
  });

  it("4) boş disabilityStartDate ile validation → run engellenir", () => {
    const res = validateCalculationDraft(
      baseDraft({
        disability: { permanentDisabilityRate: 20, disabilityStartDate: "" },
      })
    );
    expect(res.valid).toBe(false);
  });

  it("5) boş disabilityStartDate ile report validation → engellenir", () => {
    const res = validateCalculationDraft(
      baseDraft({
        disability: { permanentDisabilityRate: 20, disabilityStartDate: undefined },
      })
    );
    expect(res.valid).toBe(false);
  });

  it("6) motor doğrudan çağrılsa bile boş disabilityStartDate için fallback kullanmaz", () => {
    expect(() =>
      calculateTrafficInjury(
        baseDraft({
          disability: { permanentDisabilityRate: 20, disabilityStartDate: "" },
        }) as never
      )
    ).toThrow(DisabilityStartDateRequiredError);
  });

  it("rate=0 iken disabilityStartDate zorunlu değil", () => {
    const res = validateCalculationDraft(
      baseDraft({
        disability: { permanentDisabilityRate: 0, disabilityStartDate: "" },
        temporaryIncapacityPeriods: [],
      })
    );
    expect(res.errors.some((e) => e.code === DISABILITY_START_DATE_REQUIRED)).toBe(false);
    expect(() =>
      calculateTrafficInjury(
        baseDraft({
          disability: { permanentDisabilityRate: 0, disabilityStartDate: "" },
          temporaryIncapacityPeriods: [],
        }) as never
      )
    ).not.toThrow();
  });
});
