import { getNetMinWageForDate } from "../../data/netMinWage.js";
import type { TrafficInjuryDraft } from "../types.js";
import { dailyFromMonthly, roundMoney } from "./money.js";
import type { ResolvedIncomeInfo } from "./types.js";

export interface ResolvedIncome extends ResolvedIncomeInfo {
  getMonthlyNetForDate(date: string): number;
}

export function resolveIncome(draft: TrafficInjuryDraft, warnings: string[]): ResolvedIncome {
  const eventDate = draft.common.eventDate;
  const calcDate = draft.common.calculationDate;
  const { incomeMode, fixedAmount, averageNetResult } = draft.accidentIncome;

  const eventDateMinWage = getNetMinWageForDate(eventDate);
  if (eventDateMinWage == null) {
    warnings.push(`Kaza tarihi (${eventDate}) için net asgari ücret dönemi bulunamadı.`);
  }

  let monthlyNetAtEvent: number;
  if (incomeMode === "minWage") {
    monthlyNetAtEvent = eventDateMinWage ?? 0;
  } else if (incomeMode === "fixed") {
    monthlyNetAtEvent = fixedAmount ?? 0;
  } else {
    monthlyNetAtEvent = averageNetResult ?? 0;
  }

  const coefficient =
    eventDateMinWage != null && eventDateMinWage > 0
      ? monthlyNetAtEvent / eventDateMinWage
      : 1;

  const getMonthlyNetForDate = (date: string): number => {
    const minWage = getNetMinWageForDate(date);
    if (minWage == null) {
      warnings.push(`Tarih (${date}) için net asgari ücret dönemi bulunamadı; kaza tarihi geliri kullanıldı.`);
      return monthlyNetAtEvent;
    }
    if (incomeMode === "minWage") return minWage;
    return roundMoney(minWage * coefficient);
  };

  const monthlyNetAtCalculation = getMonthlyNetForDate(calcDate);

  return {
    incomeMode,
    monthlyNetAtEvent,
    monthlyNetAtCalculation,
    dailyNetAtCalculation: dailyFromMonthly(monthlyNetAtCalculation),
    coefficient,
    eventDateMinWage,
    getMonthlyNetForDate,
  };
}
