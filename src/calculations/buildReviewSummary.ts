import type { CalculationDraft, CalculationType, TrafficDeathDraft, TrafficInjuryDraft } from "./types.js";
import { hashCalculationInput, CALCULATION_HASH_VERSION } from "./hash/calculationInputHash.js";
import { UnsupportedHashCalculationTypeError } from "./hash/calculationInputNormalizer.js";
import { computeEffectiveTemporaryRange } from "./tempIncapacityPeriodUtils.js";
import { getNetMinWageForDate } from "../data/netMinWage.js";
import { resolveIncomeMode } from "./validateAccidentIncome.js";
import { resolveTrafficDeathEffectiveNetIncome } from "./trafficDeathIncomeUtils.js";
import { countBeneficiariesByClaimantStatus } from "./beneficiaryClaimantStatus.js";

export interface ReviewSummaryInsurancePayment {
  paymentDate: string | null;
  paymentAmount: number;
  liabilityLimit: number;
  accidentLimit: number | null;
  garameEnabled: boolean;
  garameEntryCount: number;
}

export interface ReviewSummaryTemporaryPeriod {
  startDate: string | null;
  endDate: string | null;
}

export interface ReviewSummaryPsdRow {
  amount: number | null;
  personLabel: string | null;
}

export interface TrafficInjuryReviewSummary {
  calculationType: "TRAFFIC_INJURY";
  plaintiffName: string;
  birthDate: string | null;
  gender: string | null;
  eventDate: string | null;
  calculationDate: string | null;
  processedPeriodStartDate: string | null;
  processedPeriodEndDate: string | null;
  temporaryIncapacityPeriods: ReviewSummaryTemporaryPeriod[];
  temporaryIncapacityIgnoreGaps: boolean;
  temporaryIncapacityGapIgnoredNote: string | null;
  permanentDisabilityRate: number | null;
  disabilityStartDate: string | null;
  injuredFaultRatio: number;
  defendantFaultRatios: Array<{ name: string; faultRatio: number }>;
  externalFaultRatio: number;
  incomeMode: string;
  fixedAmount: number | null;
  averageNetResult: number | null;
  passivePhaseAge: number | null;
  psdDocuments: ReviewSummaryPsdRow[];
  zmtsPayments: ReviewSummaryInsurancePayment[];
  cascoPayments: ReviewSummaryInsurancePayment[];
}

export interface TrafficDeathReviewSummary {
  calculationType: "TRAFFIC_DEATH";
  deceasedName: string;
  eventDate: string | null;
  calculationDate: string | null;
  employmentStatus: "WORKING" | "NOT_WORKING" | null;
  employmentStatusLabel: string;
  incomeMode: string | null;
  effectiveNetIncome: number | null;
  referenceMinWageAtEvent: number | null;
  nonWorkingSelectedIncome: number | null;
  plaintiffBeneficiaryCount: number;
  outOfCaseBeneficiaryCount: number;
}

export interface CalculationReviewSummaryResponse {
  inputHash: string;
  calculationHashVersion: number;
  summary: TrafficInjuryReviewSummary | TrafficDeathReviewSummary | { calculationType: CalculationType; message: string };
}

function genderLabel(g: string | null | undefined): string | null {
  if (g === "MALE") return "Erkek";
  if (g === "FEMALE") return "Kadın";
  return g?.trim() || null;
}

function mapInsurancePayments(
  rows: TrafficInjuryDraft["zmtsPayments"]
): ReviewSummaryInsurancePayment[] {
  return (rows ?? []).map((p) => ({
    paymentDate: p.paymentDate?.trim() || null,
    paymentAmount: p.paymentAmount ?? 0,
    liabilityLimit: p.liabilityLimit ?? 0,
    accidentLimit: p.accidentLimit ?? null,
    garameEnabled: p.garameEnabled === true,
    garameEntryCount: p.garameEnabled === true ? (p.garameEntries?.length ?? 0) : 0,
  }));
}

