import type { IncomePeriod, ValidationIssue } from "./types.js";
import { actuarialDays360Inclusive } from "./trafficInjury/dayCount360.js";

export type DateRangeLike = { startDate: string; endDate: string };

export const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function isValidIsoDateOnly(s: unknown): s is string {
  if (typeof s !== "string" || !ISO_DATE_ONLY.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === s;
}

export function parseIsoDate(s: string): number {
  return new Date(`${s}T00:00:00.000Z`).getTime();
}

export function isInRange(n: number, min: number, max: number): boolean {
  return typeof n === "number" && !Number.isNaN(n) && n >= min && n <= max;
}

export function pushError(errors: ValidationIssue[], field: string, code: string, message: string): void {
  errors.push({ field, code, message });
}

export function pushWarning(warnings: ValidationIssue[], field: string, code: string, message: string): void {
  warnings.push({ field, code, message });
}

export function validateCommonDates(
  errors: ValidationIssue[],
  eventDate: unknown,
  calculationDate: unknown,
  birthDate?: unknown,
  deathDate?: unknown
): void {
  if (!isValidIsoDateOnly(eventDate)) {
    pushError(errors, "common.eventDate", "INVALID_DATE", "Olay tarihi geçerli YYYY-MM-DD formatında olmalıdır.");
  }
  if (!isValidIsoDateOnly(calculationDate)) {
    pushError(
      errors,
      "common.calculationDate",
      "INVALID_DATE",
      "Hesap tarihi geçerli YYYY-MM-DD formatında olmalıdır."
    );
  }
  if (
    isValidIsoDateOnly(eventDate) &&
    isValidIsoDateOnly(calculationDate) &&
    parseIsoDate(eventDate) > parseIsoDate(calculationDate)
  ) {
    pushError(errors, "common.eventDate", "EVENT_AFTER_CALCULATION", "Olay tarihi hesap tarihinden sonra olamaz.");
  }
  if (birthDate !== undefined) {
    if (!birthDate || (typeof birthDate === "string" && birthDate.trim() === "")) {
      pushError(errors, "person.birthDate", "REQUIRED", "Doğum tarihi zorunludur.");
    } else if (!isValidIsoDateOnly(birthDate)) {
      pushError(errors, "person.birthDate", "INVALID_DATE", "Doğum tarihi geçerli YYYY-MM-DD formatında olmalıdır.");
    } else if (isValidIsoDateOnly(eventDate) && parseIsoDate(birthDate) >= parseIsoDate(eventDate)) {
      pushError(
        errors,
        "person.birthDate",
        "INVALID_DATE_ORDER",
        "Doğum tarihi olay tarihinden önce olmalıdır."
      );
    }
  }
  if (deathDate !== undefined && deathDate !== "" && deathDate != null) {
    if (!isValidIsoDateOnly(deathDate)) {
      pushError(errors, "person.deathDate", "INVALID_DATE", "Ölüm tarihi geçerli olmalıdır.");
    } else if (isValidIsoDateOnly(birthDate) && parseIsoDate(birthDate as string) > parseIsoDate(deathDate)) {
      pushError(
        errors,
        "person.birthDate",
        "INVALID_DATE_ORDER",
        "Doğum tarihi ölüm tarihinden sonra olamaz."
      );
    }
  }
}

export function validateIncomePeriods(
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  periods: IncomePeriod[],
  fieldPrefix = "incomePeriods"
): void {
  if (!Array.isArray(periods) || periods.length === 0) {
    pushError(errors, fieldPrefix, "REQUIRED", "En az bir gelir dönemi girilmelidir.");
    return;
  }
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i]!;
    const prefix = `${fieldPrefix}[${i}]`;
    if (!isValidIsoDateOnly(p.startDate)) {
      pushError(errors, `${prefix}.startDate`, "INVALID_DATE", "Gelir başlangıç tarihi geçerli olmalıdır.");
    }
    if (p.endDate && !isValidIsoDateOnly(p.endDate)) {
      pushError(errors, `${prefix}.endDate`, "INVALID_DATE", "Gelir bitiş tarihi geçerli olmalıdır.");
    }
    if (
      isValidIsoDateOnly(p.startDate) &&
      p.endDate &&
      isValidIsoDateOnly(p.endDate) &&
      parseIsoDate(p.startDate) > parseIsoDate(p.endDate)
    ) {
      pushError(errors, `${prefix}.startDate`, "INVALID_DATE_RANGE", "Gelir başlangıcı bitişten sonra olamaz.");
    }
    if (typeof p.amount !== "number" || Number.isNaN(p.amount)) {
      pushError(errors, `${prefix}.amount`, "INVALID_NUMBER", "Gelir tutarı sayı olmalıdır.");
    } else if (p.amount < 0) {
      pushError(errors, `${prefix}.amount`, "NEGATIVE_AMOUNT", "Gelir tutarı negatif olamaz.");
    } else if (p.amount === 0) {
      pushWarning(warnings, `${prefix}.amount`, "ZERO_AMOUNT", "Gelir tutarı sıfır.");
    }
  }
  for (let i = 0; i < periods.length; i++) {
    for (let j = i + 1; j < periods.length; j++) {
      const a = periods[i]!;
      const b = periods[j]!;
      if (!isValidIsoDateOnly(a.startDate) || !isValidIsoDateOnly(b.startDate)) continue;
      const aEnd = a.endDate && isValidIsoDateOnly(a.endDate) ? a.endDate : "9999-12-31";
      const bEnd = b.endDate && isValidIsoDateOnly(b.endDate) ? b.endDate : "9999-12-31";
      if (parseIsoDate(a.startDate) <= parseIsoDate(bEnd) && parseIsoDate(b.startDate) <= parseIsoDate(aEnd)) {
        pushError(
          errors,
          `${fieldPrefix}[${i}]`,
          "OVERLAPPING_INCOME_PERIODS",
          `Gelir dönemleri çakışıyor (satır ${i + 1} ve ${j + 1}).`
        );
      }
    }
  }
}

