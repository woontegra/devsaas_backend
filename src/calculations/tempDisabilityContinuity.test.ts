import { describe, it, expect } from "vitest";
import { validateCalculationDraft } from "./validateDraft.js";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";
import {
  TEMP_DISABILITY_GAP,
  TEMP_DISABILITY_GAP_MESSAGE,
  TEMP_DISABILITY_OVERLAP,
  TEMP_DISABILITY_OVERLAP_MESSAGE,
  findLastTemporaryIncapacityEnd,
} from "./tempDisabilityContinuity.js";

function baseDraft(over: Record<string, unknown> = {}) {
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
      parties: [{ id: "d1", partyType: "defendant" as const, name: "Mehmet Kaya", faultRatio: 80 }],
    },
    disability: { permanentDisabilityRate: 35, disabilityStartDate: "2022-12-13" },
    temporaryIncapacityPeriods: [
      { id: "t1", startDate: "2020-06-01", endDate: "2022-09-30" },
      { id: "t2", startDate: "2022-10-01", endDate: "2022-12-12" },
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

describe("tempDisabilityContinuity — validation", () => {
  it("A) bitiş 12.12.2022, başlangıç 13.12.2022 → geçerli", () => {
    const res = validateCalculationDraft(baseDraft());
    expect(res.valid).toBe(true);
    expect(res.errors.filter((e) => e.code === TEMP_DISABILITY_GAP)).toHaveLength(0);
    expect(res.errors.filter((e) => e.code === TEMP_DISABILITY_OVERLAP)).toHaveLength(0);
  });

  it("B) bitiş 12.12.2022, başlangıç 02.01.2023 → GAP mesajı", () => {
    const res = validateCalculationDraft(
      baseDraft({
        disability: { permanentDisabilityRate: 35, disabilityStartDate: "2023-01-02" },
      })
    );
    expect(res.valid).toBe(false);
    const gap = res.errors.filter((e) => e.code === TEMP_DISABILITY_GAP);
    expect(gap.length).toBeGreaterThan(0);
    expect(gap.every((e) => e.message === TEMP_DISABILITY_GAP_MESSAGE)).toBe(true);
  });

  it("C) bitiş 12.12.2022, başlangıç 10.12.2022 → OVERLAP mesajı", () => {
    const res = validateCalculationDraft(
      baseDraft({
        disability: { permanentDisabilityRate: 35, disabilityStartDate: "2022-12-10" },
      })
    );
    expect(res.valid).toBe(false);
    const overlap = res.errors.filter((e) => e.code === TEMP_DISABILITY_OVERLAP);
    expect(overlap.length).toBeGreaterThan(0);
    expect(overlap.every((e) => e.message === TEMP_DISABILITY_OVERLAP_MESSAGE)).toBe(true);
  });

  it("D) bitiş 12.12.2022, başlangıç 12.12.2022 → OVERLAP mesajı", () => {
    const res = validateCalculationDraft(
      baseDraft({
        disability: { permanentDisabilityRate: 35, disabilityStartDate: "2022-12-12" },
      })
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === TEMP_DISABILITY_OVERLAP)).toBe(true);
    expect(
      res.errors.some(
        (e) => e.code === TEMP_DISABILITY_OVERLAP && e.message === TEMP_DISABILITY_OVERLAP_MESSAGE
      )
    ).toBe(true);
  });

  it("birden fazla dönem — son bitiş 12.12.2022 esas alınır", () => {
    const last = findLastTemporaryIncapacityEnd(baseDraft().temporaryIncapacityPeriods);
    expect(last?.endDate).toBe("2022-12-12");
  });

  it("geçici İG yok → kural uygulanmaz", () => {
    const res = validateCalculationDraft(
      baseDraft({
        temporaryIncapacityPeriods: [],
        disability: { permanentDisabilityRate: 35, disabilityStartDate: "2023-05-01" },
      })
    );
    expect(res.errors.filter((e) => e.code === TEMP_DISABILITY_GAP)).toHaveLength(0);
    expect(res.errors.filter((e) => e.code === TEMP_DISABILITY_OVERLAP)).toHaveLength(0);
  });
});
