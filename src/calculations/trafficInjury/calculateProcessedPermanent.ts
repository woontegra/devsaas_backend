import type { TrafficInjuryDraft } from "../types.js";
import { actuarialDays360Inclusive } from "./dayCount360.js";
import {
  intersectRanges,
  splitByMinWagePeriods,
  subtractRanges,
  type DateRange,
} from "./dateUtils.js";
import { dailyFromMonthly, roundMoney } from "./money.js";
import type { ResolvedIncome } from "./resolveIncome.js";
import type { TrafficInjuryPeriodRow } from "./types.js";
import type { ProcessedWindow } from "./buildProcessedPeriods.js";
import { buildPermanentProcessedRange } from "./buildProcessedPeriods.js";

function tempExclusionRanges(draft: TrafficInjuryDraft, window: ProcessedWindow): DateRange[] {
  return draft.temporaryIncapacityPeriods
    .filter((p) => p.startDate && p.endDate)
    .map((p) => intersectRanges({ startDate: p.startDate, endDate: p.endDate }, window))
    .filter((r): r is DateRange => r != null);
}

export function calculateProcessedPermanent(
  draft: TrafficInjuryDraft,
  window: ProcessedWindow,
  income: ResolvedIncome
): { rows: TrafficInjuryPeriodRow[]; total: number } {
  const permanentRange = buildPermanentProcessedRange(draft, window);
  if (!permanentRange) return { rows: [], total: 0 };

  const disabilityRate = draft.disability.permanentDisabilityRate ?? 0;
  const exclusions = tempExclusionRanges(draft, window);
  const segments = subtractRanges(permanentRange, exclusions);

  const rows: TrafficInjuryPeriodRow[] = [];

  for (const seg of segments) {
    for (const wageSeg of splitByMinWagePeriods(seg)) {
      const dayCount = actuarialDays360Inclusive(wageSeg.startDate, wageSeg.endDate);
      if (dayCount <= 0) continue;

      const monthlyNetIncome = income.getMonthlyNetForDate(wageSeg.startDate);
      const dailyNetIncome = dailyFromMonthly(monthlyNetIncome);
      const grossLoss = roundMoney(dailyNetIncome * dayCount);
      const periodDamage = roundMoney(grossLoss * (disabilityRate / 100));

      rows.push({
        startDate: wageSeg.startDate,
        endDate: wageSeg.endDate,
        dayCount,
        monthlyNetIncome,
        dailyNetIncome,
        disabilityRate,
        periodDamage,
        periodKind: "processed_permanent",
      });
    }
  }

  const total = roundMoney(rows.reduce((s, r) => s + r.periodDamage, 0));
  return { rows, total };
}
