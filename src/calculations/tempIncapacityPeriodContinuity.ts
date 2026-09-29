import type { TemporaryIncapacityPeriod, ValidationIssue } from "./types.js";
import { addDaysIso, compareIso } from "./trafficInjury/dateUtils.js";
import { pushError } from "./validationHelpers.js";
import { getFilledTemporaryPeriodsSorted } from "./tempIncapacityPeriodUtils.js";

export const TEMP_INCAPACITY_PERIOD_OVERLAP = "TEMP_INCAPACITY_PERIOD_OVERLAP" as const;
export const TEMP_INCAPACITY_PERIOD_GAP = "TEMP_INCAPACITY_PERIOD_GAP" as const;

export const TEMP_INCAPACITY_PERIOD_OVERLAP_TITLE =
  "Geçici iş göremezlik dönemleri birbiriyle örtüşüyor";

export const TEMP_INCAPACITY_PERIOD_OVERLAP_MESSAGE =
  "Yeni dönem başlangıç tarihi önceki hastane raporu bitiş tarihinden sonra olmalıdır.";

export const TEMP_INCAPACITY_PERIOD_GAP_TITLE =
  "Geçici iş göremezlik dönemleri arasında boşluk bulunuyor";

export const TEMP_INCAPACITY_PERIOD_GAP_MESSAGE =
  "Yeni dönem başlangıç tarihi önceki hastane raporu bitiş tarihinin hemen ertesi günü olmalıdır.";

export function validateTempIncapacityPeriodContinuity(
  errors: ValidationIssue[],
  periods: TemporaryIncapacityPeriod[],
  ignoreGaps: boolean
): void {
  const filled = getFilledTemporaryPeriodsSorted(periods);
  if (filled.length <= 1) return;

  for (let i = 1; i < filled.length; i++) {
    const prev = filled[i - 1]!;
    const curr = filled[i]!;
    const expectedStart = addDaysIso(prev.endDate, 1);
    if (curr.startDate === expectedStart) continue;

    const currStartField = `temporaryIncapacityPeriods[${curr.index}].startDate`;
    const prevEndField = `temporaryIncapacityPeriods[${prev.index}].endDate`;

    if (compareIso(curr.startDate, prev.endDate) <= 0) {
      pushError(
        errors,
        currStartField,
        TEMP_INCAPACITY_PERIOD_OVERLAP,
        TEMP_INCAPACITY_PERIOD_OVERLAP_MESSAGE
      );
      pushError(
        errors,
        prevEndField,
        TEMP_INCAPACITY_PERIOD_OVERLAP,
        TEMP_INCAPACITY_PERIOD_OVERLAP_MESSAGE
      );
      return;
    }

    if (!ignoreGaps) {
      pushError(
        errors,
        currStartField,
        TEMP_INCAPACITY_PERIOD_GAP,
        TEMP_INCAPACITY_PERIOD_GAP_MESSAGE
      );
      pushError(
        errors,
        prevEndField,
        TEMP_INCAPACITY_PERIOD_GAP,
        TEMP_INCAPACITY_PERIOD_GAP_MESSAGE
      );
      pushError(errors, "temporaryIncapacityIgnoreGaps", TEMP_INCAPACITY_PERIOD_GAP, TEMP_INCAPACITY_PERIOD_GAP_MESSAGE);
      return;
    }
  }
}

export function hasTempIncapacityPeriodContinuityIssue(errors: ValidationIssue[]): boolean {
  return errors.some(
    (e) =>
      e.code === TEMP_INCAPACITY_PERIOD_OVERLAP || e.code === TEMP_INCAPACITY_PERIOD_GAP
  );
}
