import { actuarialDays360Inclusive } from "./dayCount360.js";
import { discountRawForKn, knRawForPeriod } from "./knFormat.js";
import { dailyFromMonthly, roundMoney } from "./money.js";
import type { ResolvedIncome } from "./resolveIncome.js";
import type { FuturePeriodSegment, TrafficInjuryPeriodRow } from "./types.js";

export function calculateFuturePermanent(
  segments: FuturePeriodSegment[],
  income: ResolvedIncome,
  disabilityRate: number
): { rows: TrafficInjuryPeriodRow[]; total: number } {
  const monthlyNetIncome = income.monthlyNetAtCalculation;
  const dailyNetIncome = dailyFromMonthly(monthlyNetIncome);
  const rows: TrafficInjuryPeriodRow[] = [];

  for (const seg of segments) {
    const dayCount = actuarialDays360Inclusive(seg.startDate, seg.endDate);
    if (dayCount <= 0) continue;

    const knRaw = knRawForPeriod(seg.periodIndex);
    const discountRaw = discountRawForKn(knRaw);
    const increasedIncome = roundMoney(dailyNetIncome * dayCount * knRaw);
    const discountedIncome = roundMoney(increasedIncome / knRaw);
    const periodDamage = roundMoney(discountedIncome * (disabilityRate / 100));

    rows.push({
      startDate: seg.startDate,
      endDate: seg.endDate,
      dayCount,
      monthlyNetIncome,
      dailyNetIncome,
      kn: knRaw,
      discountFactor: discountRaw,
      increasedIncome,
      discountedIncome,
      disabilityRate,
      periodDamage,
      periodKind: "future_permanent",
      phase: seg.phase,
    });
  }

  const total = roundMoney(rows.reduce((s, r) => s + r.periodDamage, 0));
  return { rows, total };
}
