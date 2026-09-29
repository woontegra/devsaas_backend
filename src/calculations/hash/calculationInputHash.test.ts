import { describe, it, expect } from "vitest";
import { CALCULATION_SCHEMA_VERSION } from "../types.js";
import type { TrafficInjuryDraft } from "../types.js";
import { hashCalculationInput } from "./calculationInputHash.js";
import { CALCULATION_HASH_VERSION } from "./calculationHashVersion.js";

function baseDraft(over: Partial<TrafficInjuryDraft> = {}): TrafficInjuryDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_INJURY",
    common: {
      eventDate: "2022-01-01",
      calculationDate: "2026-08-28",
      internalFileName: "Dosya A",
      courtName: "Mahkeme X",
    },
    parties: {
      plaintiff: {
        firstName: "Ali",
        lastName: "Veli",
        birthDate: "1990-01-01",
        gender: "MALE",
      },
      defendants: [{ id: "d1", type: "INDIVIDUAL_DRIVER", firstName: "Mehmet", lastName: "Kaya" }],
    },
    liability: { injuredFaultRatio: 0, parties: [] },
    disability: { permanentDisabilityRate: 27, disabilityStartDate: "2022-01-08" },
    temporaryIncapacityPeriods: [{ id: "t1", startDate: "2022-01-01", endDate: "2022-01-07" }],
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