export function buildTrafficInjuryReviewSummary(draft: TrafficInjuryDraft): TrafficInjuryReviewSummary {
  const p = draft.parties.plaintiff;
  const ignoreGaps = draft.temporaryIncapacityIgnoreGaps === true;
  const effectiveRange = ignoreGaps
    ? computeEffectiveTemporaryRange(draft.temporaryIncapacityPeriods)
    : null;
  const tempPeriods =
    ignoreGaps && effectiveRange
      ? [{ startDate: effectiveRange.startDate, endDate: effectiveRange.endDate }]
      : draft.temporaryIncapacityPeriods.map((row) => ({
          startDate: row.startDate?.trim() || null,
          endDate: row.endDate?.trim() || null,
        }));

  return {
    calculationType: "TRAFFIC_INJURY",
    plaintiffName: [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "—",
    birthDate: p.birthDate?.trim() || null,
    gender: genderLabel(p.gender),
    eventDate: draft.common.eventDate?.trim() || null,
    calculationDate: draft.common.calculationDate?.trim() || null,
    processedPeriodStartDate: draft.processedPeriodStartDate?.trim() || draft.common.eventDate || null,
    processedPeriodEndDate: draft.processedPeriodEndDate?.trim() || draft.common.calculationDate || null,
    temporaryIncapacityPeriods: tempPeriods,
    temporaryIncapacityIgnoreGaps: ignoreGaps,
    temporaryIncapacityGapIgnoredNote: ignoreGaps
      ? "Dönemler arasındaki boşluk kullanıcı onayıyla kesintisiz kabul edilmiştir."
      : null,
    permanentDisabilityRate: draft.disability.permanentDisabilityRate ?? null,
    disabilityStartDate: draft.disability.disabilityStartDate?.trim() || null,
    injuredFaultRatio: draft.liability.injuredFaultRatio ?? 0,
    defendantFaultRatios: draft.liability.parties.map((p) => ({
      name: p.name?.trim() || "—",
      faultRatio: p.faultRatio ?? 0,
    })),
    externalFaultRatio: draft.liability.externalFaultRatio ?? 0,
    incomeMode: draft.accidentIncome.incomeMode,
    fixedAmount: draft.accidentIncome.fixedAmount,
    averageNetResult: draft.accidentIncome.averageNetResult ?? null,
    passivePhaseAge: draft.passivePhaseAge ?? null,
    psdDocuments: draft.capitalValueDocuments.map((d) => ({
      amount: d.amount ?? null,
      personLabel: d.personLabel?.trim() || null,
    })),
    zmtsPayments: mapInsurancePayments(draft.zmtsPayments),
    cascoPayments: mapInsurancePayments(draft.cascoPayments),
  };
}

const INCOME_MODE_LABELS: Record<string, string> = {
  minWage: "Net asgari ücret",
  fixed: "Sabit net gelir",
  average: "Ortalama net gelir",
};

export function buildTrafficDeathReviewSummary(draft: TrafficDeathDraft): TrafficDeathReviewSummary {
  const eventDate = draft.common.eventDate?.trim() || null;
  const referenceMinWageAtEvent = eventDate ? getNetMinWageForDate(eventDate) : null;
  const effectiveNetIncome = resolveTrafficDeathEffectiveNetIncome(draft);
  const status = draft.employmentStatus ?? null;
  const statusLabel =
    status === "WORKING" ? "Çalışıyor" : status === "NOT_WORKING" ? "Çalışmıyor" : "—";

  let incomeMode: string | null = null;
  if (status === "WORKING") {
    incomeMode = INCOME_MODE_LABELS[resolveIncomeMode(draft.accidentIncome)] ?? resolveIncomeMode(draft.accidentIncome);
  }

  const beneficiaryCounts = countBeneficiariesByClaimantStatus(draft.beneficiaries ?? []);

  return {
    calculationType: "TRAFFIC_DEATH",
    deceasedName: draft.deceased.fullName?.trim() || "—",
    eventDate,
    calculationDate: draft.common.calculationDate?.trim() || null,
    employmentStatus: status,
    employmentStatusLabel: statusLabel,
    incomeMode,
    effectiveNetIncome,
    referenceMinWageAtEvent,
    nonWorkingSelectedIncome:
      status === "NOT_WORKING" ? draft.nonWorkingSelectedIncome ?? null : null,
    plaintiffBeneficiaryCount: beneficiaryCounts.plaintiff,
    outOfCaseBeneficiaryCount: beneficiaryCounts.outOfCase,
  };
}

export function buildCalculationReviewSummary(draft: TrafficInjuryDraft): CalculationReviewSummaryResponse {
  const inputHash = hashCalculationInput(draft);
  return {
    inputHash,
    calculationHashVersion: CALCULATION_HASH_VERSION,
    summary: buildTrafficInjuryReviewSummary(draft),
  };
}

export function buildCalculationReviewSummaryForDraft(
  draft: CalculationDraft
): CalculationReviewSummaryResponse {
  if (draft.calculationType === "TRAFFIC_INJURY") {
    try {
      return buildCalculationReviewSummary(draft);
    } catch (err) {
      if (err instanceof UnsupportedHashCalculationTypeError) {
        return {
          inputHash: "",
          calculationHashVersion: CALCULATION_HASH_VERSION,
          summary: {
            calculationType: draft.calculationType,
            message: err.message,
          },
        };
      }
      throw err;
    }
  }
  if (draft.calculationType === "TRAFFIC_DEATH") {
    try {
      const inputHash = hashCalculationInput(draft);
      return {
        inputHash,
        calculationHashVersion: CALCULATION_HASH_VERSION,
        summary: buildTrafficDeathReviewSummary(draft),
      };
    } catch (err) {
      if (err instanceof UnsupportedHashCalculationTypeError) {
        return {
          inputHash: "",
          calculationHashVersion: CALCULATION_HASH_VERSION,
          summary: {
            calculationType: draft.calculationType,
            message: err.message,
          },
        };
      }
      throw err;
    }
  }
  return {
    inputHash: "",
    calculationHashVersion: CALCULATION_HASH_VERSION,
    summary: {
      calculationType: draft.calculationType,
      message: "Bu hesap türü için giriş özeti henüz tanımlı değil.",
    },
  };
}
