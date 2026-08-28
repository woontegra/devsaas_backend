import { addDaysIso, minIso } from "./dateUtils.js";
import type { FuturePeriodPhase, FuturePeriodSegment } from "./types.js";

type DateRange = { startDate: string; endDate: string; phase: FuturePeriodPhase };

/** Pasif başlangıç tarihinde ACTIVE/PASSIVE yapısal bölme — formül aynı kalır */
function splitAtPassivePhase(
  start: string,
  end: string,
  passivePhaseStartDate: string | null
): DateRange[] {
  if (!passivePhaseStartDate) {
    return [{ startDate: start, endDate: end, phase: "ACTIVE" }];
  }
  if (passivePhaseStartDate > end) {
    return [{ startDate: start, endDate: end, phase: "ACTIVE" }];
  }
  if (passivePhaseStartDate <= start) {
    return [{ startDate: start, endDate: end, phase: "PASSIVE" }];
  }

  const activeEnd = addDaysIso(passivePhaseStartDate, -1);
  const ranges: DateRange[] = [];
  if (start <= activeEnd) {
    ranges.push({ startDate: start, endDate: activeEnd, phase: "ACTIVE" });
  }
  ranges.push({ startDate: passivePhaseStartDate, endDate: end, phase: "PASSIVE" });
  return ranges;
}

/** KN yıllık artış dönemine göre — takvim yılı bazlı, segment sayısına değil */
function periodIndexForYear(segmentYear: number, firstFutureYear: number): number {
  return segmentYear - firstFutureYear + 1;
}

/**
 * İşleyecek dönem: (calculationDate + 1 gün) … probableLifeEndDate (dahil).
 * Pasif başlangıçta yapısal ACTIVE/PASSIVE bölünmesi; aynı yıl aynı KN.
 */
export function buildFuturePeriods(
  calculationDate: string,
  probableLifeEndDate: string | null,
  passivePhaseStartDate: string | null = null
): FuturePeriodSegment[] {
  if (!probableLifeEndDate) return [];

  const futureStart = addDaysIso(calculationDate, 1);
  if (futureStart > probableLifeEndDate) return [];

  const firstFutureYear = parseInt(futureStart.slice(0, 4), 10);
  const segments: FuturePeriodSegment[] = [];
  let cursor = futureStart;

  while (cursor <= probableLifeEndDate) {
    const year = cursor.slice(0, 4);
    const yearEnd = minIso(`${year}-12-31`, probableLifeEndDate);
    const subRanges = splitAtPassivePhase(cursor, yearEnd, passivePhaseStartDate);
    const segmentYear = parseInt(year, 10);
    const periodIndex = periodIndexForYear(segmentYear, firstFutureYear);

    for (const range of subRanges) {
      segments.push({
        startDate: range.startDate,
        endDate: range.endDate,
        periodIndex,
        phase: range.phase,
      });
    }

    if (yearEnd >= probableLifeEndDate) break;
    cursor = addDaysIso(yearEnd, 1);
  }

  return segments;
}
