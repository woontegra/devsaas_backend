import { describe, it, expect } from "vitest";
import { validateCalculationDraft } from "./validateDraft.js";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";
import { applyFault } from "./trafficInjury/applyFault.js";
import { calculateTrafficInjury } from "./trafficInjury/calculateTrafficInjury.js";
import { hashCalculationInput } from "./hash/calculationInputHash.js";
import { CALCULATION_HASH_VERSION } from "./hash/calculationHashVersion.js";

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
      injuredFaultRatio: 55,
      externalFaultRatio: 5,
      parties: [{ id: "d1", partyType: "defendant" as const, name: "Mehmet Kaya", faultRatio: 40 }],
    },
    disability: { permanentDisabilityRate: 35, disabilityStartDate: "2020-09-01" },
    temporaryIncapacityPeriods: [],
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

describe("externalFaultRatio — validation", () => {
  it("A) davacı 55 + davalı 40 + dava dışı 5 = 100 → geçer", () => {
    const res = validateCalculationDraft(baseDraft());
    expect(res.valid).toBe(true);
    expect(res.errors.filter((e) => e.code === "FAULT_SUM_NOT_100")).toHaveLength(0);
  });

  it("B) davacı 55 + davalı 40 + dava dışı 0 = 95 → hata", () => {
    const res = validateCalculationDraft(
      baseDraft({
        liability: {
          injuredFaultRatio: 55,
          externalFaultRatio: 0,
          parties: [{ id: "d1", partyType: "defendant", name: "Mehmet Kaya", faultRatio: 40 }],
        },
      })
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.code === "FAULT_SUM_NOT_100")).toBe(true);
  });
});

describe("externalFaultRatio — hesap motoru", () => {
  it("C) toplam zarar 100.000, davacı %55, dava dışı %5 → kusur sonrası 45.000", () => {
    const fault = applyFault(100_000, 55);
    expect(fault.totalAfterFault).toBe(45_000);
    expect(fault.faultDeductionAmount).toBe(55_000);
  });

  it("C) dava dışı kusur değişince parasal sonuç aynı kalır", () => {
    const withExternal = calculateTrafficInjury(baseDraft());
    const withoutExternal = calculateTrafficInjury(
      baseDraft({
        liability: {
          injuredFaultRatio: 55,
          externalFaultRatio: 0,
          parties: [{ id: "d1", partyType: "defendant", name: "Mehmet Kaya", faultRatio: 45 }],
        },
      })
    );

    expect(withExternal.totalAfterFault).toBe(withoutExternal.totalAfterFault);
    expect(withExternal.faultDeductionAmount).toBe(withoutExternal.faultDeductionAmount);
    expect(withExternal.finalCompensationAfterInsurance).toBe(
      withoutExternal.finalCompensationAfterInsurance
    );
  });

  it("D) dava dışı 0 olan mevcut dosyalar eski davranışla aynı", () => {
    const legacy = validateCalculationDraft(
      baseDraft({
        liability: {
          injuredFaultRatio: 20,
          parties: [{ id: "d1", partyType: "defendant", name: "Mehmet Kaya", faultRatio: 80 }],
        },
      })
    );
    expect(legacy.valid).toBe(true);

    const result = calculateTrafficInjury(
      baseDraft({
        liability: {
          injuredFaultRatio: 20,
          parties: [{ id: "d1", partyType: "defendant", name: "Mehmet Kaya", faultRatio: 80 }],
        },
      })
    );
    expect(result.injuredFaultRate).toBe(20);
  });
});

describe("externalFaultRatio — hash", () => {
  it("dava dışı kusur hash’i değiştirir; motor sonucu etkilemediği için hash versiyonu artmaz", () => {
    const a = baseDraft();
    const b = baseDraft({
      liability: {
        injuredFaultRatio: 55,
        externalFaultRatio: 10,
        parties: [{ id: "d1", partyType: "defendant", name: "Mehmet Kaya", faultRatio: 35 }],
      },
    });
    expect(hashCalculationInput(a)).not.toBe(hashCalculationInput(b));
    expect(CALCULATION_HASH_VERSION).toBe(4);
  });
});
