import type { TemporaryIncapacityPeriod, TrafficInjuryDraft } from "../types.js";
import { deriveTemporaryPeriodDayCount } from "./temporaryPeriodDayCount.js";
import {
  intersectRanges,
  splitByMinWagePeriods,
  type DateRange,
} from "./dateUtils.js";
import { dailyFromMonthly, roundMoney } from "./money.js";
import type { ResolvedIncome } from "./resolveIncome.js";
import type { TrafficInjuryPeriodRow } from "./types.js";
import type { ProcessedWindow } from "./buildProcessedPeriods.js";
import {
  areTemporaryPeriodsConsecutive,
  computeEffectiveTemporaryRange,
} from "../tempIncapacityPeriodUtils.js";

const TEMP_DISABILITY_RATE = 100;

function isTempPeriodFilled(p: TemporaryIncapacityPeriod): boolean {
  return Boolean(p.startDate && p.endDate);
}

function resolveTemporaryRanges(draft: TrafficInjuryDraft): DateRange[] {
  const periods = draft.temporaryIncapacityPeriods.filter(isTempPeriodFilled);
  if (periods.length === 0) return [];

  if (draft.temporaryIncapacityIgnoreGaps === true && periods.length > 1) {
    const effective = computeEffectiveTemporaryRange(draft.temporaryIncapacityPeriods);
    if (effective) return [effective];
  }

  return periods.map((p) => ({ startDate: p.startDate, endDate: p.endDate }));
}

export function calculateTemporaryIncapacity(
  draft: TrafficInjuryDraft,
  window: ProcessedWindow,
  income: ResolvedIncome
): { rows: TrafficInjuryPeriodRow[]; total: number } {
  const ranges = resolveTemporaryRanges(draft);
  const rows: TrafficInjuryPeriodRow[] = [];

  for (const tempRange of ranges) {
    const clipped = intersectRanges(tempRange, window);
    if (!clipped) continue;

    for (const seg of splitByMinWagePeriods(clipped)) {
      const dayCount = deriveTemporaryPeriodDayCount(seg.startDate, seg.endDate);
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

export function resolveTemporaryIncapacityGapIgnored(draft: TrafficInjuryDraft): boolean {
  if (draft.temporaryIncapacityIgnoreGaps !== true) return false;
  const effective = computeEffectiveTemporaryRange(draft.temporaryIncapacityPeriods);
  if (!effective) return false;
  return !areTemporaryPeriodsConsecutive(draft.temporaryIncapacityPeriods);
}
