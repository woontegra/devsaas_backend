import { describe, it, expect } from "vitest";
import { actuarialDays360Inclusive } from "./dayCount360.js";
import { completedAgeYears } from "./dateUtils.js";
import {
  ACTUARIAL_DAY_COUNT_FIXTURES,
  CALENDAR_AGE_FIXTURES,
} from "./actuarialDayCount360.fixtures.js";
import { calculateTemporaryIncapacity } from "./calculateTemporaryIncapacity.js";
import { resolveIncome } from "./resolveIncome.js";
import { buildProcessedWindow } from "./buildProcessedPeriods.js";
import { calculateTrafficInjury } from "./calculateTrafficInjury.js";
import { CALCULATION_SCHEMA_VERSION } from "../types.js";
import type { TrafficInjuryDraft } from "../types.js";

describe("actuarialDayCount360 fixtures", () => {
  for (const fx of ACTUARIAL_DAY_COUNT_FIXTURES) {
    it(`${fx.label}: ${fx.start}–${fx.end} → ${fx.days}`, () => {
      expect(actuarialDays360Inclusive(fx.start, fx.end)).toBe(fx.days);
    });
  }
});

describe("completedCalendarAgeYears fixtures", () => {
  for (const fx of CALENDAR_AGE_FIXTURES) {
    it(`${fx.birth} / ${fx.event} → ${fx.age}`, () => {
      expect(completedAgeYears(fx.birth, fx.event)).toBe(fx.age);
    });
  }
});

describe("form gün sayısı = motor dayCount", () => {
  it("01.06.2020–31.08.2020 geçici İG satırında 90 gün", () => {
    const draft: TrafficInjuryDraft = {
      schemaVersion: CALCULATION_SCHEMA_VERSION,
      calculationType: "TRAFFIC_INJURY",
      common: { eventDate: "2020-06-01", calculationDate: "2021-01-01" },
      parties: {
        plaintiff: { firstName: "T", lastName: "K", birthDate: "1990-01-01", gender: "MALE" },
        defendants: [],
      },
      liability: { injuredFaultRatio: 0, parties: [] },
      disability: { permanentDisabilityRate: 10, disabilityStartDate: "2020-09-01" },
      temporaryIncapacityPeriods: [
        { id: "t1", startDate: "2020-06-01", endDate: "2020-08-31" },
      ],
      accidentIncome: { incomeMode: "fixed", fixedAmount: 30000, averageSources: [] },
      hospitalExpenses: [],
      travelExpenses: [],
      caregiverExpenses: [],
      capitalValueDocuments: [],
      zmtsPayments: [],
      cascoPayments: [],
    };

    const formDays = actuarialDays360Inclusive("2020-06-01", "2020-08-31");
    expect(formDays).toBe(90);

    const income = resolveIncome(draft, []);
    const window = buildProcessedWindow(draft);
    const { rows } = calculateTemporaryIncapacity(draft, window, income);
    expect(rows[0]!.dayCount).toBe(formDays);
  });
});

describe("result model", () => {
  it("permanentDisabilityRate sonuçta döner", () => {
    const draft: TrafficInjuryDraft = {
      schemaVersion: CALCULATION_SCHEMA_VERSION,
      calculationType: "TRAFFIC_INJURY",
      common: { eventDate: "2025-01-01", calculationDate: "2025-01-01" },
      parties: {
        plaintiff: { firstName: "T", lastName: "K", birthDate: "1990-01-01", gender: "MALE" },
        defendants: [],
      },
      liability: { injuredFaultRatio: 0, parties: [] },
      disability: { permanentDisabilityRate: 17, disabilityStartDate: "2025-01-01" },
      temporaryIncapacityPeriods: [],
      accidentIncome: { incomeMode: "fixed", fixedAmount: 17002.2, averageSources: [] },
      hospitalExpenses: [],
      travelExpenses: [],
      caregiverExpenses: [],
      capitalValueDocuments: [],
      zmtsPayments: [],
      cascoPayments: [],
    };
    const result = calculateTrafficInjury(draft);
    expect(result.permanentDisabilityRate).toBe(17);
  });
});