export function validateLiability(
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  injuredFaultRatio: unknown,
  parties: { faultRatio: number }[] | undefined,
  inevitabilityRatio?: unknown
): void {
  if (typeof injuredFaultRatio !== "number" || Number.isNaN(injuredFaultRatio)) {
    pushError(errors, "liability.injuredFaultRatio", "INVALID_NUMBER", "Kusur oranı sayı olmalıdır.");
  } else if (!isInRange(injuredFaultRatio, 0, 100)) {
    pushError(errors, "liability.injuredFaultRatio", "OUT_OF_RANGE", "Kusur oranı 0 ile 100 arasında olmalıdır.");
  }
  let sum = typeof injuredFaultRatio === "number" && !Number.isNaN(injuredFaultRatio) ? injuredFaultRatio : 0;
  const list = Array.isArray(parties) ? parties : [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i]!.faultRatio;
    if (typeof r !== "number" || Number.isNaN(r)) {
      pushError(errors, `liability.parties[${i}].faultRatio`, "INVALID_NUMBER", "Kusur oranı sayı olmalıdır.");
    } else if (!isInRange(r, 0, 100)) {
      pushError(errors, `liability.parties[${i}].faultRatio`, "OUT_OF_RANGE", "Kusur oranı 0–100 arasında olmalıdır.");
    } else {
      sum += r;
    }
  }
  if (inevitabilityRatio !== undefined && inevitabilityRatio !== null && inevitabilityRatio !== "") {
    if (typeof inevitabilityRatio !== "number" || Number.isNaN(inevitabilityRatio)) {
      pushError(errors, "liability.inevitabilityRatio", "INVALID_NUMBER", "Kaçınılmazlık oranı sayı olmalıdır.");
    } else if (!isInRange(inevitabilityRatio, 0, 100)) {
      pushError(errors, "liability.inevitabilityRatio", "OUT_OF_RANGE", "Kaçınılmazlık oranı 0–100 arasında olmalıdır.");
    } else {
      sum += inevitabilityRatio;
    }
  }
  if (Math.abs(sum - 100) > 0.01) {
    pushWarning(
      warnings,
      "liability",
      "FAULT_SUM_NOT_100",
      `Kusur / sorumluluk oranları toplamı %${sum.toFixed(2)} (100 beklenir). Oranlar otomatik değiştirilmez.`
    );
  }
}

