import { describe, it, expect } from "vitest";
import {
  addLifeExpectancyActuarial30Day,
  calendarAgeAtEvent,
  calendarSpanYmd,
  completedAgeYears,
} from "./dateUtils.js";
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

describe("calendarSpanYmd", () => {
  it("doğum günü kaza gününe denk gelirse ay ve gün sıfırdır", () => {
    expect(calendarSpanYmd("1990-06-10", "2024-06-10")).toEqual({ years: 34, months: 0, days: 0 });
  });

  it("bir gün öncesi ve sonrası", () => {
    expect(calendarSpanYmd("1990-06-10", "2024-06-09")).toEqual({ years: 33, months: 11, days: 30 });
    expect(calendarSpanYmd("1990-06-10", "2024-06-11")).toEqual({ years: 34, months: 0, days: 1 });
  });

  it("sıfır ayı da korur", () => {
    expect(calendarSpanYmd("2004-01-15", "2024-01-18")).toEqual({ years: 20, months: 0, days: 3 });
  });

  it("ay sonu: 31 Ocak, artık olmayan Şubat", () => {
    expect(calendarSpanYmd("2019-01-31", "2019-02-28")).toEqual({ years: 0, months: 1, days: 0 });
    expect(calendarSpanYmd("2019-01-31", "2019-03-01")).toEqual({ years: 0, months: 1, days: 1 });
  });

  it("ay sonu: 31 Mart, 30 Nisan", () => {
    expect(calendarSpanYmd("2020-03-31", "2020-04-30")).toEqual({ years: 0, months: 1, days: 0 });
    expect(calendarSpanYmd("2020-03-31", "2020-05-01")).toEqual({ years: 0, months: 1, days: 1 });
  });

  it("29 Şubat doğumu artık olmayan yılda 28 Şubat'ta tam yaşlanır", () => {
    expect(calendarSpanYmd("2020-02-29", "2021-02-27")).toEqual({ years: 0, months: 11, days: 29 });
    expect(calendarSpanYmd("2020-02-29", "2021-02-28")).toEqual({ years: 1, months: 0, days: 0 });
    expect(calendarSpanYmd("2020-02-29", "2021-03-01")).toEqual({ years: 1, months: 0, days: 1 });
    expect(calendarSpanYmd("2020-02-29", "2024-02-29")).toEqual({ years: 4, months: 0, days: 0 });
  });
});

describe("addLifeExpectancyActuarial30Day", () => {
  it("15.04.2024 + 6y 9m 22d => 07.02.2031", () => {
    expect(addLifeExpectancyActuarial30Day("2024-04-15", 6, 9, 22)).toBe("2031-02-07");
  });

  it("A) 10.05.2024 + 1y 2m 10d => 20.07.2025", () => {
    expect(addLifeExpectancyActuarial30Day("2024-05-10", 1, 2, 10)).toBe("2025-07-20");
  });

  it("B) 25.11.2024 + 0y 2m 10d => 05.02.2025", () => {
    expect(addLifeExpectancyActuarial30Day("2024-11-25", 0, 2, 10)).toBe("2025-02-05");
  });

  it("C) 30.12.2024 + 0y 0m 1d => 01.01.2025", () => {
    expect(addLifeExpectancyActuarial30Day("2024-12-30", 0, 0, 1)).toBe("2025-01-01");
  });
});
