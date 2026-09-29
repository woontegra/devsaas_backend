import { describe, it, expect } from "vitest";
import { validateCalculationDraft } from "./validateDraft.js";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";
import { calculateTrafficInjury } from "./trafficInjury/calculateTrafficInjury.js";
import { calculateTemporaryIncapacity } from "./trafficInjury/calculateTemporaryIncapacity.js";
import { buildProcessedWindow } from "./trafficInjury/buildProcessedPeriods.js";
import { resolveIncome } from "./trafficInjury/resolveIncome.js";
import {
  TEMP_INCAPACITY_PERIOD_GAP,
  TEMP_INCAPACITY_PERIOD_OVERLAP,
} from "./tempIncapacityPeriodContinuity.js";
import {
  areTemporaryPeriodsConsecutive,
  computeEffectiveTemporaryRange,
} from "./tempIncapacityPeriodUtils.js";
import { TEMP_DISABILITY_GAP } from "./tempDisabilityContinuity.js";
import { hashCalculationInput } from "./hash/calculationInputHash.js";

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
    disability: { permanentDisabilityRate: 35, disabilityStartDate: "2023-01-20" },
    temporaryIncapacityPeriods: [
      { id: "t1", startDate: "2022-09-01", endDate: "2022-12-12" },
      { id: "t2", startDate: "2023-01-02", endDate: "2023-01-19" },
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

describe("tempIncapacityPeriodContinuity — validation", () => {
  it("A) ardışık dönemler → geçerli, checkbox gerekmez", () => {
    const res = validateCalculationDraft(
      baseDraft({
        temporaryIncapacityPeriods: [
          { id: "t1", startDate: "2022-09-01", endDate: "2022-12-12" },
          { id: "t2", startDate: "2022-12-13", endDate: "2023-01-19" },
        ],
        disability: { permanentDisabilityRate: 35, disabilityStartDate: "2023-01-20" },
      })
    );
    expect(res.valid).toBe(true);
    expect(res.errors.filter((e) => e.code === TEMP_INCAPACITY_PERIOD_GAP)).toHaveLength(0);
    expect(res.errors.filter((e) => e.code === TEMP_INCAPACITY_PERIOD_OVERLAP)).toHaveLength(0);
  });

  it("B) gap + ignoreGap=false → GAP ERROR, hesap devam etmez", () => {
    const res = validateCalculationDraft(baseDraft());
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === TEMP_INCAPACITY_PERIOD_GAP)).toBe(true);
  });

  it("C) gap + ignoreGap=true → geçerli, effective range 2022-09-01 – 2023-01-19", () => {
    const draft = baseDraft({ temporaryIncapacityIgnoreGaps: true });
    const res = validateCalculationDraft(draft);
    expect(res.valid).toBe(true);
    expect(computeEffectiveTemporaryRange(draft.temporaryIncapacityPeriods)).toEqual({
      startDate: "2022-09-01",
      endDate: "2023-01-19",
    });
  });

  it("D) overlap → OVERLAP ERROR, bypass yok", () => {
    const res = validateCalculationDraft(
      baseDraft({
        temporaryIncapacityPeriods: [
          { id: "t1", startDate: "2022-09-01", endDate: "2022-12-12" },
          { id: "t2", startDate: "2022-12-10", endDate: "2023-01-19" },
        ],
      })
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === TEMP_INCAPACITY_PERIOD_OVERLAP)).toBe(true);
    expect(res.errors.some((e) => e.code === TEMP_INCAPACITY_PERIOD_GAP)).toBe(false);
  });

  it("E) ardışık hale gelince ignoreGap otomatik temizlenmeli (utils)", () => {
    const consecutive = [
      { id: "t1", startDate: "2022-09-01", endDate: "2022-12-12" },
      { id: "t2", startDate: "2022-12-13", endDate: "2023-01-19" },
    ];
    expect(areTemporaryPeriodsConsecutive(consecutive)).toBe(true);
  });

  it("F) ignoreGap=true, maluliyet 20.01.2023 → geçerli", () => {
    const res = validateCalculationDraft(
      baseDraft({
        temporaryIncapacityIgnoreGaps: true,
        disability: { permanentDisabilityRate: 35, disabilityStartDate: "2023-01-20" },
      })
    );
    expect(res.valid).toBe(true);
  });

  it("G) ignoreGap=true, maluliyet 25.01.2023 → TEMP_DISABILITY_GAP", () => {
    const res = validateCalculationDraft(
      baseDraft({
        temporaryIncapacityIgnoreGaps: true,
        disability: { permanentDisabilityRate: 35, disabilityStartDate: "2023-01-25" },
      })
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === TEMP_DISABILITY_GAP)).toBe(true);
  });
});

describe("tempIncapacityPeriodContinuity — motor", () => {
  it("ignoreGap=true iken boş günler dahil tek kesintisiz aralık hesaplanır", () => {
    const draft = baseDraft({ temporaryIncapacityIgnoreGaps: true });
    const withoutIgnore = baseDraft();
    const window = buildProcessedWindow(draft);
    const income = resolveIncome(draft, []);
    const merged = calculateTemporaryIncapacity(draft, window, income);
    const separate = calculateTemporaryIncapacity(withoutIgnore, window, income);
    expect(merged.total).toBeGreaterThan(separate.total);
    const result = calculateTrafficInjury(draft);
    expect(result.temporaryIncapacityGapIgnored).toBe(true);
    expect(result.temporaryIncapacityEffectiveRange).toEqual({
      startDate: "2022-09-01",
      endDate: "2023-01-19",
    });
  });
});

describe("tempIncapacityPeriodContinuity — hash", () => {
  it("temporaryIncapacityIgnoreGaps hash'i değiştirir", () => {
    const a = baseDraft();
    const b = baseDraft({ temporaryIncapacityIgnoreGaps: true });
    expect(hashCalculationInput(a)).not.toBe(hashCalculationInput(b));
  });
});
