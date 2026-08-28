import { describe, it, expect } from "vitest";
import { CALCULATION_SCHEMA_VERSION } from "../types.js";
import type { TrafficInjuryDraft } from "../types.js";
import { LEGAL_INTEREST_RATE_PERIODS } from "../../data/legalInterestRates.js";
import { calendarDaysBetween } from "./calendarDayCount.js";
import { calculateInsuranceDeductions } from "./calculateInsuranceDeductions.js";
import { calculateTrafficInjury } from "./calculateTrafficInjury.js";
import { roundMoney } from "./money.js";

const CALCULATION_DATE = "2026-08-28";

function baseDraft(over: Partial<TrafficInjuryDraft> = {}): TrafficInjuryDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_INJURY",
    common: { eventDate: "2022-01-01", calculationDate: CALCULATION_DATE },
    parties: {
      plaintiff: { firstName: "Test", lastName: "Kişi", birthDate: "1990-01-01", gender: "MALE" },
      defendants: [],
    },
    liability: { injuredFaultRatio: 0, parties: [] },
    disability: { permanentDisabilityRate: 10, disabilityStartDate: "2022-07-01" },
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

function segmentInterest(principal: number, rate: number, days: number): number {
  return roundMoney((principal * rate * days) / 36500);
}

describe("calendarDaysBetween — yasal faiz", () => {
  it("paymentDate = calculationDate → 0 gün", () => {
    expect(calendarDaysBetween(CALCULATION_DATE, CALCULATION_DATE)).toBe(0);
  });

  it("gerçek takvim günü hesaplar (30/360 değil)", () => {
    expect(calendarDaysBetween("2025-07-03", CALCULATION_DATE)).toBe(421);
  });
});

