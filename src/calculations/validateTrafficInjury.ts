import type {
  AccidentIncomeBlock,
  CalculationValidateResponse,
  CaregiverExpenseRow,
  DefendantParty,
  TemporaryIncapacityPeriod,
  TrafficInjuryDraft,
  ValidationIssue,
} from "./types.js";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";
import {
  isInRange,
  isObject,
  isValidIsoDateOnly,
  parseIsoDate,
  pushError,
  pushWarning,
  sectionOk,
  validateCommonDates,
  validateDateRangePair,
  validateLiability,
  validateNonNegativeAmounts,
} from "./validationHelpers.js";

const SECTIONS = ["parties", "calculationInfo", "lifeExpectancy", "review"] as const;

const VALID_TYPES = new Set([
  "INDIVIDUAL_DRIVER",
  "INDIVIDUAL_VEHICLE_OWNER",
  "CORPORATE_VEHICLE_OWNER",
  "COMPULSORY_TRAFFIC_INSURER",
  "CASCO_INSURER",
]);

function validateDefendants(errors: ValidationIssue[], defendants: DefendantParty[]): void {
  if (!Array.isArray(defendants) || defendants.length === 0) {
    pushError(errors, "parties.defendants", "REQUIRED", "En az bir davalı türü seçilmelidir.");
    return;
  }
  defendants.forEach((d, i) => {
    const prefix = `parties.defendants[${i}]`;
    if (!d?.type || !VALID_TYPES.has(d.type)) {
      pushError(errors, `${prefix}.type`, "INVALID_ENUM", "Geçersiz davalı türü.");
    }
  });
}

function validatePlaintiff(
  errors: ValidationIssue[],
  plaintiff: TrafficInjuryDraft["parties"]["plaintiff"] | undefined,
  eventDate: string | undefined
): void {
  const p = plaintiff ?? { firstName: "", lastName: "", birthDate: "", gender: "" as const };
  if (!p.firstName?.trim()) {
    pushError(errors, "parties.plaintiff.firstName", "REQUIRED", "Davacı adı zorunludur.");
  }
  if (!p.lastName?.trim()) {
    pushError(errors, "parties.plaintiff.lastName", "REQUIRED", "Davacı soyadı zorunludur.");
  }
  if (p.gender !== "FEMALE" && p.gender !== "MALE") {
    pushError(errors, "parties.plaintiff.gender", "INVALID_ENUM", "Cinsiyet zorunludur.");
  }

  if (!p.birthDate || (typeof p.birthDate === "string" && p.birthDate.trim() === "")) {
    pushError(errors, "parties.plaintiff.birthDate", "REQUIRED", "Doğum tarihi zorunludur.");
  } else if (!isValidIsoDateOnly(p.birthDate)) {
    pushError(
      errors,
      "parties.plaintiff.birthDate",
      "INVALID_DATE",
      "Doğum tarihi geçerli YYYY-MM-DD formatında olmalıdır."
    );
  } else if (isValidIsoDateOnly(eventDate) && parseIsoDate(p.birthDate) >= parseIsoDate(eventDate)) {
    pushError(
      errors,
      "parties.plaintiff.birthDate",
      "INVALID_DATE_ORDER",
      "Doğum tarihi olay tarihinden önce olmalıdır."
    );
  }
}

