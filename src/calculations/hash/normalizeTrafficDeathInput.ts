import type { TrafficDeathDraft } from "../types.js";
import { resolveBeneficiaryClaimantStatus } from "../beneficiaryClaimantStatus.js";
import { coerceUnder18ChildCount } from "../trafficDeath/marriageProbability.js";
import { CALCULATION_HASH_VERSION } from "./calculationHashVersion.js";

function normalizeDate(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null;
  const m = iso.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : iso.trim();
}

function normalizeMoneyOrNull(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

function normalizeMoney(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function normalizePayments(payments: TrafficDeathDraft["zmtsPayments"], withClaimant = false) {
  return (payments ?? []).map((p) => ({
    paymentDate: normalizeDate(p.paymentDate),
    paymentAmount: normalizeMoney(p.paymentAmount),
    liabilityLimit: normalizeMoney(p.liabilityLimit),
    accidentLimit: normalizeMoneyOrNull(p.accidentLimit),
    garameEnabled: p.garameEnabled === true,
    ...(withClaimant
      ? {
          claimantId: p.claimantId?.trim() || null,
          claimantName: p.claimantName?.trim() || null,
          claimantRelation: p.claimantRelation?.trim() || null,
        }
      : {}),
    deathGarameRows: (p.deathGarameRows ?? []).map((person) => ({
      claimantId: person.claimantId?.trim() || null,
      claimantStatus: person.claimantStatus ?? null,
      claimantRelation: person.claimantRelation?.trim() || null,
      paymentDate: normalizeDate(person.paymentDate),
      paymentAmount: normalizeMoney(person.paymentAmount),
      liabilityLimit: normalizeMoney(person.liabilityLimit),
      accidentLimit: normalizeMoney(person.accidentLimit),
    })),
  }));
}

export function normalizeTrafficDeathInput(draft: TrafficDeathDraft): Record<string, unknown> {
  const income = draft.accidentIncome;
  return {
    calculationHashVersion: CALCULATION_HASH_VERSION,
    calculationType: draft.calculationType,
    employmentStatus: draft.employmentStatus ?? null,
    common: {
      eventDate: normalizeDate(draft.common?.eventDate),
      calculationDate: normalizeDate(draft.common?.calculationDate),
    },
    deceased: {
      fullName: draft.deceased?.fullName?.trim() || null,
      birthDate: normalizeDate(draft.deceased?.birthDate),
      deathDate: normalizeDate(draft.deceased?.deathDate),
      gender: draft.deceased?.gender ?? null,
    },
    accidentIncome: {
      incomeMode: income?.incomeMode ?? "minWage",
      fixedAmount: normalizeMoneyOrNull(income?.fixedAmount),
      averageNetResult: normalizeMoneyOrNull(income?.averageNetResult),
    },
    nonWorkingSelectedIncome: normalizeMoneyOrNull(draft.nonWorkingSelectedIncome),
    beneficiaries: (draft.beneficiaries ?? []).map((b) => ({
      id: b.id,
      fullName: b.fullName?.trim() || null,
      relation: b.relation ?? null,
      birthDate: normalizeDate(b.birthDate),
      gender: b.gender ?? null,
      claimantStatus: resolveBeneficiaryClaimantStatus(b),
    })),
    marriageProbabilityDeduction: {
      under18ChildCount: coerceUnder18ChildCount(draft.marriageProbabilityDeduction?.under18ChildCount),
    },
    capitalValueDocuments: (draft.capitalValueDocuments ?? []).map((d) => ({
      amount: normalizeMoneyOrNull(d.amount),
    })),
    zmtsPayments: normalizePayments(draft.zmtsPayments, true),
    cascoPayments: normalizePayments(draft.cascoPayments, true),
  };
}
