import type {
  AccidentIncomeBlock,
  CalculationValidateResponse,
  CapitalValueDocument,
  CaregiverExpenseRow,
  DefendantParty,
  DefendantType,
  IncomeMode,
  InsuranceGarameEntry,
  InsurancePaymentRecord,
  TemporaryIncapacityPeriod,
  TrafficInjuryDraft,
  ValidationIssue,
} from "./types.js";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";
import { isGarameEnabled } from "./trafficInjury/insuranceGarame.js";
import { getNetMinWageForDate } from "../data/netMinWage.js";
import {
  computeInclusiveDayCount,
  isBlankString,
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
  validateNonNegativeNumberField,
  validateOptionalIsoDate,
} from "./validationHelpers.js";

const SECTIONS = ["parties", "calculationInfo", "lifeExpectancy", "review"] as const;
const DEFAULT_PASSIVE_PHASE_AGE = 60;

const VALID_DEFENDANT_TYPES = new Set<DefendantType>([
  "INDIVIDUAL_DRIVER",
  "INDIVIDUAL_VEHICLE_OWNER",
  "CORPORATE_VEHICLE_OWNER",
  "COMPULSORY_TRAFFIC_INSURER",
  "CASCO_INSURER",
]);

const ZMTS_DEFENDANT_TYPE: DefendantType = "COMPULSORY_TRAFFIC_INSURER";
const CASCO_DEFENDANT_TYPE: DefendantType = "CASCO_INSURER";

function resolveIncomeMode(block: AccidentIncomeBlock | undefined): IncomeMode {
  if (!block) return "minWage";
  if (block.incomeMode === "minWage" || block.incomeMode === "fixed" || block.incomeMode === "average") {
    return block.incomeMode;
  }
  if (block.useAverage) return "average";
  if (typeof block.fixedAmount === "number" && block.fixedAmount > 0) return "fixed";
  return "minWage";
}

