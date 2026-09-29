import type { TemporaryIncapacityPeriod, ValidationIssue } from "./types.js";
import { compareIso } from "./trafficInjury/dateUtils.js";
import { isBlankString, isValidIsoDateOnly, pushError } from "./validationHelpers.js";

export const TEMP_INCAPACITY_START_MUST_MATCH_EVENT_DATE =
  "TEMP_INCAPACITY_START_MUST_MATCH_EVENT_DATE" as const;

export const TEMP_INCAPACITY_START_MUST_MATCH_EVENT_DATE_MESSAGE =
  "Hastane raporu / geçici iş göremezlik başlangıç tarihi kaza tarihinden önce veya sonra olamaz.";

function isTempPeriodEmpty(row: TemporaryIncapacityPeriod): boolean {
  return (
    isBlankString(row.startDate) &&
    isBlankString(row.endDate) &&
    (row.dayCount == null || row.dayCount === 0) &&
    (row.rate == null || row.rate === 0) &&
    isBlankString(row.notes)
  );
}

function isTempPeriodStartUsable(row: TemporaryIncapacityPeriod): boolean {
  return !isBlankString(row.startDate) && isValidIsoDateOnly(row.startDate);
}

/** Kronolojik olarak ilk geçici İG başlangıcı */
export function findFirstTemporaryIncapacityStart(
  periods: TemporaryIncapacityPeriod[]
): { startDate: string; index: number } | null {
  let best: { startDate: string; index: number } | null = null;
  for (let i = 0; i < periods.length; i++) {
    const row = periods[i]!;
    if (isTempPeriodEmpty(row)) continue;
    if (!isTempPeriodStartUsable(row)) continue;
    if (!best || compareIso(row.startDate, best.startDate) < 0) {
      best = { startDate: row.startDate, index: i };
    }
  }
  return best;
}

export function hasUsableTemporaryIncapacityPeriod(periods: TemporaryIncapacityPeriod[]): boolean {
  return findFirstTemporaryIncapacityStart(periods) != null;
}

/** İlk geçici İG başlangıcı kaza tarihi ile birebir aynı olmalı */
export function validateTempIncapacityStartMatchesEventDate(
  errors: ValidationIssue[],
  periods: TemporaryIncapacityPeriod[],
  eventDate: string | undefined
): void {
  const first = findFirstTemporaryIncapacityStart(periods);
  if (!first) return;

  const event = eventDate?.trim();
  if (!event || !isValidIsoDateOnly(event)) return;

  if (first.startDate === event) return;

  const startField = `temporaryIncapacityPeriods[${first.index}].startDate`;
  pushError(
    errors,
    startField,
    TEMP_INCAPACITY_START_MUST_MATCH_EVENT_DATE,
    TEMP_INCAPACITY_START_MUST_MATCH_EVENT_DATE_MESSAGE
  );
  pushError(
    errors,
    "common.eventDate",
    TEMP_INCAPACITY_START_MUST_MATCH_EVENT_DATE,
    TEMP_INCAPACITY_START_MUST_MATCH_EVENT_DATE_MESSAGE
  );
}

export function hasTempIncapacityStartEventDateIssue(errors: ValidationIssue[]): boolean {
  return errors.some((e) => e.code === TEMP_INCAPACITY_START_MUST_MATCH_EVENT_DATE);
}
