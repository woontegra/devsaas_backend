import type { TrafficInjuryDraft, ValidationIssue } from "./types.js";
import { isValidIsoDateOnly, pushError } from "./validationHelpers.js";

export const DISABILITY_START_DATE_REQUIRED = "DISABILITY_START_DATE_REQUIRED" as const;

export const DISABILITY_START_DATE_REQUIRED_MESSAGE =
  "Maluliyet oranı girilmiş dosyalarda maluliyet başlangıç tarihi boş bırakılamaz.";

export class DisabilityStartDateRequiredError extends Error {
  readonly code = DISABILITY_START_DATE_REQUIRED;

  constructor(message = DISABILITY_START_DATE_REQUIRED_MESSAGE) {
    super(message);
    this.name = "DisabilityStartDateRequiredError";
  }
}

export function isDisabilityStartDateRequired(rate: number | undefined | null): boolean {
  return typeof rate === "number" && !Number.isNaN(rate) && rate > 0;
}

export function isDisabilityStartDatePresent(startDate: string | undefined | null): boolean {
  const start = startDate?.trim();
  return Boolean(start && isValidIsoDateOnly(start));
}

/** permanentDisabilityRate > 0 iken disabilityStartDate zorunlu */
export function validateDisabilityStartDateRequired(
  errors: ValidationIssue[],
  permanentDisabilityRate: number | undefined | null,
  disabilityStartDate: string | undefined | null
): void {
  if (!isDisabilityStartDateRequired(permanentDisabilityRate)) return;
  if (isDisabilityStartDatePresent(disabilityStartDate)) return;

  pushError(
    errors,
    "disability.disabilityStartDate",
    DISABILITY_START_DATE_REQUIRED,
    DISABILITY_START_DATE_REQUIRED_MESSAGE
  );
}

/** Validation bypass edilse bile motor yanlış tarih üretmesin */
export function assertDisabilityStartDateForCalculation(draft: TrafficInjuryDraft): void {
  const rate = draft.disability?.permanentDisabilityRate;
  if (!isDisabilityStartDateRequired(rate)) return;
  if (isDisabilityStartDatePresent(draft.disability?.disabilityStartDate)) return;
  throw new DisabilityStartDateRequiredError();
}

export function hasDisabilityStartDateRequiredIssue(errors: ValidationIssue[]): boolean {
  return errors.some((e) => e.code === DISABILITY_START_DATE_REQUIRED);
}
