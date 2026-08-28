import type { CalculationDraft, CalculationType, TrafficInjuryDraft } from "./types.js";
import { hashCalculationInput, CALCULATION_HASH_VERSION } from "./hash/calculationInputHash.js";
import { UnsupportedHashCalculationTypeError } from "./hash/calculationInputNormalizer.js";

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
  permanentDisabilityRate: number | null;
  disabilityStartDate: string | null;
  injuredFaultRatio: number;
  incomeMode: string;
  fixedAmount: number | null;
  averageNetResult: number | null;
  passivePhaseAge: number | null;
  psdDocuments: ReviewSummaryPsdRow[];
  zmtsPayments: ReviewSummaryInsurancePayment[];
  cascoPayments: ReviewSummaryInsurancePayment[];
}

export interface CalculationReviewSummaryResponse {
  inputHash: string;
  calculationHashVersion: number;
  summary: TrafficInjuryReviewSummary | { calculationType: CalculationType; message: string };
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
  return {
    calculationType: "TRAFFIC_INJURY",
    plaintiffName: [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "—",
    birthDate: p.birthDate?.trim() || null,
    gender: genderLabel(p.gender),
    eventDate: draft.common.eventDate?.trim() || null,
    calculationDate: draft.common.calculationDate?.trim() || null,
    processedPeriodStartDate: draft.processedPeriodStartDate?.trim() || draft.common.eventDate || null,
    processedPeriodEndDate: draft.processedPeriodEndDate?.trim() || draft.common.calculationDate || null,
    temporaryIncapacityPeriods: draft.temporaryIncapacityPeriods.map((row) => ({
      startDate: row.startDate?.trim() || null,
      endDate: row.endDate?.trim() || null,
    })),
    permanentDisabilityRate: draft.disability.permanentDisabilityRate ?? null,
    disabilityStartDate: draft.disability.disabilityStartDate?.trim() || null,
    injuredFaultRatio: draft.liability.injuredFaultRatio ?? 0,
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
  if (draft.calculationType !== "TRAFFIC_INJURY") {
    return {
      inputHash: "",
      calculationHashVersion: CALCULATION_HASH_VERSION,
      summary: {
        calculationType: draft.calculationType,
        message: "Bu hesap türü için giriş özeti henüz tanımlı değil.",
      },
    };
  }
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
