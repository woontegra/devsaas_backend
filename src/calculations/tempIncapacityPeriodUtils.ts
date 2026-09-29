import type { TemporaryIncapacityPeriod } from "./types.js";
import { addDaysIso, compareIso } from "./trafficInjury/dateUtils.js";
import { isBlankString, isValidIsoDateOnly } from "./validationHelpers.js";

export interface FilledTemporaryPeriod {
  index: number;
  startDate: string;
  endDate: string;
}

export interface EffectiveTemporaryRange {
  startDate: string;
  endDate: string;
}

function isTempPeriodEmpty(row: TemporaryIncapacityPeriod): boolean {
  return (
    isBlankString(row.startDate) &&
    isBlankString(row.endDate) &&
    (row.dayCount == null || row.dayCount === 0) &&
    (row.rate == null || row.rate === 0) &&
    isBlankString(row.notes)
  );
}

function isTempPeriodFilled(row: TemporaryIncapacityPeriod): boolean {
  return (
    !isBlankString(row.startDate) &&
    !isBlankString(row.endDate) &&
    isValidIsoDateOnly(row.startDate) &&
    isValidIsoDateOnly(row.endDate)
  );
}

/** Kronolojik sıralı, dolu geçici İG dönemleri */
export function getFilledTemporaryPeriodsSorted(
  periods: TemporaryIncapacityPeriod[]
): FilledTemporaryPeriod[] {
  const filled: FilledTemporaryPeriod[] = [];
  for (let i = 0; i < periods.length; i++) {
    const row = periods[i]!;
    if (isTempPeriodEmpty(row) || !isTempPeriodFilled(row)) continue;
    filled.push({ index: i, startDate: row.startDate, endDate: row.endDate });
  }
  filled.sort((a, b) => compareIso(a.startDate, b.startDate));
  return filled;
}

export function computeEffectiveTemporaryRange(
  periods: TemporaryIncapacityPeriod[]
): EffectiveTemporaryRange | null {
  const filled = getFilledTemporaryPeriodsSorted(periods);
  if (filled.length === 0) return null;
  return {
    startDate: filled[0]!.startDate,
    endDate: filled[filled.length - 1]!.endDate,
  };
}

export function areTemporaryPeriodsConsecutive(periods: TemporaryIncapacityPeriod[]): boolean {
  const filled = getFilledTemporaryPeriodsSorted(periods);
  if (filled.length <= 1) return true;
  for (let i = 1; i < filled.length; i++) {
    const expected = addDaysIso(filled[i - 1]!.endDate, 1);
    if (filled[i]!.startDate !== expected) return false;
  }
  return true;
}

export function findFirstFilledTemporaryPeriod(
  periods: TemporaryIncapacityPeriod[]
): FilledTemporaryPeriod | null {
  const filled = getFilledTemporaryPeriodsSorted(periods);
  return filled[0] ?? null;
}

export function findLastFilledTemporaryPeriod(
  periods: TemporaryIncapacityPeriod[]
): FilledTemporaryPeriod | null {
  const filled = getFilledTemporaryPeriodsSorted(periods);
  return filled.length > 0 ? filled[filled.length - 1]! : null;
}
