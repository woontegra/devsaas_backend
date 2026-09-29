import { getTrh2010LifeExpectancy } from "../../data/trh2010.js";
import { getTrh2010DecimalLifeExpectancy } from "../../data/trh2010Decimal.js";
import type { Trh2010LifeEntry } from "../../data/trh2010.js";
import {
  addLifeExpectancyActuarial30DayFromEntry,
  addLifeExpectancyToDate,
  calendarAgeAtEvent,
  completedAgeYears,
} from "../trafficInjury/dateUtils.js";

export type LifeExpectancyDateAddMode = "calendar" | "actuarial30";

export interface PersonLifeExpectancyResult {
  completedAgeYears: number | null;
  ageAtAnchor: { years: number; months: number; days: number } | null;
  lifeExpectancyYmd: Trh2010LifeEntry;
  remainingLifetime: {
    years: number;
    months: number;
    days: number;
    decimalYears: number | null;
  };
  probableLifeEndDate: string | null;
}

export interface ResolvePersonLifeExpectancyOptions {
  /**
   * calendar = TRAFFIC_INJURY (varsayılan, takvimsel Date ekleme)
   * actuarial30 = TRAFFIC_DEATH (30 gün/12 ay taşımalı bilirkişi yöntemi)
   */
  dateAddMode?: LifeExpectancyDateAddMode;
}

/**
 * Kişi bazlı TRH bakiye ömür.
 * TRH Y/M/D ve decimal kaynağı aynıdır; yalnızca Y/M/D’nin anchor’a eklenme yöntemi mode ile ayrılır.
 */
export function resolvePersonLifeExpectancy(
  birthDate: string,
  anchorDate: string,
  gender: "male" | "female",
  options?: ResolvePersonLifeExpectancyOptions
): PersonLifeExpectancyResult | null {
  const ageYears = completedAgeYears(birthDate, anchorDate);
  if (ageYears == null) return null;

  const ageKey = ageYears;
  const ageAtAnchor = calendarAgeAtEvent(birthDate, anchorDate);
  const lifeExpectancyYmd = getTrh2010LifeExpectancy(ageKey, gender);
  const decimalLifeExpectancy = getTrh2010DecimalLifeExpectancy(ageKey, gender);
  const dateAddMode = options?.dateAddMode ?? "calendar";
  const probableLifeEndDate =
    dateAddMode === "actuarial30"
      ? addLifeExpectancyActuarial30DayFromEntry(anchorDate, lifeExpectancyYmd)
      : addLifeExpectancyToDate(anchorDate, lifeExpectancyYmd);

  return {
    completedAgeYears: ageYears,
    ageAtAnchor,
    lifeExpectancyYmd,
    remainingLifetime: {
      years: lifeExpectancyYmd.year,
      months: lifeExpectancyYmd.month,
      days: lifeExpectancyYmd.day,
      decimalYears: decimalLifeExpectancy,
    },
    probableLifeEndDate,
  };
}
