import type {
  CalculationValidateResponse,
  TrafficDeathDraft,
  ValidationIssue,
} from "./types.js";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";
import {
  isObject,
  isValidIsoDateOnly,
  isInRange,
  pushError,
  pushWarning,
  sectionOk,
  validateCommonDates,
  validateNonNegativeAmounts,
  validateNonNegativeNumberField,
  validateOptionalIsoDate,
  parseIsoDate,
} from "./validationHelpers.js";
import { validateAccidentIncome } from "./validateAccidentIncome.js";
import {
  isTrafficDeathIncomeSectionComplete,
  resolveTrafficDeathEffectiveNetIncome,
} from "./trafficDeathIncomeUtils.js";
import {
  countBeneficiariesByClaimantStatus,
} from "./beneficiaryClaimantStatus.js";
import {
  coerceResponsibleParties,
  isTrafficDeathFaultSumComplete,
  trafficDeathFaultSum,
} from "./trafficDeathFaultRates.js";
import { getNetMinWageForDate } from "../data/netMinWage.js";
import { validateCapitalValueDocuments, validateInsurancePayments } from "./validateTrafficInjury.js";

function zmtsRowHasContent(row: NonNullable<TrafficDeathDraft["zmtsPayments"]>[number]): boolean {
  return (
    Boolean(row.paymentDate?.trim()) ||
    (row.paymentAmount ?? 0) !== 0 ||
    (row.liabilityLimit ?? 0) !== 0 ||
    (row.accidentLimit ?? 0) !== 0 ||
    Boolean(row.claimantId?.trim()) ||
    row.garameEnabled === true
  );
}

function garamePersonHasContent(row: {
  paymentDate?: string;
  paymentAmount?: number;
  liabilityLimit?: number;
  accidentLimit?: number;
}): boolean {
  return (
    Boolean(row.paymentDate?.trim()) ||
    (row.paymentAmount ?? 0) !== 0 ||
    (row.liabilityLimit ?? 0) !== 0 ||
    (row.accidentLimit ?? 0) !== 0
  );
}

function validateDeathGaramePeople(
  errors: ValidationIssue[],
  rows: NonNullable<TrafficDeathDraft["zmtsPayments"]>,
  fieldPrefix: "zmtsPayments" | "cascoPayments",
  known: Set<string>,
  calculationDate: string | undefined
): void {
  rows.forEach((row, i) => {
    if (row.garameEnabled !== true) return;
    (row.deathGarameRows ?? []).forEach((person, j) => {
      if (!garamePersonHasContent(person)) return;
      const field = `${fieldPrefix}[${i}].deathGarameRows[${j}]`;
      if (!person.claimantId || !known.has(person.claimantId)) {
        pushError(
          errors,
          `${field}.claimantId`,
          "INVALID_REFERENCE",
          "Garame satırındaki hak sahibi artık listede yok."
        );
      }
      validateNonNegativeNumberField(errors, person.paymentAmount, `${field}.paymentAmount`, "Ödeme miktarı");
      validateNonNegativeNumberField(errors, person.liabilityLimit, `${field}.liabilityLimit`, "Kişi başı limit");
      validateNonNegativeNumberField(errors, person.accidentLimit, `${field}.accidentLimit`, "Kaza başı limit");
      validateOptionalIsoDate(errors, person.paymentDate, `${field}.paymentDate`, "Ödeme tarihi");
      if ((person.paymentAmount ?? 0) > 0 && !person.paymentDate?.trim()) {
        pushError(errors, `${field}.paymentDate`, "REQUIRED", "Ödeme tarihi girilmelidir.");
      }
      validatePaymentDateNotAfterCalculation(errors, person.paymentDate, calculationDate, `${field}.paymentDate`);
    });
  });
}

function validatePaymentDateNotAfterCalculation(
  errors: ValidationIssue[],
  paymentDate: string | undefined,
  calculationDate: string | undefined,
  field: string
): void {
  const date = paymentDate?.trim() ?? "";
  const calc = calculationDate?.trim() ?? "";
  if (!date || !calc || !isValidIsoDateOnly(date) || !isValidIsoDateOnly(calc)) return;
  if (date > calc) {
    pushError(errors, field, "INVALID_DATE_ORDER", "Ödeme tarihi hesap tarihinden sonra olamaz.");
  }
}

