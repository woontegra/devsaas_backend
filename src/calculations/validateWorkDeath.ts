import type {
  CalculationValidateResponse,
  ValidationIssue,
  WorkDeathDraft,
} from "./types.js";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";
import {
  isObject,
  isValidIsoDateOnly,
  pushError,
  pushWarning,
  sectionOk,
  validateCommonDates,
  validateIncomePeriods,
  validateLiability,
  validateNonNegativeAmounts,
} from "./validationHelpers.js";

export function validateWorkDeathDraft(input: unknown): CalculationValidateResponse {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!isObject(input) || input.calculationType !== "WORK_DEATH") {
    return {
      valid: false,
      schemaVersion: CALCULATION_SCHEMA_VERSION,
      errors: [{ field: "calculationType", code: "INVALID_TYPE", message: "Geçersiz iş kazası ölüm taslağı." }],
      warnings: [],
      completedSections: [],
      missingSections: ["caseEvent", "deceasedEmployee", "employment", "income", "beneficiaries", "liability"],
      message: "Geçersiz iş kazası ölüm taslağı.",
    };
  }
  if (input.schemaVersion !== CALCULATION_SCHEMA_VERSION) {
    pushError(errors, "schemaVersion", "UNSUPPORTED_SCHEMA", "schemaVersion 2 olmalıdır.");
  }

  const draft = input as unknown as WorkDeathDraft;
  const common = draft.common ?? ({} as WorkDeathDraft["common"]);
  const deceased = draft.deceasedEmployee ?? ({} as WorkDeathDraft["deceasedEmployee"]);
  const employment = draft.employment ?? ({} as WorkDeathDraft["employment"]);

  validateCommonDates(
    errors,
    common.eventDate,
    common.calculationDate,
    deceased.birthDate,
    deceased.deathDate
  );
  if (!deceased.deathDate) {
    pushError(errors, "deceasedEmployee.deathDate", "REQUIRED", "Ölüm tarihi zorunludur.");
  }
  if (deceased.gender !== "male" && deceased.gender !== "female") {
    pushError(errors, "deceasedEmployee.gender", "INVALID_ENUM", "Cinsiyet zorunludur.");
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

  const beneficiaries = draft.beneficiaries ?? [];
  if (beneficiaries.length === 0) {
    pushError(errors, "beneficiaries", "REQUIRED", "Ölüm hesaplarında en az bir hak sahibi zorunludur.");
  }
  for (let i = 0; i < beneficiaries.length; i++) {
    const b = beneficiaries[i]!;
    if (!b.fullName?.trim()) {
      pushError(errors, `beneficiaries[${i}].fullName`, "REQUIRED", "Hak sahibi adı zorunludur.");
    }
    if (!isValidIsoDateOnly(b.birthDate)) {
      pushError(errors, `beneficiaries[${i}].birthDate`, "INVALID_DATE", "Hak sahibi doğum tarihi geçersiz.");
    }
  }

  if (!draft.sgkDeathIncomes || draft.sgkDeathIncomes.length === 0) {
    pushWarning(
      warnings,
      "sgkDeathIncomes",
      "SGK_DEATH_MISSING",
      "SGK ölüm geliri kaydı girilmemiş. Belge varsa eklemeniz önerilir."
    );
  }

  for (const doc of draft.capitalValueDocuments ?? []) {
    if (typeof doc.amount === "number" && doc.amount < 0) {
      pushError(errors, "capitalValueDocuments", "NEGATIVE_AMOUNT", "PSD belge tutarı negatif olamaz.");
    }
  }

  validateNonNegativeAmounts(errors, draft.expenses ?? [], "expenses");
  validateNonNegativeAmounts(errors, draft.priorPayments ?? [], "priorPayments");

  const completed: string[] = [];
  const missing: string[] = [];
  const req: [string, string[], () => boolean][] = [
    ["caseEvent", ["common"], () => Boolean(common.eventDate && common.calculationDate)],
    [
      "deceasedEmployee",
      ["deceasedEmployee", "person"],
      () => Boolean(deceased.birthDate && deceased.deathDate && deceased.gender),
    ],
    ["employment", ["employment"], () => Boolean(employment.employerName?.trim())],
    ["income", ["incomePeriods"], () => (draft.incomePeriods?.length ?? 0) > 0],
    ["beneficiaries", ["beneficiaries"], () => beneficiaries.length > 0],
    ["supportRelations", ["supportRelations"], () => true],
    ["liability", ["liability"], () => draft.liability != null],
    ["sgkDeathIncomes", ["sgkDeathIncomes"], () => true],
    ["capitalValueDocuments", ["capitalValueDocuments"], () => true],
    ["expenses", ["expenses"], () => true],
    ["priorPayments", ["priorPayments"], () => true],
  ];

  for (const [section, prefixes, hasData] of req) {
    const ok = sectionOk(errors, prefixes) && hasData();
    if (ok) completed.push(section);
    else if (
      ["caseEvent", "deceasedEmployee", "employment", "income", "beneficiaries", "liability"].includes(
        section
      )
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
