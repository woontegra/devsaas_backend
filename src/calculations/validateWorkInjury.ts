import type {
  CalculationValidateResponse,
  ValidationIssue,
  WorkInjuryDraft,
} from "./types.js";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";
import {
  isInRange,
  isObject,
  pushError,
  pushWarning,
  sectionOk,
  validateCommonDates,
  validateDateRangePair,
  validateIncomePeriods,
  validateLiability,
  validateNonNegativeAmounts,
} from "./validationHelpers.js";

export function validateWorkInjuryDraft(input: unknown): CalculationValidateResponse {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!isObject(input) || input.calculationType !== "WORK_INJURY") {
    return {
      valid: false,
      schemaVersion: CALCULATION_SCHEMA_VERSION,
      errors: [{ field: "calculationType", code: "INVALID_TYPE", message: "Geçersiz iş kazası yaralanma taslağı." }],
      warnings: [],
      completedSections: [],
      missingSections: ["caseEvent", "employee", "employment", "income", "liability", "disability"],
      message: "Geçersiz iş kazası yaralanma taslağı.",
    };
  }
  if (input.schemaVersion !== CALCULATION_SCHEMA_VERSION) {
    pushError(errors, "schemaVersion", "UNSUPPORTED_SCHEMA", "schemaVersion 2 olmalıdır.");
  }

  const draft = input as unknown as WorkInjuryDraft;
  const common = draft.common ?? ({} as WorkInjuryDraft["common"]);
  const employee = draft.employee ?? ({} as WorkInjuryDraft["employee"]);
  const employment = draft.employment ?? ({} as WorkInjuryDraft["employment"]);

  validateCommonDates(errors, common.eventDate, common.calculationDate, employee.birthDate);
  if (employee.gender !== "male" && employee.gender !== "female") {
    pushError(errors, "employee.gender", "INVALID_ENUM", "Cinsiyet zorunludur.");
  }
  if (!employment.employerName?.trim()) {
    pushError(errors, "employment.employerName", "REQUIRED", "İşveren bilgisi zorunludur.");
  }

  validateIncomePeriods(errors, warnings, draft.incomePeriods ?? []);
  validateLiability(
    errors,
    warnings,
    draft.liability?.injuredFaultRatio,
    draft.liability?.parties,
    draft.liability?.inevitabilityRatio
  );

  const rate = draft.disability?.permanentDisabilityRate;
  if (typeof rate !== "number" || Number.isNaN(rate)) {
    pushError(errors, "disability.permanentDisabilityRate", "REQUIRED", "İş göremezlik / maluliyet oranı zorunludur.");
  } else if (!isInRange(rate, 0, 100)) {
    pushError(errors, "disability.permanentDisabilityRate", "OUT_OF_RANGE", "Oran 0–100 arasında olmalıdır.");
  }

  const temp = draft.temporaryIncapacityPeriods ?? [];
  for (let i = 0; i < temp.length; i++) {
    validateDateRangePair(errors, temp[i]!, "temporaryIncapacityPeriods", i);
  }

  if (!draft.sgkIncome || draft.sgkIncome.length === 0) {
    pushWarning(
      warnings,
      "sgkIncome",
      "SGK_MISSING",
      "SGK geliri kaydı girilmemiş. Belge varsa eklemeniz önerilir."
    );
  }

  // PSD belgeleri — yalnızca biçim; hesap yok
  for (const doc of draft.capitalValueDocuments ?? []) {
    if (typeof doc.amount === "number" && doc.amount < 0) {
      pushError(errors, "capitalValueDocuments", "NEGATIVE_AMOUNT", "PSD belge tutarı negatif olamaz.");
    }
  }

  validateNonNegativeAmounts(errors, draft.careAndExpenses?.otherExpenses ?? [], "careAndExpenses.otherExpenses");
  validateNonNegativeAmounts(errors, draft.priorPayments ?? [], "priorPayments");

  const completed: string[] = [];
  const missing: string[] = [];
  const req: [string, string[], () => boolean][] = [
    ["caseEvent", ["common"], () => Boolean(common.eventDate && common.calculationDate)],
    ["employee", ["employee", "person"], () => Boolean(employee.birthDate && employee.gender)],
    ["employment", ["employment"], () => Boolean(employment.employerName?.trim())],
    ["income", ["incomePeriods"], () => (draft.incomePeriods?.length ?? 0) > 0],
    ["liability", ["liability"], () => draft.liability != null],
    ["disability", ["disability"], () => typeof draft.disability?.permanentDisabilityRate === "number"],
    ["temporaryIncapacity", ["temporaryIncapacityPeriods"], () => true],
    ["sgkIncome", ["sgkIncome"], () => true],
    ["capitalValueDocuments", ["capitalValueDocuments"], () => true],
    ["careAndExpenses", ["careAndExpenses"], () => true],
    ["priorPayments", ["priorPayments"], () => true],
  ];

  for (const [section, prefixes, hasData] of req) {
    const ok = sectionOk(errors, prefixes) && hasData();
    if (ok) completed.push(section);
    else if (
      ["caseEvent", "employee", "employment", "income", "liability", "disability"].includes(section)
    ) {
      missing.push(section);
    }
  }

  const valid = errors.length === 0 && missing.length === 0;
  return {
    valid,
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    errors,
    warnings,
    completedSections: completed,
    missingSections: missing,
    message: valid
      ? "Veriler hesaplamaya hazırlanmıştır."
      : "Veri doğrulaması başarısız. Eksik veya hatalı alanları düzeltin.",
  };
}
