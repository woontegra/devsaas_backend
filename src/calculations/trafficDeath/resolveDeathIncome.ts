import { getNetMinWageForDate } from "../../data/netMinWage.js";
import type { TrafficDeathDraft } from "../types.js";
import { resolveIncomeMode } from "../validateAccidentIncome.js";
import { dailyFromMonthly, roundMoney } from "../trafficInjury/money.js";
import type { TrafficDeathResolvedIncome } from "./types.js";

export interface DeathResolvedIncome extends TrafficDeathResolvedIncome {
  getMonthlyNetForDate(date: string): number;
}

/**
 * TRAFFIC_INJURY resolveIncome ile aynı katsayı / asgari ücret merdiveni.
 * Çalışmıyor ise nonWorkingSelectedIncome sabit gelir gibi işlenir.
 */
export function resolveDeathIncome(draft: TrafficDeathDraft, warnings: string[]): DeathResolvedIncome {
  const eventDate = draft.common.eventDate || draft.deceased.deathDate;
  const calcDate = draft.common.calculationDate;

  const eventDateMinWage = eventDate ? getNetMinWageForDate(eventDate) : null;
  if (eventDate && eventDateMinWage == null) {
    warnings.push(`Olay tarihi (${eventDate}) için net asgari ücret dönemi bulunamadı.`);
  }

  let monthlyNetAtEvent: number;
  let incomeMode: string;

  if (draft.employmentStatus === "NOT_WORKING") {
    incomeMode = "fixed";
    monthlyNetAtEvent =
      typeof draft.nonWorkingSelectedIncome === "number" && Number.isFinite(draft.nonWorkingSelectedIncome)
        ? draft.nonWorkingSelectedIncome
        : 0;
  } else {
    incomeMode = resolveIncomeMode(draft.accidentIncome);
    if (incomeMode === "minWage") {
      monthlyNetAtEvent = eventDateMinWage ?? 0;
    } else if (incomeMode === "fixed") {
      monthlyNetAtEvent = draft.accidentIncome.fixedAmount ?? 0;
    } else {
      monthlyNetAtEvent = draft.accidentIncome.averageNetResult ?? 0;
    }
  }

  const coefficient =
    eventDateMinWage != null && eventDateMinWage > 0 ? monthlyNetAtEvent / eventDateMinWage : 1;

  const getMonthlyNetForDate = (date: string): number => {
    const minWage = getNetMinWageForDate(date);
    if (minWage == null) {
      warnings.push(`Tarih (${date}) için net asgari ücret dönemi bulunamadı; olay tarihi geliri kullanıldı.`);
      return monthlyNetAtEvent;
    }
    if (incomeMode === "minWage" && draft.employmentStatus === "WORKING") return minWage;
    return roundMoney(minWage * coefficient);
  };

  const monthlyNetAtCalculation = calcDate ? getMonthlyNetForDate(calcDate) : monthlyNetAtEvent;

  return {
    incomeMode,
    monthlyNetAtEvent: roundMoney(monthlyNetAtEvent),
    monthlyNetAtCalculation: roundMoney(monthlyNetAtCalculation),
    dailyNetAtCalculation: dailyFromMonthly(monthlyNetAtCalculation),
    coefficient,
    eventDateMinWage,
    getMonthlyNetForDate,
  };
}