export function validateDateRangePair(
  errors: ValidationIssue[],
  range: { startDate: string; endDate: string },
  fieldPrefix: string,
  index: number
): void {
  const startField = `${fieldPrefix}[${index}].startDate`;
  const endField = `${fieldPrefix}[${index}].endDate`;
  if (!isValidIsoDateOnly(range.startDate)) {
    pushError(errors, startField, "INVALID_DATE", "Başlangıç tarihi geçerli olmalıdır.");
  }
  if (!isValidIsoDateOnly(range.endDate)) {
    pushError(errors, endField, "INVALID_DATE", "Bitiş tarihi geçerli olmalıdır.");
  }
  if (
    isValidIsoDateOnly(range.startDate) &&
    isValidIsoDateOnly(range.endDate) &&
    parseIsoDate(range.startDate) > parseIsoDate(range.endDate)
  ) {
    pushError(errors, startField, "INVALID_DATE_RANGE", "Başlangıç tarihi bitiş tarihinden sonra olamaz.");
  }
}

export function validateNonNegativeAmounts(
  errors: ValidationIssue[],
  items: { amount?: number }[],
  fieldPrefix: string
): void {
  for (let i = 0; i < items.length; i++) {
    const a = items[i]!.amount;
    if (a === undefined) continue;
    if (typeof a !== "number" || Number.isNaN(a)) {
      pushError(errors, `${fieldPrefix}[${i}].amount`, "INVALID_NUMBER", "Tutar sayı olmalıdır.");
    } else if (a < 0) {
      pushError(errors, `${fieldPrefix}[${i}].amount`, "NEGATIVE_AMOUNT", "Tutar negatif olamaz.");
    }
  }
}

export function sectionOk(errors: ValidationIssue[], prefixes: string[]): boolean {
  return !errors.some((e) => prefixes.some((p) => e.field === p || e.field.startsWith(`${p}.`) || e.field.startsWith(`${p}[`)));
}

export function isBlankString(v: unknown): boolean {
  return typeof v !== "string" || v.trim() === "";
}

/** 30/360 aktüeryal dahil gün sayısı — form ve motor ile aynı (dayCount360.ts). */
export function computeInclusiveDayCount(startDate: string, endDate: string): number | null {
  if (!isValidIsoDateOnly(startDate) || !isValidIsoDateOnly(endDate)) return null;
  if (parseIsoDate(startDate) > parseIsoDate(endDate)) return null;
  const days = actuarialDays360Inclusive(startDate, endDate);
  return days > 0 ? days : null;
}

export function validateOptionalIsoDate(
  errors: ValidationIssue[],
  value: unknown,
  field: string,
  label = "Tarih"
): void {
  if (isBlankString(value)) return;
  if (!isValidIsoDateOnly(value)) {
    pushError(errors, field, "INVALID_DATE", `${label} geçerli YYYY-MM-DD formatında olmalıdır.`);
  }
}

export function validateNonNegativeNumberField(
  errors: ValidationIssue[],
  value: unknown,
  field: string,
  label: string
): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "number" || Number.isNaN(value)) {
    pushError(errors, field, "INVALID_NUMBER", `${label} sayı olmalıdır.`);
  } else if (value < 0) {
    pushError(errors, field, "NEGATIVE_AMOUNT", `${label} negatif olamaz.`);
  }
}