describe("calculateInsuranceDeductions — tarihsel tablo", () => {
  it("paymentDate = calculationDate → faiz 0", () => {
    const warnings: string[] = [];
    const draft = baseDraft({
      zmtsPayments: [
        {
          id: "z1",
          defendantId: null,
          paymentDate: CALCULATION_DATE,
          paymentAmount: 25000,
          liabilityLimit: null,
          accidentLimit: null,
        },
      ],
    });
    const result = calculateInsuranceDeductions(draft, 500_000, warnings);
    const row = result.zmts.rows[0]!;
    expect(row.calendarDayCount).toBe(0);
    expect(row.interestAmount).toBe(0);
    expect(row.interestSegments).toHaveLength(0);
    expect(row.principalPlusInterest).toBe(25000);
  });

  it("tek oranlı dönem — tamamı %9", () => {
    const warnings: string[] = [];
    const draft = baseDraft({
      common: { eventDate: "2022-01-01", calculationDate: "2024-05-31" },
      zmtsPayments: [
        {
          id: "z1",
          defendantId: null,
          paymentDate: "2024-01-01",
          paymentAmount: 10000,
          liabilityLimit: null,
          accidentLimit: null,
        },
      ],
    });
    const result = calculateInsuranceDeductions(draft, 500_000, warnings);
    const row = result.zmts.rows[0]!;
    expect(row.interestSegments).toHaveLength(1);
    expect(row.interestSegments[0]!.annualRatePercent).toBe(9);
    const days = calendarDaysBetween("2024-01-01", "2024-05-31");
    expect(row.interestAmount).toBe(segmentInterest(10000, 9, days));
  });

  it("ZMTS 03.07.2025 → 28.08.2026 iki segmente bölünür (%24 + %31)", () => {
    const warnings: string[] = [];
    const draft = baseDraft({
      zmtsPayments: [
        {
          id: "z1",
          defendantId: null,
          paymentDate: "2025-07-03",
          paymentAmount: 25000,
          liabilityLimit: null,
          accidentLimit: null,
        },
      ],
    });
    const result = calculateInsuranceDeductions(draft, 500_000, warnings);
    const row = result.zmts.rows[0]!;

    expect(row.interestSegments).toHaveLength(2);
    expect(row.interestSegments[0]).toMatchObject({
      startDate: "2025-07-03",
      endDate: "2026-07-30",
      annualRatePercent: 24,
    });
    expect(row.interestSegments[1]).toMatchObject({
      startDate: "2026-07-31",
      endDate: "2026-08-28",
      annualRatePercent: 31,
    });

    const seg1Days = calendarDaysBetween("2025-07-03", "2026-07-31");
    const seg2Days = calendarDaysBetween("2026-07-31", "2026-08-28");
    expect(row.interestSegments[0]!.calendarDayCount).toBe(seg1Days);
    expect(row.interestSegments[1]!.calendarDayCount).toBe(seg2Days);
    expect(row.calendarDayCount).toBe(seg1Days + seg2Days);

    const expectedInterest = roundMoney(
      segmentInterest(25000, 24, seg1Days) + segmentInterest(25000, 31, seg2Days)
    );
    expect(row.interestAmount).toBe(expectedInterest);
    expect(row.principalPlusInterest).toBe(roundMoney(25000 + expectedInterest));
  });

  it("Kasko 11.11.2025 → 28.08.2026 iki segmente bölünür (%24 + %31)", () => {
    const warnings: string[] = [];
    const draft = baseDraft({
      cascoPayments: [
        {
          id: "c1",
          defendantId: null,
          paymentDate: "2025-11-11",
          paymentAmount: 75000,
          liabilityLimit: null,
          accidentLimit: null,
        },
      ],
    });
    const result = calculateInsuranceDeductions(draft, 500_000, warnings);
    const row = result.casco.rows[0]!;

    expect(row.interestSegments).toHaveLength(2);
    expect(row.interestSegments[0]).toMatchObject({
      startDate: "2025-11-11",
      endDate: "2026-07-30",
      annualRatePercent: 24,
    });
    expect(row.interestSegments[1]).toMatchObject({
      startDate: "2026-07-31",
      endDate: "2026-08-28",
      annualRatePercent: 31,
    });

    const seg1Days = calendarDaysBetween("2025-11-11", "2026-07-31");
    const seg2Days = calendarDaysBetween("2026-07-31", "2026-08-28");
    const expectedInterest = roundMoney(
      segmentInterest(75000, 24, seg1Days) + segmentInterest(75000, 31, seg2Days)
    );
    expect(row.interestAmount).toBe(expectedInterest);
  });

  it("segment faizlerinin toplamı interestAmount ile eşit", () => {
    const warnings: string[] = [];
    const draft = baseDraft({
      zmtsPayments: [
        {
          id: "z1",
          defendantId: null,
          paymentDate: "2025-07-03",
          paymentAmount: 25000,
          liabilityLimit: null,
          accidentLimit: null,
        },
      ],
      cascoPayments: [
        {
          id: "c1",
          defendantId: null,
          paymentDate: "2025-11-11",
          paymentAmount: 75000,
          liabilityLimit: null,
          accidentLimit: null,
        },
      ],
    });
    const result = calculateInsuranceDeductions(draft, 500_000, warnings);
    for (const row of [...result.zmts.rows, ...result.casco.rows]) {
      const segSum = roundMoney(row.interestSegments.reduce((s, seg) => s + seg.interestAmount, 0));
      expect(segSum).toBe(row.interestAmount);
      expect(row.principalPlusInterest).toBe(roundMoney(row.principalAmount + row.interestAmount));
    }
  });

  it("ZMTS ve Kasko birbirinden bağımsız", () => {
    const warnings: string[] = [];
    const draft = baseDraft({
      zmtsPayments: [
        {
          id: "z1",
          defendantId: null,
          paymentDate: "2025-07-03",
          paymentAmount: 25000,
          liabilityLimit: null,
          accidentLimit: null,
        },
      ],
      cascoPayments: [
        {
          id: "c1",
          defendantId: null,
          paymentDate: "2025-11-11",
          paymentAmount: 75000,
          liabilityLimit: null,
          accidentLimit: null,
        },
      ],
    });
    const result = calculateInsuranceDeductions(draft, 500_000, warnings);
    expect(result.zmts.principalTotal).toBe(25000);
    expect(result.casco.principalTotal).toBe(75000);
    expect(result.zmts.interestTotal).not.toBe(result.casco.interestTotal);
    expect(result.zmts.deductionTotal).not.toBe(result.casco.deductionTotal);
  });

  it("birden fazla ZMTS ödemesi ayrı hesaplanır", () => {
    const warnings: string[] = [];
    const draft = baseDraft({
      zmtsPayments: [
        {
          id: "z1",
          defendantId: null,
          paymentDate: "2025-07-03",
          paymentAmount: 25000,
          liabilityLimit: null,
          accidentLimit: null,
        },
        {
          id: "z2",
          defendantId: null,
          paymentDate: "2026-08-01",
          paymentAmount: 10000,
          liabilityLimit: null,
          accidentLimit: null,
        },
      ],
    });
    const result = calculateInsuranceDeductions(draft, 500_000, warnings);
    expect(result.zmts.rows).toHaveLength(2);
    expect(result.zmts.principalTotal).toBe(35000);
  });

  it("nihai tutar 0 altına düşmez", () => {
    const warnings: string[] = [];
    const draft = baseDraft({
      zmtsPayments: [
        {
          id: "z1",
          defendantId: null,
          paymentDate: "2025-07-03",
          paymentAmount: 25000,
          liabilityLimit: null,
          accidentLimit: null,
        },
      ],
      cascoPayments: [
        {
          id: "c1",
          defendantId: null,
          paymentDate: "2025-11-11",
          paymentAmount: 75000,
          liabilityLimit: null,
          accidentLimit: null,
        },
      ],
    });
    const before = 50_000;
    const result = calculateInsuranceDeductions(draft, before, warnings);
    expect(result.finalCompensationAfterInsurance).toBeGreaterThanOrEqual(0);
    expect(result.finalCompensationAfterInsurance).toBe(
      roundMoney(Math.max(0, before - result.zmts.deductionTotal - result.casco.deductionTotal))
    );
  });

  it("garameEnabled kayıtları context'e ekler", () => {
    const warnings: string[] = [];
    const draft = baseDraft({
      zmtsPayments: [
        {
          id: "z1",
          defendantId: null,
          paymentDate: "2025-07-03",
          paymentAmount: 25000,
          liabilityLimit: null,
          accidentLimit: null,
          garameEnabled: true,
          garameEntries: [],
        },
      ],
    });
    const result = calculateInsuranceDeductions(draft, 500_000, warnings);
    expect(result.garameInterestContext).toHaveLength(1);
    expect(result.garameInterestContext[0]!.kind).toBe("zmts");
    expect(result.garameInterestContext[0]!.principalPlusInterest).toBe(result.zmts.rows[0]!.principalPlusInterest);
  });

  it("boş oran tablosunda yalnızca ana para mahsup edilir", () => {
    const warnings: string[] = [];
    const draft = baseDraft({
      zmtsPayments: [
        {
          id: "z1",
          defendantId: null,
          paymentDate: "2025-07-03",
          paymentAmount: 25000,
          liabilityLimit: null,
          accidentLimit: null,
        },
      ],
    });
    const result = calculateInsuranceDeductions(draft, 500_000, warnings, []);
    expect(result.zmts.rows[0]!.interestAmount).toBe(0);
    expect(result.zmts.deductionTotal).toBe(25000);
    expect(warnings.some((w) => w.includes("tablosu boş"))).toBe(true);
  });

  it("tarihsel tablo 11 dönem içerir", () => {
    expect(LEGAL_INTEREST_RATE_PERIODS).toHaveLength(11);
  });
});

