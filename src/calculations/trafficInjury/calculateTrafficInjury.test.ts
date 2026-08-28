import { describe, it, expect } from "vitest";
import { CALCULATION_SCHEMA_VERSION } from "../types.js";
import type { TrafficInjuryDraft } from "../types.js";
import { actuarialDays360Inclusive } from "./dayCount360.js";
import { dailyFromMonthly, roundMoney } from "./money.js";
import { applyFault } from "./applyFault.js";
import { applyCapitalValueDeduction } from "./applyCapitalValueDeduction.js";
import { calculateFuturePermanent } from "./calculateFuturePermanent.js";
import { buildFuturePeriods } from "./buildFuturePeriods.js";
import { calculateTemporaryIncapacity } from "./calculateTemporaryIncapacity.js";
import { calculateProcessedPermanent } from "./calculateProcessedPermanent.js";
import { resolveIncome } from "./resolveIncome.js";
import { buildProcessedWindow } from "./buildProcessedPeriods.js";
import { calculateTrafficInjury } from "./calculateTrafficInjury.js";

function baseDraft(over: Partial<TrafficInjuryDraft> = {}): TrafficInjuryDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_INJURY",
    common: { eventDate: "2022-01-01", calculationDate: "2022-12-31" },
    parties: {
      plaintiff: {
        firstName: "Test",
        lastName: "Kişi",
        birthDate: "1990-01-01",
        gender: "MALE",
      },
      defendants: [],
    },
    liability: { injuredFaultRatio: 0, parties: [] },
    disability: { permanentDisabilityRate: 27, disabilityStartDate: "2022-07-01" },
    temporaryIncapacityPeriods: [],
    accidentIncome: { incomeMode: "fixed", fixedAmount: 30000, averageSources: [] },
    hospitalExpenses: [],
    travelExpenses: [],
    caregiverExpenses: [],
    capitalValueDocuments: [],
    zmtsPayments: [],
    cascoPayments: [],
    ...over,
  };
}

describe("dayCount360 — golden", () => {
  it("A) aylık 30.000 net → günlük 1.000", () => {
    expect(dailyFromMonthly(30000)).toBe(1000);
  });

  it("B) 2022 yarım yıl dönemleri 180 gün", () => {
    expect(actuarialDays360Inclusive("2022-01-01", "2022-06-30")).toBe(180);
    expect(actuarialDays360Inclusive("2022-07-01", "2022-12-31")).toBe(180);
  });

  it("C) tam yıl 01.01–31.12 = 360 gün", () => {
    expect(actuarialDays360Inclusive("2022-01-01", "2022-12-31")).toBe(360);
  });

  it("D) 360 günü aşan tek dönem 360 ile sınırlı", () => {
    expect(actuarialDays360Inclusive("2020-01-01", "2022-12-31")).toBe(360);
  });
});

describe("geçici İG ve maluliyet — golden", () => {
  it("E) geçici İG: 8.000 TL zarar, maluliyet %27 olsa bile tam 8.000", () => {
    const draft = baseDraft({
      disability: { permanentDisabilityRate: 27, disabilityStartDate: "2022-07-01" },
      temporaryIncapacityPeriods: [
        { id: "t1", startDate: "2022-01-01", endDate: "2022-01-07" },
      ],
      accidentIncome: { incomeMode: "fixed", fixedAmount: 30000, averageSources: [] },
    });
    const warnings: string[] = [];
    const income = resolveIncome(draft, warnings);
    const window = buildProcessedWindow(draft);
    const { total } = calculateTemporaryIncapacity(draft, window, income);
    // 7 gün × 1.000 TL/gün = 7.000 — 8 gün için 8.000:
    const draft8 = baseDraft({
      temporaryIncapacityPeriods: [
        { id: "t1", startDate: "2022-01-01", endDate: "2022-01-08" },
      ],
      accidentIncome: { incomeMode: "fixed", fixedAmount: 30000, averageSources: [] },
    });
    const income8 = resolveIncome(draft8, []);
    const { total: total8 } = calculateTemporaryIncapacity(draft8, window, income8);
    expect(total8).toBe(8000);
    expect(total).toBe(7000);
  });

  it("F) maluliyet sonrası işlemiş: 8.000 × %27 = 2.160", () => {
    const draft = baseDraft({
      common: { eventDate: "2022-01-01", calculationDate: "2022-01-08" },
      processedPeriodStartDate: "2022-01-01",
      processedPeriodEndDate: "2022-01-08",
      disability: { permanentDisabilityRate: 27, disabilityStartDate: "2022-01-01" },
      temporaryIncapacityPeriods: [],
      accidentIncome: { incomeMode: "fixed", fixedAmount: 30000, averageSources: [] },
    });
    const income = resolveIncome(draft, []);
    const window = buildProcessedWindow(draft);
    const { total } = calculateProcessedPermanent(draft, window, income);
    expect(total).toBe(2160);
  });
});

