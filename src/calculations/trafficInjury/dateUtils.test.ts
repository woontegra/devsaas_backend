import { describe, it, expect } from "vitest";
import { calendarAgeAtEvent, completedAgeYears } from "./dateUtils.js";
import { resolveLifeExpectancy } from "./resolveLifeExpectancy.js";
import { CALCULATION_SCHEMA_VERSION } from "../types.js";
import type { TrafficInjuryDraft } from "../types.js";

describe("calendarAgeAtEvent", () => {
  it("27.03.1981 / 13.03.2025 → 43 yıl 11 ay 14 gün, TRH key 43", () => {
    const birth = "1981-03-27";
    const event = "2025-03-13";

    expect(calendarAgeAtEvent(birth, event)).toEqual({ years: 43, months: 11, days: 14 });
    expect(completedAgeYears(birth, event)).toBe(43);
  });

  it("resolveLifeExpectancy sonuç modeline ageAtAccident ekler", () => {
    const draft: TrafficInjuryDraft = {
      schemaVersion: CALCULATION_SCHEMA_VERSION,
      calculationType: "TRAFFIC_INJURY",
      common: { eventDate: "2025-03-13", calculationDate: "2026-01-01" },
      parties: {
        plaintiff: { firstName: "T", lastName: "K", birthDate: "1981-03-27", gender: "MALE" },
        defendants: [],
      },
      liability: { injuredFaultRatio: 0, parties: [] },
      disability: { permanentDisabilityRate: 30, disabilityStartDate: "2025-03-13" },
      temporaryIncapacityPeriods: [],
      accidentIncome: { incomeMode: "fixed", fixedAmount: 20000, averageSources: [] },
      hospitalExpenses: [],
      travelExpenses: [],
      caregiverExpenses: [],
      capitalValueDocuments: [],
      zmtsPayments: [],
      cascoPayments: [],
      passivePhaseAge: 60,
    };

    const le = resolveLifeExpectancy(draft);
    expect(le.ageAtAccident).toEqual({ years: 43, months: 11, days: 14 });
    expect(le.completedAgeYears).toBe(43);
  });
});