function validateDeathZmtsClaimants(errors: ValidationIssue[], draft: TrafficDeathDraft): void {
  const known = new Set((draft.beneficiaries ?? []).map((b) => b.id));
  const plaintiffs = new Set(
    (draft.beneficiaries ?? []).filter((b) => b.claimantStatus !== "OUT_OF_CASE").map((b) => b.id)
  );
  const calculationDate = draft.common?.calculationDate;
  validateDeathGaramePeople(errors, draft.zmtsPayments ?? [], "zmtsPayments", known, calculationDate);
  validateDeathGaramePeople(errors, draft.cascoPayments ?? [], "cascoPayments", known, calculationDate);
  const checkParentClaimant = (
    rows: NonNullable<TrafficDeathDraft["zmtsPayments"]>,
    fieldPrefix: "zmtsPayments" | "cascoPayments"
  ) => {
    rows.forEach((row, i) => {
      if (row.garameEnabled === true) return;
      if (!zmtsRowHasContent(row)) return;
      validatePaymentDateNotAfterCalculation(
        errors,
        row.paymentDate,
        calculationDate,
        `${fieldPrefix}[${i}].paymentDate`
      );
      const claimantId = row.claimantId?.trim() ?? "";
      if (!claimantId) {
        pushError(errors, `${fieldPrefix}[${i}].claimantId`, "REQUIRED", "Ödemenin yapıldığı hak sahibini seçin.");
        return;
      }
      if (!plaintiffs.has(claimantId)) {
        pushError(
          errors,
          `${fieldPrefix}[${i}].claimantId`,
          "INVALID_REFERENCE",
          "Seçilen hak sahibi artık davacı değil. Ödemenin yapıldığı hak sahibini yeniden seçin."
        );
      }
    });
  };
  checkParentClaimant(draft.zmtsPayments ?? [], "zmtsPayments");
  checkParentClaimant(draft.cascoPayments ?? [], "cascoPayments");
}

function validateTrafficDeathFaultRates(
  errors: ValidationIssue[],
  warnings: ValidationIssue[],
  draft: TrafficDeathDraft
): void {
  const deceasedFault = draft.deceasedFaultRate ?? 0;
  if (typeof deceasedFault !== "number" || Number.isNaN(deceasedFault)) {
    pushError(errors, "deceasedFaultRate", "INVALID_NUMBER", "Kusur oranı sayı olmalıdır.");
  } else if (!isInRange(deceasedFault, 0, 100)) {
    pushError(errors, "deceasedFaultRate", "OUT_OF_RANGE", "Kusur oranı 0 ile 100 arasında olmalıdır.");
  }

  const parties = coerceResponsibleParties(draft.responsibleParties);
  for (const party of parties) {
    const field = `responsibleParties.${party.id}.faultRatio`;
    if (typeof party.faultRatio !== "number" || Number.isNaN(party.faultRatio)) {
      pushError(errors, field, "INVALID_NUMBER", "Kusur oranı sayı olmalıdır.");
    } else if (!isInRange(party.faultRatio, 0, 100)) {
      pushError(errors, field, "OUT_OF_RANGE", "Kusur oranı 0 ile 100 arasında olmalıdır.");
    }
  }

  const external = draft.externalFaultRate ?? 0;
  if (typeof external !== "number" || Number.isNaN(external)) {
    pushError(errors, "externalFaultRate", "INVALID_NUMBER", "Dava dışı kusur oranı sayı olmalıdır.");
  } else if (!isInRange(external, 0, 100)) {
    pushError(errors, "externalFaultRate", "OUT_OF_RANGE", "Dava dışı kusur oranı 0–100 arasında olmalıdır.");
  }

  const sum = trafficDeathFaultSum(
    typeof deceasedFault === "number" && !Number.isNaN(deceasedFault) ? deceasedFault : 0,
    parties,
    typeof external === "number" && !Number.isNaN(external) ? external : 0
  );
  if (!isTrafficDeathFaultSumComplete(sum)) {
    pushWarning(
      warnings,
      "liability",
      "FAULT_SUM_NOT_100",
      `Kusur oranları toplamı %${sum.toFixed(0)}. Toplam %100 olmalıdır (otomatik düzeltilmez).`
    );
  }
}

export function isTrafficDeathLiabilityComplete(draft: TrafficDeathDraft): boolean {
  const deceasedFault = draft.deceasedFaultRate ?? 0;
  const parties = coerceResponsibleParties(draft.responsibleParties);
  const external = draft.externalFaultRate ?? 0;
  if (typeof deceasedFault !== "number" || Number.isNaN(deceasedFault) || !isInRange(deceasedFault, 0, 100)) {
    return false;
  }
  if (typeof external !== "number" || Number.isNaN(external) || !isInRange(external, 0, 100)) {
    return false;
  }
  for (const party of parties) {
    if (typeof party.faultRatio !== "number" || Number.isNaN(party.faultRatio) || !isInRange(party.faultRatio, 0, 100)) {
      return false;
    }
  }
  return isTrafficDeathFaultSumComplete(trafficDeathFaultSum(deceasedFault, parties, external));
}

