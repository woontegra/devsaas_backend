import type { TemporaryIncapacityPeriod, TrafficInjuryDraft } from "../types.js";
import { actuarialDays360Inclusive } from "./dayCount360.js";
import {
  intersectRanges,
  splitByMinWagePeriods,
  type DateRange,
} from "./dateUtils.js";
import { dailyFromMonthly, roundMoney } from "./money.js";
import type { ResolvedIncome } from "./resolveIncome.js";
import type { TrafficInjuryPeriodRow } from "./types.js";
import type { ProcessedWindow } from "./buildProcessedPeriods.js";

const TEMP_DISABILITY_RATE = 100;

function isTempPeriodFilled(p: TemporaryIncapacityPeriod): boolean {
  return Boolean(p.startDate && p.endDate);
}

export function calculateTemporaryIncapacity(
  draft: TrafficInjuryDraft,
  window: ProcessedWindow,
  income: ResolvedIncome
): { rows: TrafficInjuryPeriodRow[]; total: number } {
  const periods = draft.temporaryIncapacityPeriods.filter(isTempPeriodFilled);
  const rows: TrafficInjuryPeriodRow[] = [];

  for (const temp of periods) {
    const tempRange: DateRange = { startDate: temp.startDate, endDate: temp.endDate };
    const clipped = intersectRanges(tempRange, window);
    if (!clipped) continue;

    for (const seg of splitByMinWagePeriods(clipped)) {
      const dayCount = actuarialDays360Inclusive(seg.startDate, seg.endDate);
      if (dayCount <= 0) continue;

      const monthlyNetIncome = income.getMonthlyNetForDate(seg.startDate);
      const dailyNetIncome = dailyFromMonthly(monthlyNetIncome);
      const periodDamage = roundMoney(dailyNetIncome * dayCount);

      rows.push({
        startDate: seg.startDate,
        endDate: seg.endDate,
        dayCount,
        monthlyNetIncome,
        dailyNetIncome,
        disabilityRate: TEMP_DISABILITY_RATE,
        periodDamage,
        periodKind: "temporary_incapacity",
      });
    }
  }

  const total = roundMoney(rows.reduce((s, r) => s + r.periodDamage, 0));
  return { rows, total };
}