function validateAccidentIncome(errors: ValidationIssue[], warnings: ValidationIssue[], income: AccidentIncomeBlock | undefined): void {
  const block = income ?? { fixedAmount: null, useAverage: false, averageSources: [] };
  if (block.fixedAmount != null && (typeof block.fixedAmount !== "number" || Number.isNaN(block.fixedAmount))) {
    pushError(errors, "accidentIncome.fixedAmount", "INVALID_NUMBER", "Sabit gelir sayı olmalıdır.");
  } else if (typeof block.fixedAmount === "number" && block.fixedAmount < 0) {
    pushError(errors, "accidentIncome.fixedAmount", "NEGATIVE_AMOUNT", "Sabit gelir negatif olamaz.");
  }

  const hasFixed = typeof block.fixedAmount === "number" && block.fixedAmount > 0;
  const sources = Array.isArray(block.averageSources) ? block.averageSources : [];

  if (block.useAverage && sources.length === 0) {
    pushWarning(
      warnings,
      "accidentIncome.averageSources",
      "AVERAGE_INCOME_EMPTY",
      "Ortalama gelir seçildi ancak kaynak eklenmedi."
    );
  }

  sources.forEach((s, i) => {
    const prefix = `accidentIncome.averageSources[${i}]`;
    if (typeof s.amount !== "number" || Number.isNaN(s.amount)) {
      pushError(errors, `${prefix}.amount`, "INVALID_NUMBER", "Gelir tutarı sayı olmalıdır.");
    } else if (s.amount < 0) {
      pushError(errors, `${prefix}.amount`, "NEGATIVE_AMOUNT", "Gelir tutarı negatif olamaz.");
    }
    if (s.amountKind === "gross") {
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

  if (!hasFixed && (!block.useAverage || sources.length === 0)) {
    pushWarning(
      warnings,
      "accidentIncome",
      "INCOME_MISSING",
      "Kaza tarihindeki gelir (sabit veya ortalama) henüz girilmedi."
    );
  }
}

function validateCaregivers(errors: ValidationIssue[], rows: CaregiverExpenseRow[]): void {
  rows.forEach((row, i) => {
    const prefix = `caregiverExpenses[${i}]`;
    if (row.startDate || row.endDate) {
      validateDateRangePair(errors, row as TemporaryIncapacityPeriod, "caregiverExpenses", i);
    }
    if (typeof row.amount !== "number" || Number.isNaN(row.amount)) {
      pushError(errors, `${prefix}.amount`, "INVALID_NUMBER", "Bakıcı ücreti sayı olmalıdır.");
    } else if (row.amount < 0) {
      pushError(errors, `${prefix}.amount`, "NEGATIVE_AMOUNT", "Bakıcı ücreti negatif olamaz.");
    }
  });
}

function validateTempPeriods(errors: ValidationIssue[], temp: TemporaryIncapacityPeriod[]): void {
  for (let i = 0; i < temp.length; i++) {
    const row = temp[i]!;
    validateDateRangePair(errors, row, "temporaryIncapacityPeriods", i);
    if (row.dayCount != null && (typeof row.dayCount !== "number" || Number.isNaN(row.dayCount) || row.dayCount < 0)) {
      pushError(
        errors,
        `temporaryIncapacityPeriods[${i}].dayCount`,
        "INVALID_NUMBER",
        "Gün sayısı geçerli bir sayı olmalıdır."
      );
    }
  }
}

export function validateTrafficInjuryDraft(input: unknown): CalculationValidateResponse {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (!isObject(input) || input.calculationType !== "TRAFFIC_INJURY") {
    return fail("Geçersiz trafik yaralanma taslağı.");
  }
  if (input.schemaVersion !== CALCULATION_SCHEMA_VERSION) {
    pushError(errors, "schemaVersion", "UNSUPPORTED_SCHEMA", "schemaVersion 2 olmalıdır.");
  }

  const draft = input as unknown as TrafficInjuryDraft;
  const common = draft.common ?? ({} as TrafficInjuryDraft["common"]);
  const parties = draft.parties;
  const plaintiff = parties?.plaintiff;

  validateCommonDates(errors, common.eventDate, common.calculationDate);
  validatePlaintiff(errors, plaintiff, common.eventDate);
  validateDefendants(errors, parties?.defendants ?? []);

  validateLiability(
    errors,
    warnings,
    draft.liability?.injuredFaultRatio,
    draft.liability?.parties
  );

  const rate = draft.disability?.permanentDisabilityRate;
  if (typeof rate !== "number" || Number.isNaN(rate)) {
    pushError(errors, "disability.permanentDisabilityRate", "REQUIRED", "Sürekli maluliyet oranı zorunludur.");
  } else if (!isInRange(rate, 0, 100)) {
    pushError(errors, "disability.permanentDisabilityRate", "OUT_OF_RANGE", "Maluliyet oranı 0–100 arasında olmalıdır.");
  }

  if (
    draft.disability?.disabilityStartDate &&
    !isValidIsoDateOnly(draft.disability.disabilityStartDate)
  ) {
    pushError(
      errors,
      "disability.disabilityStartDate",
      "INVALID_DATE",
      "Maluliyet başlangıç tarihi geçerli YYYY-MM-DD formatında olmalıdır."
    );
  }

  validateTempPeriods(errors, draft.temporaryIncapacityPeriods ?? []);
  validateAccidentIncome(errors, warnings, draft.accidentIncome);
  validateNonNegativeAmounts(errors, draft.hospitalExpenses ?? [], "hospitalExpenses");
  validateNonNegativeAmounts(errors, draft.travelExpenses ?? [], "travelExpenses");
  validateCaregivers(errors, draft.caregiverExpenses ?? []);

  const completed: string[] = [];
  const missing: string[] = [];

  const plaintiffComplete = Boolean(
    plaintiff?.firstName?.trim() &&
      plaintiff?.lastName?.trim() &&
      plaintiff?.birthDate &&
      (plaintiff.gender === "FEMALE" || plaintiff.gender === "MALE")
  );
  const defendantsComplete = (parties?.defendants?.length ?? 0) > 0;

  const calcComplete = Boolean(
    common.eventDate &&
      common.calculationDate &&
      typeof draft.disability?.permanentDisabilityRate === "number"
  );

  const lifeExpComplete = plaintiffComplete && Boolean(common.eventDate);

  const checks: [string, string[], () => boolean][] = [
    ["parties", ["parties"], () => plaintiffComplete && defendantsComplete],
    [
      "calculationInfo",
      [
        "common",
        "liability",
        "disability",
        "temporaryIncapacityPeriods",
        "accidentIncome",
        "hospitalExpenses",
        "travelExpenses",
        "caregiverExpenses",
      ],
      () => calcComplete,
    ],
    ["lifeExpectancy", ["passivePhaseAge"], () => lifeExpComplete],
  ];

  for (const [section, prefixes, hasData] of checks) {
    if (sectionOk(errors, prefixes) && hasData()) completed.push(section);
    else if (!sectionOk(errors, prefixes) || !hasData()) {
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

function fail(message: string): CalculationValidateResponse {
  return {
    valid: false,
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    errors: [{ field: "calculationType", code: "INVALID_TYPE", message }],
    warnings: [],
    completedSections: [],
    missingSections: [...SECTIONS],
    message,
  };
}