describe("işleyecek dönem — golden", () => {
  const futureIncome = {
    incomeMode: "fixed" as const,
    monthlyNetAtEvent: 17002.2,
    monthlyNetAtCalculation: 17002.2,
    dailyNetAtCalculation: dailyFromMonthly(17002.2),
    coefficient: 1,
    eventDateMinWage: null,
    getMonthlyNetForDate: () => 17002.2,
  };

  it("KN sıra 1-tabanlı: period 1→1,10 / 2→1,21 / 3→1,331", () => {
    const segments = [
      { startDate: "2025-01-01", endDate: "2025-12-31", periodIndex: 1, phase: "ACTIVE" as const },
      { startDate: "2026-01-01", endDate: "2026-12-31", periodIndex: 2, phase: "ACTIVE" as const },
      { startDate: "2027-01-01", endDate: "2027-12-31", periodIndex: 3, phase: "ACTIVE" as const },
    ];
    const { rows } = calculateFuturePermanent(segments, futureIncome, 17);
    expect(rows[0]!.kn).toBeCloseTo(1.1, 12);
    expect(rows[1]!.kn).toBeCloseTo(1.21, 12);
    expect(rows[2]!.kn).toBeCloseTo(1.331, 12);
    expect(rows[0]!.discountFactor).toBeCloseTo(1 / 1.1, 12);
    expect(rows[1]!.discountFactor).toBeCloseTo(1 / 1.21, 12);
    expect(rows[2]!.discountFactor).toBeCloseTo(1 / 1.331, 12);
  });

  it("KN 8. dönem → 2,14358881", () => {
    const segments = [
      { startDate: "2032-01-01", endDate: "2032-12-31", periodIndex: 8, phase: "ACTIVE" as const },
    ];
    const { rows } = calculateFuturePermanent(segments, futureIncome, 17);
    expect(rows[0]!.kn).toBeCloseTo(Math.pow(1.1, 8), 12);
  });

  it("buildFuturePeriods ilk segment periodIndex=1 ile başlar", () => {
    const segments = buildFuturePeriods("2024-12-31", "2028-06-01", null);
    expect(segments[0]!.startDate).toBe("2025-01-01");
    expect(segments[0]!.periodIndex).toBe(1);
    expect(segments[1]!.periodIndex).toBe(2);
    expect(segments[2]!.periodIndex).toBe(3);
  });

  it("G) 566,74 × 360 × KN 1,10 × iskonto → %17 maluliyet ≈ 34.684,49", () => {
    const segments = [
      { startDate: "2025-01-01", endDate: "2025-12-31", periodIndex: 1, phase: "ACTIVE" as const },
    ];
    const { rows, total } = calculateFuturePermanent(segments, futureIncome, 17);
    expect(rows[0]!.dailyNetIncome).toBe(566.74);
    expect(rows[0]!.dayCount).toBe(360);
    expect(rows[0]!.kn).toBeCloseTo(1.1, 12);
    expect(rows[0]!.increasedIncome).toBe(224429.04);
    expect(rows[0]!.discountedIncome).toBe(204026.4);
    expect(rows[0]!.discountFactor).toBeCloseTo(1 / 1.1, 12);
    expect(total).toBe(34684.49);
  });
});