function validateDefendants(errors: ValidationIssue[], defendants: DefendantParty[]): void {
  if (!Array.isArray(defendants) || defendants.length === 0) {
    pushError(errors, "parties.defendants", "REQUIRED", "En az bir davalı türü seçilmelidir.");
    return;
  }
  defendants.forEach((d, i) => {
    const prefix = `parties.defendants[${i}]`;
    if (!d?.type || !VALID_DEFENDANT_TYPES.has(d.type)) {
      pushError(errors, `${prefix}.type`, "INVALID_ENUM", "Geçersiz davalı türü.");
    }
    if (!d?.id || typeof d.id !== "string") {
      pushError(errors, `${prefix}.id`, "REQUIRED", "Davalı kaydı id alanı zorunludur.");
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

function isTempPeriodEmpty(row: TemporaryIncapacityPeriod): boolean {
  return (
    isBlankString(row.startDate) &&
    isBlankString(row.endDate) &&
    (row.dayCount == null || row.dayCount === 0) &&
    (row.rate == null || row.rate === 0) &&
    isBlankString(row.notes)
  );
}

function isTempPeriodPartial(row: TemporaryIncapacityPeriod): boolean {
  if (isTempPeriodEmpty(row)) return false;
  return (
    !isBlankString(row.startDate) ||
    !isBlankString(row.endDate) ||
    (row.dayCount != null && row.dayCount > 0) ||
    (row.rate != null && row.rate > 0) ||
    !isBlankString(row.notes)
  );
}

function validateTempPeriods(errors: ValidationIssue[], warnings: ValidationIssue[], temp: TemporaryIncapacityPeriod[]): void {
  for (let i = 0; i < temp.length; i++) {
    const row = temp[i]!;
    if (isTempPeriodEmpty(row)) continue;

    const prefix = `temporaryIncapacityPeriods[${i}]`;
    if (!isTempPeriodPartial(row)) continue;

    if (isBlankString(row.startDate)) {
      pushError(errors, `${prefix}.startDate`, "REQUIRED", "Başlangıç tarihi zorunludur.");
    }
    if (isBlankString(row.endDate)) {
      pushError(errors, `${prefix}.endDate`, "REQUIRED", "Bitiş tarihi zorunludur.");
    }

    if (!isBlankString(row.startDate) || !isBlankString(row.endDate)) {
      validateDateRangePair(errors, row, "temporaryIncapacityPeriods", i);
    }

    if (isValidIsoDateOnly(row.startDate) && isValidIsoDateOnly(row.endDate)) {
      const expectedDays = computeInclusiveDayCount(row.startDate, row.endDate);
      if (expectedDays != null && row.dayCount != null && row.dayCount !== expectedDays) {
        pushWarning(
          warnings,
          `${prefix}.dayCount`,
          "DAY_COUNT_MISMATCH",
          `Gün sayısı (${row.dayCount}) tarih aralığından türetilen değer (${expectedDays}) ile uyuşmuyor.`
        );
      }
    }

    if (row.dayCount != null && (typeof row.dayCount !== "number" || Number.isNaN(row.dayCount) || row.dayCount < 0)) {
      pushError(errors, `${prefix}.dayCount`, "INVALID_NUMBER", "Gün sayısı geçerli bir sayı olmalıdır.");
    }

    if (row.rate != null) {
      if (typeof row.rate !== "number" || Number.isNaN(row.rate)) {
        pushError(errors, `${prefix}.rate`, "INVALID_NUMBER", "Oran geçerli bir sayı olmalıdır.");
      } else if (!isInRange(row.rate, 0, 100)) {
        pushError(errors, `${prefix}.rate`, "OUT_OF_RANGE", "Oran 0–100 arasında olmalıdır.");
      }
    }
  }
}

function validateAccidentIncome(
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  income: AccidentIncomeBlock | undefined,
  eventDate: string | undefined
): void {
  const block = income ?? {
    incomeMode: "minWage" as const,
    fixedAmount: null,
    averageSources: [],
  };
  const mode = resolveIncomeMode(block);

  if (typeof block.fixedAmount === "number" && block.fixedAmount < 0) {
    pushError(errors, "accidentIncome.fixedAmount", "NEGATIVE_AMOUNT", "Sabit gelir negatif olamaz.");
  }

  const sources = Array.isArray(block.averageSources) ? block.averageSources : [];
  sources.forEach((s, i) => {
    const prefix = `accidentIncome.averageSources[${i}]`;
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
        "accidentIncome",
        "INCOME_EVENT_DATE_MISSING",
        "Asgari ücret modu için geçerli kaza tarihi gereklidir."
      );
    } else if (getNetMinWageForDate(eventDate) == null) {
      pushWarning(
        warnings,
        "accidentIncome",
        "MIN_WAGE_PERIOD_MISSING",
        `${eventDate} tarihi için tanımlı net asgari ücret dönemi bulunamadı.`
      );
    }
    return;
  }

  if (mode === "fixed") {
    if (typeof block.fixedAmount !== "number" || Number.isNaN(block.fixedAmount) || block.fixedAmount <= 0) {
      pushWarning(warnings, "accidentIncome.fixedAmount", "INCOME_MISSING", "Sabit gelir tutarı girilmelidir.");
    }
    return;
  }

  if (mode === "average") {
    if (typeof block.averageNetResult !== "number" || Number.isNaN(block.averageNetResult) || block.averageNetResult <= 0) {
      pushWarning(
        warnings,
        "accidentIncome.averageNetResult",
        "INCOME_MISSING",
        "Ortalama gelir modunda hesaplanmış ortalama net gelir girilmelidir."
      );
    }
    if (sources.length === 0) {
      pushWarning(
        warnings,
        "accidentIncome.averageSources",
        "AVERAGE_INCOME_EMPTY",
        "Ortalama gelir seçildi ancak kaynak eklenmedi."
      );
    }
  }
}

function isPsdEmpty(doc: CapitalValueDocument): boolean {
  return (
    isBlankString(doc.notes) &&
    isBlankString(doc.documentDate) &&
    isBlankString(doc.documentNumber) &&
    (doc.amount == null || doc.amount === 0) &&
    doc.recourseIndicated !== true &&
    isBlankString(doc.personLabel)
  );
}

function validateCapitalValueDocuments(errors: ValidationIssue[], docs: CapitalValueDocument[]): void {
  docs.forEach((doc, i) => {
    if (isPsdEmpty(doc)) return;
    const prefix = `capitalValueDocuments[${i}]`;
    validateOptionalIsoDate(errors, doc.documentDate, `${prefix}.documentDate`, "Belge tarihi");
    validateNonNegativeNumberField(errors, doc.amount, `${prefix}.amount`, "Belge tutarı");
  });
}

function isGarameEntryEmpty(entry: InsuranceGarameEntry): boolean {
  const hasExternal = !isBlankString(entry.externalPersonLabel);
  const hasMotor =
    (entry.claimAmount != null && entry.claimAmount > 0) ||
    (entry.garameBasisAmount != null && entry.garameBasisAmount > 0) ||
    entry.garameRatio != null ||
    entry.accidentLimitShare != null ||
    entry.payableAfterPersonLimit != null;
  return entry.subjectRef !== "plaintiff" && !hasExternal && !hasMotor;
}

function validateGarameEntries(
  errors: ValidationIssue[],
  entries: InsuranceGarameEntry[] | undefined,
  fieldPrefix: string
): void {
  if (!Array.isArray(entries)) return;
  entries.forEach((entry, i) => {
    const prefix = `${fieldPrefix}.garameEntries[${i}]`;
    if (entry.subjectRef === "plaintiff") {
      if (!isBlankString(entry.externalPersonLabel)) {
        pushError(
          errors,
          `${prefix}.externalPersonLabel`,
          "CONFLICTING_SUBJECT",
          "Davacı referansı ile dosya dışı tanım birlikte kullanılamaz."
        );
      }
      return;
    }
    if (isBlankString(entry.externalPersonLabel)) {
      pushError(
        errors,
        `${prefix}.externalPersonLabel`,
        "REQUIRED",
        "Dosya dışı kaza mağduru için tanım zorunludur veya subjectRef=plaintiff seçilmelidir."
      );
    }
  });
}

function isInsurancePaymentEmpty(row: InsurancePaymentRecord): boolean {
  const garame = row.garameEntries ?? [];
  const garameUsed = isGarameEnabled(row) && garame.some((e) => !isGarameEntryEmpty(e));
  return (
    isBlankString(row.paymentDate) &&
    (row.paymentAmount ?? 0) === 0 &&
    (row.liabilityLimit ?? 0) === 0 &&
    (row.accidentLimit ?? 0) === 0 &&
    isBlankString(row.defendantId) &&
    !garameUsed
  );
}

function validateInsurancePayments(
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  rows: InsurancePaymentRecord[],
  fieldPrefix: "zmtsPayments" | "cascoPayments",
  expectedType: DefendantType,
  defendants: DefendantParty[]
): void {
  const matching = defendants.filter((d) => d.type === expectedType);

  rows.forEach((row, i) => {
    if (isInsurancePaymentEmpty(row)) return;

    const prefix = `${fieldPrefix}[${i}]`;
    validateOptionalIsoDate(errors, row.paymentDate, `${prefix}.paymentDate`, "Ödeme tarihi");
    validateNonNegativeNumberField(errors, row.paymentAmount, `${prefix}.paymentAmount`, "Ödeme miktarı");
    validateNonNegativeNumberField(errors, row.liabilityLimit, `${prefix}.liabilityLimit`, "Kişi başı limit");
    validateNonNegativeNumberField(errors, row.accidentLimit, `${prefix}.accidentLimit`, "Kaza başı limit");

    if (row.defendantId) {
      const def = defendants.find((d) => d.id === row.defendantId);
      if (!def) {
        pushError(errors, `${prefix}.defendantId`, "INVALID_REFERENCE", "Davalı referansı bulunamadı.");
      } else if (def.type !== expectedType) {
        pushError(
          errors,
          `${prefix}.defendantId`,
          "INVALID_DEFENDANT_TYPE",
          "Ödeme kaydı yanlış davalı türüne bağlı."
        );
      }
    } else if (matching.length === 1) {
      pushWarning(
        warnings,
        `${prefix}.defendantId`,
        "DEFENDANT_ID_MISSING",
        "Sigorta davalısı mevcut; ödeme kaydına defendantId atanması önerilir."
      );
    } else if (matching.length > 1) {
      pushError(
        errors,
        `${prefix}.defendantId`,
        "REQUIRED",
        "Birden fazla sigorta davalısı var; ödeme kaydının defendantId ile bağlanması zorunludur."
      );
    }

    if (isGarameEnabled(row)) {
      validateGarameEntries(errors, row.garameEntries, prefix);
    }
  });
}

function validatePassivePhaseAge(errors: ValidationIssue[], age: unknown): void {
  if (age === undefined || age === null) return;
  if (typeof age !== "number" || Number.isNaN(age)) {
    pushError(errors, "passivePhaseAge", "INVALID_NUMBER", "Pasif devre yaşı sayı olmalıdır.");
  } else if (!Number.isInteger(age) || age < 1 || age > 99) {
    pushError(errors, "passivePhaseAge", "OUT_OF_RANGE", "Pasif devre yaşı 1–99 arasında tam sayı olmalıdır.");
  }
}

function validateProcessedPeriodDates(
  errors: ValidationIssue[],
  draft: TrafficInjuryDraft
): void {
  const { eventDate, calculationDate } = draft.common ?? {};
  const start = draft.processedPeriodStartDate ?? eventDate;
  const end = draft.processedPeriodEndDate ?? calculationDate;

  if (draft.processedPeriodStartDate && !isValidIsoDateOnly(draft.processedPeriodStartDate)) {
    pushError(
      errors,
      "processedPeriodStartDate",
      "INVALID_DATE",
      "İşlemiş dönem başlangıcı geçerli YYYY-MM-DD formatında olmalıdır."
    );
  }
  if (draft.processedPeriodEndDate && !isValidIsoDateOnly(draft.processedPeriodEndDate)) {
    pushError(
      errors,
      "processedPeriodEndDate",
      "INVALID_DATE",
      "İşlemiş dönem bitişi geçerli YYYY-MM-DD formatında olmalıdır."
    );
  }
  if (
    isValidIsoDateOnly(start) &&
    isValidIsoDateOnly(end) &&
    parseIsoDate(start!) > parseIsoDate(end!)
  ) {
    pushError(
      errors,
      "processedPeriodStartDate",
      "INVALID_DATE_ORDER",
      "İşlemiş dönem başlangıcı bitiş tarihinden sonra olamaz."
    );
  }
  if (
    draft.processedPeriodStartDate &&
    isValidIsoDateOnly(draft.processedPeriodStartDate) &&
    isValidIsoDateOnly(eventDate) &&
    parseIsoDate(draft.processedPeriodStartDate) < parseIsoDate(eventDate)
  ) {
    pushError(
      errors,
      "processedPeriodStartDate",
      "BEFORE_EVENT_DATE",
      "İşlemiş dönem başlangıcı kaza tarihinden önce olamaz."
    );
  }
  if (
    draft.processedPeriodEndDate &&
    isValidIsoDateOnly(draft.processedPeriodEndDate) &&
    isValidIsoDateOnly(calculationDate) &&
    parseIsoDate(draft.processedPeriodEndDate) > parseIsoDate(calculationDate)
  ) {
    pushError(
      errors,
      "processedPeriodEndDate",
      "AFTER_CALCULATION_DATE",
      "İşlemiş dönem bitişi hesap tarihinden sonra olamaz."
    );
  }
}

function validateCaregivers(errors: ValidationIssue[], rows: CaregiverExpenseRow[]): void {
  rows.forEach((row, i) => {
    const prefix = `caregiverExpenses[${i}]`;
    const hasDates = !isBlankString(row.startDate) || !isBlankString(row.endDate);
    const hasAmount = (row.amount ?? 0) !== 0;
    if (!hasDates && !hasAmount) return;

    if (hasDates) {
      validateDateRangePair(errors, row as TemporaryIncapacityPeriod, "caregiverExpenses", i);
    }
    validateNonNegativeNumberField(errors, row.amount, `${prefix}.amount`, "Bakıcı ücreti");
  });
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
  const defendants = parties?.defendants ?? [];

  validateCommonDates(errors, common.eventDate, common.calculationDate);
  validatePlaintiff(errors, plaintiff, common.eventDate);
  validateDefendants(errors, defendants);

  validateLiability(errors, warnings, draft.liability?.injuredFaultRatio, draft.liability?.parties);

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

  validateTempPeriods(errors, warnings, draft.temporaryIncapacityPeriods ?? []);
  validateAccidentIncome(errors, warnings, draft.accidentIncome, common.eventDate);
  validateNonNegativeAmounts(errors, draft.hospitalExpenses ?? [], "hospitalExpenses");
  validateNonNegativeAmounts(errors, draft.travelExpenses ?? [], "travelExpenses");
  validateCaregivers(errors, draft.caregiverExpenses ?? []);
  validatePassivePhaseAge(errors, draft.passivePhaseAge);
  validateProcessedPeriodDates(errors, draft);
  validateCapitalValueDocuments(errors, draft.capitalValueDocuments ?? []);
  validateInsurancePayments(errors, warnings, draft.zmtsPayments ?? [], "zmtsPayments", ZMTS_DEFENDANT_TYPE, defendants);
  validateInsurancePayments(errors, warnings, draft.cascoPayments ?? [], "cascoPayments", CASCO_DEFENDANT_TYPE, defendants);

  const completed: string[] = [];
  const missing: string[] = [];

  const plaintiffComplete = Boolean(
    plaintiff?.firstName?.trim() &&
      plaintiff?.lastName?.trim() &&
      plaintiff?.birthDate &&
      (plaintiff.gender === "FEMALE" || plaintiff.gender === "MALE")
  );
  const defendantsComplete = defendants.length > 0;

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
    [
      "lifeExpectancy",
      ["passivePhaseAge", "capitalValueDocuments", "zmtsPayments", "cascoPayments"],
      () => lifeExpComplete,
    ],
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

export { DEFAULT_PASSIVE_PHASE_AGE, resolveIncomeMode, isTempPeriodEmpty, isInsurancePaymentEmpty };