describe("calculateTrafficInjury — sigorta mahsubu entegrasyonu", () => {
  it("insuranceDeductions ve finalCompensationAfterInsurance üretir", () => {
    const result = calculateTrafficInjury(
      baseDraft({
        zmtsPayments: [
          {
            id: "z1",
            defendantId: null,
            paymentDate: "2025-07-03",
            paymentAmount: 25000,
            liabilityLimit: null,
            accidentLimit: null,
          },
        ],
      })
    );
    expect(result.insuranceDeductions.zmts.rows).toHaveLength(1);
    expect(result.insuranceDeductions.zmts.rows[0]!.interestSegments).toHaveLength(2);
    expect(result.insuranceDeductions.casco.rows).toHaveLength(0);
    expect(result.finalCompensationAfterInsurance).toBeLessThanOrEqual(result.finalCompensationBeforeInsurance);
    expect(result.insuranceClaimContext.claimAmountAfterInsurance).toBe(result.finalCompensationAfterInsurance);
  });
});

/** Örnek dosya değerleri — raporlama için */
export function exampleInsuranceDeductionSnapshot() {
  const warnings: string[] = [];
  const draft = baseDraft({
    zmtsPayments: [
      {
        id: "z1",
        defendantId: null,
        paymentDate: "2025-07-03",
        paymentAmount: 25000,
        liabilityLimit: null,
        accidentLimit: null,
      },
    ],
    cascoPayments: [
      {
        id: "c1",
        defendantId: null,
        paymentDate: "2025-11-11",
        paymentAmount: 75000,
        liabilityLimit: null,
        accidentLimit: null,
      },
    ],
  });
  return calculateInsuranceDeductions(draft, 1_000_000, warnings);
}

describe("örnek dosya — 28.08.2026 hesap tarihi", () => {
  it("ZMTS ve Kasko faizli mahsup snapshot", () => {
    const result = exampleInsuranceDeductionSnapshot();
    expect(result.zmts.rows[0]!.interestSegments).toHaveLength(2);
    expect(result.casco.rows[0]!.interestSegments).toHaveLength(2);
  });
});