/** Pay motoru kusur toplamına bağlı değildir; eksik kusur adımı hesaplamayı engellemez. */
export function blocksTrafficDeathSupportPeriods(result: CalculationValidateResponse): boolean {
  const blockingMissing = result.missingSections.filter((section) => section !== "liability");
  const blockingErrors = result.errors.filter((issue) => {
    const field = issue.field;
    return (
      field !== "liability" &&
      field !== "externalFaultRate" &&
      field !== "deceasedFaultRate" &&
      !field.startsWith("responsibleParties") &&
      !field.startsWith("claimantFaultRates")
    );
  });
  return blockingMissing.length > 0 || blockingErrors.length > 0;
}

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
      missingSections: ["deceased", "beneficiaries", "liability"],
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

  if (draft.employmentStatus !== "WORKING" && draft.employmentStatus !== "NOT_WORKING") {
    pushError(errors, "employmentStatus", "REQUIRED", "Çalışma durumu seçilmelidir.");
  } else if (draft.employmentStatus === "WORKING") {
    validateAccidentIncome(errors, warnings, draft.accidentIncome, common.eventDate);
  } else {
    const selected = draft.nonWorkingSelectedIncome;
    if (selected == null || typeof selected !== "number" || Number.isNaN(selected) || selected <= 0) {
      pushError(
        errors,
        "nonWorkingSelectedIncome",
        "REQUIRED",
        "Esas alınacak gelir girilmelidir."
      );
    } else if (selected < 0) {
      pushError(errors, "nonWorkingSelectedIncome", "NEGATIVE_AMOUNT", "Esas alınacak gelir negatif olamaz.");
    }
    if (isValidIsoDateOnly(common.eventDate) && getNetMinWageForDate(common.eventDate) == null) {
      pushError(
        errors,
        "common.eventDate",
        "MIN_WAGE_PERIOD_MISSING",
        `${common.eventDate} tarihi için tanımlı net asgari ücret dönemi bulunamadı.`
      );
    }
  }

  validateTrafficDeathFaultRates(errors, warnings, draft);

  const beneficiaries = draft.beneficiaries ?? [];
  const { plaintiff: plaintiffCount } = countBeneficiariesByClaimantStatus(beneficiaries);
  if (plaintiffCount === 0) {
    pushError(errors, "beneficiaries", "REQUIRED", "En az bir davacı hak sahibi zorunludur.");
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
  validateCapitalValueDocuments(errors, draft.sosyalYardimOdenekleri, "sosyalYardimOdenekleri");
  validateCapitalValueDocuments(errors, draft.capitalValueDocuments);
  validateInsurancePayments(
    errors,
    warnings,
    draft.zmtsPayments ?? [],
    "zmtsPayments",
    "COMPULSORY_TRAFFIC_INSURER",
    []
  );
  validateInsurancePayments(errors, warnings, draft.cascoPayments ?? [], "cascoPayments", "CASCO_INSURER", []);
  validateDeathZmtsClaimants(errors, draft);

  const childCount = draft.marriageProbabilityDeduction?.under18ChildCount;
  if (
    childCount != null &&
    (typeof childCount !== "number" ||
      !Number.isFinite(childCount) ||
      childCount < 0 ||
      childCount > 20 ||
      Math.floor(childCount) !== childCount)
  ) {
    pushError(
      errors,
      "marriageProbabilityDeduction.under18ChildCount",
      "INVALID_CHILD_COUNT",
      "18 yaş altı çocuk sayısı 0 ile 20 arasında tam sayı olmalıdır."
    );
  }
  const spouse = (draft.beneficiaries ?? []).find((b) => b.relation === "spouse");
  if (spouse && spouse.gender !== "female" && spouse.gender !== "male") {
    pushWarning(
      warnings,
      "marriageProbabilityDeduction.spouseGender",
      "MISSING_GENDER",
      "Eşin cinsiyeti hak sahipleri adımında seçilmelidir."
    );
  }

  const completed: string[] = [];
  const missing: string[] = [];
  const req: [string, string[], () => boolean][] = [
    [
      "deceased",
      ["deceased", "person", "common", "incomePeriods", "employmentStatus", "accidentIncome", "nonWorkingSelectedIncome"],
      () =>
        Boolean(
          common.eventDate &&
            common.calculationDate &&
            deceased.birthDate &&
            deceased.deathDate &&
            deceased.gender &&
            isTrafficDeathIncomeSectionComplete(draft) &&
            resolveTrafficDeathEffectiveNetIncome(draft) != null
        ),
    ],
    ["beneficiaries", ["beneficiaries"], () => plaintiffCount > 0],
    ["supportRelations", ["supportRelations"], () => true],
    [
      "liability",
      ["liability", "deceasedFaultRate", "responsibleParties", "externalFaultRate"],
      () => isTrafficDeathLiabilityComplete(draft),
    ],
    ["marriageProbabilityDeduction", ["marriageProbabilityDeduction"], () => true],
    ["educationExpenseDeduction", ["educationExpenseDeduction"], () => true],
    ["deathExpenses", ["deathExpenses"], () => true],
    [
      "priorPayments",
      ["priorPayments", "capitalValueDocuments", "sosyalYardimOdenekleri", "zmtsPayments", "cascoPayments"],
      () => true,
    ],
  ];

  for (const [section, prefixes, hasData] of req) {
    const ok = sectionOk(errors, prefixes) && hasData();
    if (ok) completed.push(section);
    else if (["deceased", "beneficiaries", "liability"].includes(section)) {
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
