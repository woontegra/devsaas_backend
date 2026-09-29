import type { TemporaryIncapacityPeriod, ValidationIssue } from "./types.js";
import { addDaysIso, compareIso } from "./trafficInjury/dateUtils.js";
import { isBlankString, isValidIsoDateOnly, pushError } from "./validationHelpers.js";

export const TEMP_DISABILITY_GAP = "TEMP_DISABILITY_GAP" as const;
export const TEMP_DISABILITY_OVERLAP = "TEMP_DISABILITY_OVERLAP" as const;

export const TEMP_DISABILITY_GAP_MESSAGE =
  "Hastane raporu bitiş tarihi ile maluliyet başlangıç tarihi arasında boşluk gün olmamalı.";

export const TEMP_DISABILITY_OVERLAP_MESSAGE =
  "Maluliyet başlangıç tarihi hastane raporu bitiş tarihinden önce olamaz.";

function isTempPeriodEndUsable(row: TemporaryIncapacityPeriod): boolean {
  return !isBlankString(row.endDate) && isValidIsoDateOnly(row.endDate);
}

export function findLastTemporaryIncapacityEnd(
  periods: TemporaryIncapacityPeriod[]
): { endDate: string; index: number } | null {
  let best: { endDate: string; index: number } | null = null;
  for (let i = 0; i < periods.length; i++) {
    const row = periods[i]!;
    if (!isTempPeriodEndUsable(row)) continue;
    if (!best || compareIso(row.endDate, best.endDate) > 0) {
      best = { endDate: row.endDate, index: i };
    }
  }
  return best;
}

/** Geçici İG son bitiş ile maluliyet başlangıcı arasında takvim günü sürekliliği */
export function validateTempDisabilityContinuity(
  errors: ValidationIssue[],
  periods: TemporaryIncapacityPeriod[],
  disabilityStartDate: string | undefined
): void {
  const last = findLastTemporaryIncapacityEnd(periods);
  if (!last) return;

  const start = disabilityStartDate?.trim();
  if (!start || !isValidIsoDateOnly(start)) return;

  const expected = addDaysIso(last.endDate, 1);
  if (start === expected) return;

  const endField = `temporaryIncapacityPeriods[${last.index}].endDate`;
  if (compareIso(start, last.endDate) <= 0) {
    pushError(errors, "disability.disabilityStartDate", TEMP_DISABILITY_OVERLAP, TEMP_DISABILITY_OVERLAP_MESSAGE);
    pushError(errors, endField, TEMP_DISABILITY_OVERLAP, TEMP_DISABILITY_OVERLAP_MESSAGE);
  } else {
    pushError(errors, "disability.disabilityStartDate", TEMP_DISABILITY_GAP, TEMP_DISABILITY_GAP_MESSAGE);
    pushError(errors, endField, TEMP_DISABILITY_GAP, TEMP_DISABILITY_GAP_MESSAGE);
  }
}

export function hasTempDisabilityContinuityIssue(errors: ValidationIssue[]): boolean {
  return errors.some(
    (e) => e.code === TEMP_DISABILITY_GAP || e.code === TEMP_DISABILITY_OVERLAP
  );
}
