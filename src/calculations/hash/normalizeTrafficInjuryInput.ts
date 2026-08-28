import type {
  InsuranceGarameEntry,
  InsurancePaymentRecord,
  TrafficInjuryDraft,
} from "../types.js";
import { roundMoney } from "../trafficInjury/money.js";
import { CALCULATION_HASH_VERSION } from "./calculationHashVersion.js";

function normalizeDate(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : iso.trim();
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

function normalizeMoney(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return roundMoney(value);
}

function normalizeMoneyOrNull(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return roundMoney(value);
}

function normalizeRate(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return roundMoney(value);
}

function normalizeGarameEntries(entries: InsuranceGarameEntry[] | undefined): Array<{
  subjectRef: string | null;
  externalPersonLabel: string | null;
}> {
  return (entries ?? []).map((e) => ({
    subjectRef: e.subjectRef ?? null,
    externalPersonLabel: normalizeOptionalString(e.externalPersonLabel),
  }));
}

function normalizeInsurancePayments(payments: InsurancePaymentRecord[]): Array<{
  paymentDate: string | null;
  paymentAmount: number;
  liabilityLimit: number;
  accidentLimit: number | null;
  garameEnabled: boolean;
  garameEntries: Array<{ subjectRef: string | null; externalPersonLabel: string | null }>;
}> {
  return payments.map((p) => ({
    paymentDate: normalizeDate(p.paymentDate),
    paymentAmount: normalizeMoney(p.paymentAmount),
    liabilityLimit: normalizeMoney(p.liabilityLimit),
    accidentLimit: normalizeMoneyOrNull(p.accidentLimit),
    garameEnabled: p.garameEnabled === true,
    garameEntries: p.garameEnabled === true ? normalizeGarameEntries(p.garameEntries) : [],
  }));
}

/** TRAFFIC_INJURY motor girdisi — hash ve erişim için canonical form */
export function normalizeTrafficInjuryInput(draft: TrafficInjuryDraft): Record<string, unknown> {
  return {
    calculationType: draft.calculationType,
    calculationHashVersion: CALCULATION_HASH_VERSION,
    common: {
      eventDate: normalizeDate(draft.common.eventDate),
      calculationDate: normalizeDate(draft.common.calculationDate),
    },
    processedPeriodStartDate: normalizeDate(draft.processedPeriodStartDate),
    processedPeriodEndDate: normalizeDate(draft.processedPeriodEndDate),
    plaintiff: {
      birthDate: normalizeDate(draft.parties.plaintiff.birthDate),
      gender: draft.parties.plaintiff.gender || null,
    },
    passivePhaseAge: draft.passivePhaseAge ?? null,
    disability: {
      permanentDisabilityRate: normalizeRate(draft.disability.permanentDisabilityRate),
      disabilityStartDate: normalizeDate(draft.disability.disabilityStartDate),
    },
    temporaryIncapacityPeriods: draft.temporaryIncapacityPeriods.map((p) => ({
      startDate: normalizeDate(p.startDate),
      endDate: normalizeDate(p.endDate),
    })),
    liability: {
      injuredFaultRatio: normalizeRate(draft.liability.injuredFaultRatio),
    },
    accidentIncome: {
      incomeMode: draft.accidentIncome.incomeMode,
      fixedAmount: normalizeMoneyOrNull(draft.accidentIncome.fixedAmount),
      averageNetResult: normalizeMoneyOrNull(draft.accidentIncome.averageNetResult),
    },
    capitalValueDocuments: draft.capitalValueDocuments.map((d) => ({
      amount: normalizeMoneyOrNull(d.amount),
    })),
    zmtsPayments: normalizeInsurancePayments(draft.zmtsPayments ?? []),
    cascoPayments: normalizeInsurancePayments(draft.cascoPayments ?? []),
  };
}
