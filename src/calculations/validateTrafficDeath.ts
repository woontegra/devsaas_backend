import type {
  CalculationValidateResponse,
  TrafficDeathDraft,
  ValidationIssue,
} from "./types.js";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";
import {
  isObject,
  isValidIsoDateOnly,
  pushError,
  sectionOk,
  validateCommonDates,
  validateIncomePeriods,
  validateLiability,
  validateNonNegativeAmounts,
  parseIsoDate,
} from "./validationHelpers.js";

export function validateTrafficDeathDraft(input: unknown): CalculationValidateResponse {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!isObject(input) || input.calculationType !== "TRAFFIC_DEATH") {
    return {
      valid: false,
      schemaVersion: CALCULATION_SCHEMA_VERSION,
      errors: [{ field: "calculationType", code: "INVALID_TYPE", message: "Geçersiz trafik ölüm taslağı." }],
      warnings: [],
      completedSections: [],
      missingSections: ["caseEvent", "deceased", "income", "beneficiaries", "liability"],
      message: "Geçersiz trafik ölüm taslağı.",
    };
  }
  if (input.schemaVersion !== CALCULATION_SCHEMA_VERSION) {
    pushError(errors, "schemaVersion", "UNSUPPORTED_SCHEMA", "schemaVersion 2 olmalıdır.");
  }

  const draft = input as unknown as TrafficDeathDraft;
  const common = draft.common ?? ({} as TrafficDeathDraft["common"]);
  const deceased = draft.deceased ?? ({} as TrafficDeathDraft["deceased"]);

  validateCommonDates(
    errors,
    common.eventDate,
    common.calculationDate,
    deceased.birthDate,
    deceased.deathDate
  );

  if (!deceased.deathDate) {
    pushError(errors, "deceased.deathDate", "REQUIRED", "Ölüm tarihi zorunludur.");
  }
  if (deceased.gender !== "male" && deceased.gender !== "female") {
    pushError(errors, "deceased.gender", "INVALID_ENUM", "Cinsiyet zorunludur.");
  }

  validateIncomePeriods(errors, warnings, draft.incomePeriods ?? []);
  validateLiability(errors, warnings, draft.liability?.injuredFaultRatio, draft.liability?.parties);

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

  // Destek ilişkileri — biçimsel; otomatik oran hesabı yok
  for (let i = 0; i < (draft.supportRelations ?? []).length; i++) {
    const s = draft.supportRelations![i]!;
    if (s.startDate && s.endDate && isValidIsoDateOnly(s.startDate) && isValidIsoDateOnly(s.endDate)) {
      if (parseIsoDate(s.startDate) > parseIsoDate(s.endDate)) {
        pushError(
          errors,
          `supportRelations[${i}].startDate`,
          "INVALID_DATE_RANGE",
          "Destek başlangıcı bitişten sonra olamaz."
        );
      }
    }
  }

  const deathExp = draft.deathExpenses;
  if (deathExp) {
    for (const [key, val] of [
      ["funeralCost", deathExp.funeralCost],
      ["transportCost", deathExp.transportCost],
      ["preDeathTreatment", deathExp.preDeathTreatment],
    ] as const) {
      if (typeof val === "number" && val < 0) {
        pushError(errors, `deathExpenses.${key}`, "NEGATIVE_AMOUNT", "Gider tutarı negatif olamaz.");
      }
    }
    validateNonNegativeAmounts(errors, deathExp.otherExpenses ?? [], "deathExpenses.otherExpenses");
  }
  validateNonNegativeAmounts(errors, draft.priorPayments ?? [], "priorPayments");

  const completed: string[] = [];
  const missing: string[] = [];
  const req: [string, string[], () => boolean][] = [
    ["caseEvent", ["common"], () => Boolean(common.eventDate && common.calculationDate)],
    [
      "deceased",
      ["deceased", "person"],
      () => Boolean(deceased.birthDate && deceased.deathDate && deceased.gender),
    ],
    ["income", ["incomePeriods"], () => (draft.incomePeriods?.length ?? 0) > 0],
    ["beneficiaries", ["beneficiaries"], () => beneficiaries.length > 0],
    ["supportRelations", ["supportRelations"], () => true],
    ["liability", ["liability"], () => draft.liability != null],
    ["deathExpenses", ["deathExpenses"], () => true],
    ["priorPayments", ["priorPayments"], () => true],
  ];

  for (const [section, prefixes, hasData] of req) {
    const ok = sectionOk(errors, prefixes) && hasData();
    if (ok) completed.push(section);
    else if (["caseEvent", "deceased", "income", "beneficiaries", "liability"].includes(section)) {
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
