import { describe, it, expect } from "vitest";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";
import type { TrafficDeathDraft } from "./types.js";
import {
  isTrafficDeathIncomeSectionComplete,
  resolveTrafficDeathEffectiveNetIncome,
  resolveWorkingAccidentIncomeAmount,
} from "./trafficDeathIncomeUtils.js";
import { getNetMinWageForDate } from "../data/netMinWage.js";

function baseDeath(over: Partial<TrafficDeathDraft> = {}): TrafficDeathDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_DEATH",
    common: { eventDate: "2020-06-01", calculationDate: "2024-01-15" },
    deceased: {
      birthDate: "1970-01-01",
      deathDate: "2020-06-01",
      gender: "male",
      fullName: "Ahmet",
    },
    employmentStatus: "WORKING",
    accidentIncome: { incomeMode: "fixed", fixedAmount: 12000, averageSources: [] },
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

describe("trafficDeathIncomeUtils", () => {
  it("WORKING + minWage → kaza tarihindeki net asgari ücret", () => {
    const eventDate = "2020-06-01";
    const draft = baseDeath({
      accidentIncome: { incomeMode: "minWage", fixedAmount: null, averageSources: [] },
    });
    expect(resolveWorkingAccidentIncomeAmount(draft.accidentIncome, eventDate)).toBe(
      getNetMinWageForDate(eventDate)
    );
    expect(resolveTrafficDeathEffectiveNetIncome(draft)).toBe(getNetMinWageForDate(eventDate));
  });

  it("NOT_WORKING → kullanıcı girişi esas gelir olur", () => {
    const draft = baseDeath({
      employmentStatus: "NOT_WORKING",
      nonWorkingSelectedIncome: 7500,
    });
    expect(resolveTrafficDeathEffectiveNetIncome(draft)).toBe(7500);
    expect(isTrafficDeathIncomeSectionComplete(draft)).toBe(true);
  });

  it("employmentStatus null → bölüm tamamlanmamış", () => {
    const draft = baseDeath({ employmentStatus: null });
    expect(isTrafficDeathIncomeSectionComplete(draft)).toBe(false);
    expect(resolveTrafficDeathEffectiveNetIncome(draft)).toBeNull();
  });

  it("NOT_WORKING + boş gelir → tamamlanmamış", () => {
    const draft = baseDeath({
      employmentStatus: "NOT_WORKING",
      nonWorkingSelectedIncome: null,
    });
    expect(isTrafficDeathIncomeSectionComplete(draft)).toBe(false);
  });
});