describe("kusur ve PSD — golden", () => {
  it("H) toplam 100.000, kusur %20 → 80.000", () => {
    const r = applyFault(100000, 20);
    expect(r.totalAfterFault).toBe(80000);
    expect(r.faultDeductionAmount).toBe(20000);
  });

  it("I) PSD 20.000, davacı kusuru %20 → mahsup edilebilir 16.000", () => {
    const r = applyCapitalValueDeduction(80000, 20000, 20);
    expect(r.psdDeductibleAfterFault).toBe(16000);
    expect(r.totalAfterPSD).toBe(64000);
  });

  it("J) sıra: toplam → kusur → kusur uygulanmış PSD", () => {
    const draft = baseDraft({
      liability: { injuredFaultRatio: 20, parties: [] },
      capitalValueDocuments: [{ id: "psd1", amount: 20000 }],
      common: { eventDate: "2022-01-01", calculationDate: "2022-01-01" },
      disability: { permanentDisabilityRate: 0, disabilityStartDate: "2022-01-01" },
      temporaryIncapacityPeriods: [],
    });

    // Sabit toplam zarar için doğrudan bileşen toplamını kontrol et
    const totalBefore = 100000;
    const fault = applyFault(totalBefore, 20);
    const psd = applyCapitalValueDeduction(fault.totalAfterFault, 20000, 20);
    expect(fault.totalAfterFault).toBe(80000);
    expect(psd.psdDeductibleAfterFault).toBe(16000);
    expect(psd.totalAfterPSD).toBe(64000);

    // Motor entegrasyonu: işleyecek dönem kapalı, sadece kusur+PSD yolu
    const motorDraft = baseDraft({
      liability: { injuredFaultRatio: 20, parties: [] },
      capitalValueDocuments: [{ id: "psd1", amount: 20000 }],
      common: { eventDate: "2025-01-01", calculationDate: "2025-01-01" },
      disability: { permanentDisabilityRate: 0, disabilityStartDate: "2025-01-01" },
      parties: {
        plaintiff: {
          firstName: "T",
          lastName: "K",
          birthDate: "1990-01-01",
          gender: "MALE",
        },
        defendants: [],
      },
    });
    const result = calculateTrafficInjury(motorDraft);
    expect(result.totalDamageBeforeFault).toBe(0);
    expect(result.totalAfterFault).toBe(0);
    expect(result.psdDeductibleAfterFault).toBe(16000);
    expect(result.totalAfterPSD).toBe(0);
  });
});

describe("calculateTrafficInjury — entegrasyon", () => {
  it("minWage modunda 2022 dönem bölünmesi ile gelir farklılaşır", () => {
    const draft = baseDraft({
      accidentIncome: { incomeMode: "minWage", fixedAmount: null, averageSources: [] },
      common: { eventDate: "2022-01-01", calculationDate: "2022-12-31" },
      disability: { permanentDisabilityRate: 10, disabilityStartDate: "2022-01-01" },
      temporaryIncapacityPeriods: [],
    });
    const result = calculateTrafficInjury(draft);
    const permRows = result.processedPeriods.filter((r) => r.periodKind === "processed_permanent");
    expect(permRows.length).toBeGreaterThanOrEqual(2);
    const wages = new Set(permRows.map((r) => r.monthlyNetIncome));
    expect(wages.has(4253.4)).toBe(true);
    expect(wages.has(5500.35)).toBe(true);
  });

  it("sonuç modeli zorunlu alanları içerir", () => {
    const result = calculateTrafficInjury(baseDraft());
    expect(result.resolvedIncome).toBeDefined();
    expect(result.lifeExpectancy.decimalLifeExpectancy).not.toBeNull();
    expect(result.probableLifeEndDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.insuranceClaimContext.claimAmountBeforeGarame).toBe(result.finalCompensationBeforeInsurance);
    expect(result.insuranceDeductions).toBeDefined();
    expect(result.finalCompensationAfterInsurance).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.warnings)).toBe(true);
  });
});

describe("roundMoney", () => {
  it("floating point sapmasını giderir", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(566.74 * 360)).toBe(204026.4);
  });
});
