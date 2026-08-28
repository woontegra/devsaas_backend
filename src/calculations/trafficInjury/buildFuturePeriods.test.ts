import { describe, it, expect } from "vitest";
import { buildFuturePeriods } from "./buildFuturePeriods.js";
import { calculateFuturePermanent } from "./calculateFuturePermanent.js";
import { calculateTrafficInjury } from "./calculateTrafficInjury.js";
import { buildProcessedWindow } from "./buildProcessedPeriods.js";
import { calculateProcessedPermanent } from "./calculateProcessedPermanent.js";
import { resolveIncome } from "./resolveIncome.js";
import { dailyFromMonthly } from "./money.js";
import { CALCULATION_SCHEMA_VERSION } from "../types.js";
import type { TrafficInjuryDraft } from "../types.js";

const futureIncome = {
  incomeMode: "fixed" as const,
  monthlyNetAtEvent: 17002.2,
  monthlyNetAtCalculation: 17002.2,
  dailyNetAtCalculation: dailyFromMonthly(17002.2),
  coefficient: 1,
  eventDateMinWage: null,
  getMonthlyNetForDate: () => 17002.2,
};

describe("buildFuturePeriods — sınır kuralları", () => {
  it("future başlangıç = calculationDate + 1 gün", () => {
    const segments = buildFuturePeriods("2026-08-28", "2050-12-31", null);
    expect(segments[0]!.startDate).toBe("2026-08-29");
  });

  it("calculationDate + 1 > probableLifeEndDate ise boş", () => {
    expect(buildFuturePeriods("2026-08-28", "2026-08-28", null)).toEqual([]);
    expect(buildFuturePeriods("2026-08-28", "2026-08-28", null)).toEqual([]);
  });

  it("ilk future segment periodIndex=1 (KN 1,10)", () => {
    const segments = buildFuturePeriods("2024-12-31", "2028-06-01", null);
    expect(segments[0]!.startDate).toBe("2025-01-01");
    expect(segments[0]!.periodIndex).toBe(1);
    expect(segments[1]!.periodIndex).toBe(2);
    expect(segments[2]!.periodIndex).toBe(3);
  });

  it("pasif başlangıçta yıl iki satıra bölünür", () => {
    const segments = buildFuturePeriods("2040-12-31", "2041-12-31", "2041-03-27");
    const y2041 = segments.filter((s) => s.startDate.startsWith("2041"));
    expect(y2041).toHaveLength(2);
    expect(y2041[0]).toMatchObject({
      startDate: "2041-01-01",
      endDate: "2041-03-26",
      phase: "ACTIVE",
    });
    expect(y2041[1]).toMatchObject({
      startDate: "2041-03-27",
      endDate: "2041-12-31",
      phase: "PASSIVE",
    });
  });

  it("aynı yıl ACTIVE/PASSIVE bölünmesi KN periodIndex artırmaz", () => {
    const segments = buildFuturePeriods("2040-12-31", "2042-12-31", "2041-03-27");
    const y2041 = segments.filter((s) => s.startDate.startsWith("2041"));
    const y2042 = segments.find((s) => s.startDate.startsWith("2042"));
    expect(y2041[0]!.periodIndex).toBe(y2041[1]!.periodIndex);
    expect(y2042!.periodIndex).toBe(y2041[0]!.periodIndex + 1);
  });

  it("ACTIVE/PASSIVE bölünmesi toplam tazminatı değiştirmez", () => {
    const unsplit = [
      { startDate: "2041-01-01", endDate: "2041-12-31", periodIndex: 1, phase: "ACTIVE" as const },
    ];
    const split = buildFuturePeriods("2040-12-31", "2041-12-31", "2041-03-27");
    const u = calculateFuturePermanent(unsplit, futureIncome, 17);
    const s = calculateFuturePermanent(split, futureIncome, 17);
    expect(s.total).toBe(u.total);
    expect(split.every((seg) => seg.periodIndex === 1)).toBe(true);
  });
});

describe("işlemiş / işleyecek dönem geçişi", () => {
  function boundaryDraft(): TrafficInjuryDraft {
    return {
      schemaVersion: CALCULATION_SCHEMA_VERSION,
      calculationType: "TRAFFIC_INJURY",
      common: { eventDate: "2025-03-13", calculationDate: "2026-08-28" },
      parties: {
        plaintiff: { firstName: "T", lastName: "K", birthDate: "1981-03-27", gender: "MALE" },
        defendants: [],
      },
      liability: { injuredFaultRatio: 0, parties: [] },
      disability: { permanentDisabilityRate: 10, disabilityStartDate: "2025-03-13" },
      temporaryIncapacityPeriods: [],
      accidentIncome: { incomeMode: "fixed", fixedAmount: 30000, averageSources: [] },
      hospitalExpenses: [],
      travelExpenses: [],
      caregiverExpenses: [],
      capitalValueDocuments: [],
      zmtsPayments: [],
      cascoPayments: [],
      passivePhaseAge: 60,
    };
  }

  it("processed bitiş = calculationDate, future başlangıç = calculationDate + 1", () => {
    const draft = boundaryDraft();
    const result = calculateTrafficInjury(draft);
    const processed = result.processedPeriods.filter((r) => r.periodKind === "processed_permanent");
    const lastProcessed = processed.at(-1);
    const firstFuture = result.futurePeriods[0];

    expect(lastProcessed?.endDate).toBe("2026-08-28");
    expect(firstFuture?.startDate).toBe("2026-08-29");
    expect(lastProcessed!.endDate < firstFuture!.startDate).toBe(true);
  });

  it("ortak tarih yok — processed ve future günleri çakışmaz", () => {
    const draft = boundaryDraft();
    const income = resolveIncome(draft, []);
    const window = buildProcessedWindow(draft);
    const processed = calculateProcessedPermanent(draft, window, income);
    const result = calculateTrafficInjury(draft);

    const calcDate = draft.common.calculationDate;
    const procHasCalcDay = processed.rows.some(
      (r) => r.startDate <= calcDate && r.endDate >= calcDate
    );
    const futureHasCalcDay = result.futurePeriods.some(
      (r) => r.startDate <= calcDate && r.endDate >= calcDate
    );

    expect(procHasCalcDay).toBe(true);
    expect(futureHasCalcDay).toBe(false);
  });

  it("ilk future satır KN = 1,10", () => {
    const result = calculateTrafficInjury(boundaryDraft());
    expect(result.futurePeriods[0]!.kn).toBe(1.1);
  });
});
