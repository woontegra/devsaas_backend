import type { AccidentIncomeBlock, IncomeMode, ValidationIssue } from "./types.js";
import { getNetMinWageForDate } from "../data/netMinWage.js";
import { isValidIsoDateOnly, pushError, pushWarning } from "./validationHelpers.js";

export function resolveIncomeMode(block: AccidentIncomeBlock | undefined): IncomeMode {
  if (!block) return "minWage";
  if (block.incomeMode === "minWage" || block.incomeMode === "fixed" || block.incomeMode === "average") {
    return block.incomeMode;
  }
  if (block.useAverage) return "average";
  if (typeof block.fixedAmount === "number" && block.fixedAmount > 0) return "fixed";
  return "minWage";
}

export function validateAccidentIncome(
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  income: AccidentIncomeBlock | undefined,
  eventDate: string | undefined,
  fieldPrefix = "accidentIncome"
): void {
  const block = income ?? {
    incomeMode: "minWage" as const,
    fixedAmount: null,
    averageSources: [],
  };
  const mode = resolveIncomeMode(block);

  if (typeof block.fixedAmount === "number" && block.fixedAmount < 0) {
    pushError(errors, `${fieldPrefix}.fixedAmount`, "NEGATIVE_AMOUNT", "Sabit gelir negatif olamaz.");
  }

  const sources = Array.isArray(block.averageSources) ? block.averageSources : [];
  sources.forEach((s, i) => {
    const prefix = `${fieldPrefix}.averageSources[${i}]`;
    if (typeof s.amount !== "number" || Number.isNaN(s.amount)) {
      pushError(errors, `${prefix}.amount`, "INVALID_NUMBER", "Gelir tutarı sayı olmalıdır.");
    } else if (s.amount < 0) {
      pushError(errors, `${prefix}.amount`, "NEGATIVE_AMOUNT", "Gelir tutarı negatif olamaz.");
    }
    if (s.amountKind === "gross" && s.amount > 0) {
      if (typeof s.netAmount !== "number" || Number.isNaN(s.netAmount)) {
        pushError(
          errors,
          `${prefix}.netAmount`,
          "REQUIRED",
          "Brüt tutar için net karşılık hesaplanmalıdır."
        );
      } else if (s.netAmount < 0) {
        pushError(errors, `${prefix}.netAmount`, "NEGATIVE_AMOUNT", "Net karşılık negatif olamaz.");
      }
    }
  });

  if (mode === "minWage") {
    if (!isValidIsoDateOnly(eventDate)) {
      pushWarning(
        warnings,
        fieldPrefix,
        "INCOME_EVENT_DATE_MISSING",
        "Asgari ücret modu için geçerli kaza tarihi gereklidir."
      );
    } else if (getNetMinWageForDate(eventDate) == null) {
      pushWarning(
        warnings,
        fieldPrefix,
        "MIN_WAGE_PERIOD_MISSING",
        `${eventDate} tarihi için tanımlı net asgari ücret dönemi bulunamadı.`
      );
    }
    return;
  }

  if (mode === "fixed") {
    if (typeof block.fixedAmount !== "number" || Number.isNaN(block.fixedAmount) || block.fixedAmount <= 0) {
      pushWarning(warnings, `${fieldPrefix}.fixedAmount`, "INCOME_MISSING", "Sabit gelir tutarı girilmelidir.");
    }
    return;
  }

  if (mode === "average") {
    if (
      typeof block.averageNetResult !== "number" ||
      Number.isNaN(block.averageNetResult) ||
      block.averageNetResult <= 0
    ) {
      pushWarning(
        warnings,
        `${fieldPrefix}.averageNetResult`,
        "INCOME_MISSING",
        "Ortalama gelir modunda hesaplanmış ortalama net gelir girilmelidir."
      );
    }
    if (sources.length === 0) {
      pushWarning(
        warnings,
        `${fieldPrefix}.averageSources`,
        "AVERAGE_INCOME_EMPTY",
        "Ortalama gelir seçildi ancak kaynak eklenmedi."
      );
    }
  }
}
