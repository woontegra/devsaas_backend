import { describe, it, expect } from "vitest";
import { resolvePersonLifeExpectancy } from "../shared/resolvePersonLifeExpectancy.js";
import {
  addLifeExpectancyActuarial30DayFromEntry,
  addLifeExpectancyToDate,
} from "../trafficInjury/dateUtils.js";
import { getTrh2010LifeExpectancy } from "../../data/trh2010.js";

describe("resolvePersonLifeExpectancy shared helper", () => {
  it("default (calendar) uses addLifeExpectancyToDate like TRAFFIC_INJURY", () => {
    const birth = "1945-01-01";
    const anchor = "2020-06-01";
    const result = resolvePersonLifeExpectancy(birth, anchor, "female");
    expect(result).not.toBeNull();

    const ageKey = result!.completedAgeYears!;
    const ymd = getTrh2010LifeExpectancy(ageKey, "female");
    const expected = addLifeExpectancyToDate(anchor, ymd);
    expect(result!.probableLifeEndDate).toBe(expected);
    expect(result!.remainingLifetime.years).toBe(ymd.year);
  });

  it("actuarial30 mode uses 30/12 carry for TRAFFIC_DEATH", () => {
    const birth = "1946-02-20";
    const anchor = "2024-04-15";
    const result = resolvePersonLifeExpectancy(birth, anchor, "male", {
      dateAddMode: "actuarial30",
    });
    expect(result).not.toBeNull();
    const ymd = result!.lifeExpectancyYmd;
    expect(result!.remainingLifetime).toMatchObject({
      years: ymd.year,
      months: ymd.month,
      days: ymd.day,
    });
    expect(result!.probableLifeEndDate).toBe(
      addLifeExpectancyActuarial30DayFromEntry(anchor, ymd)
    );
    expect(result!.probableLifeEndDate).not.toBe(addLifeExpectancyToDate(anchor, ymd));
  });

  it("actuarial30: 15.04.2024 + TRH 6y9m22d => 07.02.2031 for known deceased profile", () => {
    const result = resolvePersonLifeExpectancy("1946-02-20", "2024-04-15", "male", {
      dateAddMode: "actuarial30",
    });
    expect(result).not.toBeNull();
    expect(result!.remainingLifetime.years).toBe(6);
    expect(result!.remainingLifetime.months).toBe(9);
    expect(result!.remainingLifetime.days).toBe(22);
    expect(result!.probableLifeEndDate).toBe("2031-02-07");
  });
});