describe("hashCalculationInput — TRAFFIC_INJURY", () => {
  it("aynı girdide deterministik hash üretir", () => {
    const d = baseDraft();
    expect(hashCalculationInput(d)).toBe(hashCalculationInput(d));
    expect(hashCalculationInput(d)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("yalnız davacı adını değiştirmek → hash değişmez", () => {
    const a = baseDraft();
    const b = baseDraft({
      parties: {
        ...a.parties,
        plaintiff: { ...a.parties.plaintiff, firstName: "Ayşe", lastName: "Yılmaz" },
      },
    });
    expect(hashCalculationInput(a)).toBe(hashCalculationInput(b));
  });

  it("dosya/mahkeme adını değiştirmek → hash değişmez", () => {
    const a = baseDraft();
    const b = baseDraft({
      common: {
        ...a.common,
        internalFileName: "Başka dosya",
        courtName: "Başka mahkeme",
        caseNumber: "2024/999",
      },
    });
    expect(hashCalculationInput(a)).toBe(hashCalculationInput(b));
  });

  it("maluliyet oranını değiştirmek → hash değişir", () => {
    const a = baseDraft();
    const b = baseDraft({ disability: { ...a.disability, permanentDisabilityRate: 35 } });
    expect(hashCalculationInput(a)).not.toBe(hashCalculationInput(b));
  });

  it("kusuru değiştirmek → hash değişir", () => {
    const a = baseDraft();
    const b = baseDraft({ liability: { ...a.liability, injuredFaultRatio: 20 } });
    expect(hashCalculationInput(a)).not.toBe(hashCalculationInput(b));
  });

  it("geliri değiştirmek → hash değişir", () => {
    const a = baseDraft();
    const b = baseDraft({
      accidentIncome: { ...a.accidentIncome, fixedAmount: 35000 },
    });
    expect(hashCalculationInput(a)).not.toBe(hashCalculationInput(b));
  });

  it("hesap tarihini değiştirmek → hash değişir", () => {
    const a = baseDraft();
    const b = baseDraft({ common: { ...a.common, calculationDate: "2026-09-01" } });
    expect(hashCalculationInput(a)).not.toBe(hashCalculationInput(b));
  });

  it("ZMTS ödeme tutarını değiştirmek → hash değişir", () => {
    const payment = {
      id: "z1",
      paymentDate: "2025-07-03",
      paymentAmount: 25000,
      liabilityLimit: 50000,
      accidentLimit: null as number | null,
    };
    const a = baseDraft({ zmtsPayments: [payment] });
    const b = baseDraft({
      zmtsPayments: [{ ...payment, id: "z2", paymentAmount: 26000 }],
    });
    expect(hashCalculationInput(a)).not.toBe(hashCalculationInput(b));
  });

  it("Kasko ödeme tarihini değiştirmek → hash değişir", () => {
    const payment = {
      id: "c1",
      paymentDate: "2025-11-11",
      paymentAmount: 75000,
      liabilityLimit: 100000,
    };
    const a = baseDraft({ cascoPayments: [payment] });
    const b = baseDraft({
      cascoPayments: [{ ...payment, paymentDate: "2025-11-12" }],
    });
    expect(hashCalculationInput(a)).not.toBe(hashCalculationInput(b));
  });

  it("garameEnabled değişirse → hash değişir", () => {
    const payment = {
      id: "z1",
      paymentDate: "2025-07-03",
      paymentAmount: 25000,
      liabilityLimit: 50000,
      garameEnabled: false,
    };
    const a = baseDraft({ zmtsPayments: [payment] });
    const b = baseDraft({
      zmtsPayments: [{ ...payment, garameEnabled: true, garameEntries: [] }],
    });
    expect(hashCalculationInput(a)).not.toBe(hashCalculationInput(b));
  });

  it("anlamsız UI id değişirse → hash değişmez", () => {
    const a = baseDraft({
      temporaryIncapacityPeriods: [{ id: "aaa", startDate: "2022-01-01", endDate: "2022-01-07" }],
      zmtsPayments: [
        {
          id: "old-id",
          paymentDate: "2025-07-03",
          paymentAmount: 25000,
          liabilityLimit: 50000,
        },
      ],
    });
    const b = baseDraft({
      temporaryIncapacityPeriods: [{ id: "bbb", startDate: "2022-01-01", endDate: "2022-01-07" }],
      zmtsPayments: [
        {
          id: "new-id",
          paymentDate: "2025-07-03",
          paymentAmount: 25000,
          liabilityLimit: 50000,
        },
      ],
    });
    expect(hashCalculationInput(a)).toBe(hashCalculationInput(b));
  });

  it("canonical payload calculationHashVersion içerir", () => {
    expect(CALCULATION_HASH_VERSION).toBe(4);
  });
});

describe("hashCalculationInput — TRAFFIC_DEATH", () => {
  function deathDraft(over: Partial<import("../types.js").TrafficDeathDraft> = {}) {
    return {
      schemaVersion: CALCULATION_SCHEMA_VERSION,
      calculationType: "TRAFFIC_DEATH" as const,
      common: { eventDate: "2020-06-01", calculationDate: "2024-01-15" },
      deceased: {
        birthDate: "1970-01-01",
        deathDate: "2020-06-01",
        gender: "male" as const,
        fullName: "Ahmet",
      },
      employmentStatus: "WORKING" as const,
      accidentIncome: { incomeMode: "fixed" as const, fixedAmount: 10000, averageSources: [] },
      nonWorkingSelectedIncome: null,
      incomePeriods: [],
      beneficiaries: [],
      supportRelations: [],
      liability: { injuredFaultRatio: 0, parties: [] },
      deathExpenses: { otherExpenses: [] },
      priorPayments: [],
      insurance: {},
      ...over,
    };
  }

  it("employmentStatus değişince hash değişir", () => {
    const a = deathDraft();
    const b = deathDraft({
      employmentStatus: "NOT_WORKING",
      nonWorkingSelectedIncome: 8500,
    });
    expect(hashCalculationInput(a)).not.toBe(hashCalculationInput(b));
  });

  it("claimantStatus değişince hash değişir", () => {
    const a = deathDraft({
      beneficiaries: [
        {
          id: "b1",
          fullName: "Ayşe",
          relation: "spouse",
          birthDate: "1975-01-01",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
      ],
    });
    const b = deathDraft({
      beneficiaries: [
        {
          id: "b1",
          fullName: "Ayşe",
          relation: "spouse",
          birthDate: "1975-01-01",
          gender: "female",
          claimantStatus: "OUT_OF_CASE",
        },
      ],
    });
    expect(hashCalculationInput(a)).not.toBe(hashCalculationInput(b));
  });
});
