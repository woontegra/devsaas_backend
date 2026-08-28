import type { LegalInterestRatePeriod } from "../../data/legalInterestRates.js";
import { LEGAL_INTEREST_RATE_PERIODS } from "../../data/legalInterestRates.js";
import type { InsurancePaymentRecord, TrafficInjuryDraft } from "../types.js";
import type {
  InsuranceDeductionGroup,
  InsuranceInterestDeductionRow,
  LegalInterestSegment,
} from "./types.js";
import { isGarameEnabled } from "./insuranceGarame.js";
import { calendarDaysBetween } from "./calendarDayCount.js";
import { addDaysIso, minIso } from "./dateUtils.js";
import { resolveLegalInterestRate } from "./resolveLegalInterestRate.js";
import { roundMoney } from "./money.js";

export interface InsuranceDeductionsResult {
  zmts: InsuranceDeductionGroup;
  casco: InsuranceDeductionGroup;
  finalCompensationAfterInsurance: number;
  garameInterestContext: Array<{
    paymentId: string;
    kind: "zmts" | "casco";
    principalPlusInterest: number;
  }>;
}

function isEligiblePayment(row: InsurancePaymentRecord): boolean {
  return Boolean(row.paymentDate?.trim()) && (row.paymentAmount ?? 0) > 0;
}

function accrueLegalInterest(
  principal: number,
  paymentDate: string,
  calculationDate: string,
  periods: LegalInterestRatePeriod[],
  warnings: string[]
): {
  dayCount: number;
  interest: number;
  segments: LegalInterestSegment[];
} {
  if (paymentDate >= calculationDate) {
    return { dayCount: 0, interest: 0, segments: [] };
  }

  if (calendarDaysBetween(paymentDate, calculationDate) === 0) {
    return { dayCount: 0, interest: 0, segments: [] };
  }

  const segments: LegalInterestSegment[] = [];
  let cursor = paymentDate;
  let totalInterest = 0;

  while (cursor < calculationDate) {
    const resolved = resolveLegalInterestRate(cursor, periods);
    if (resolved.rate == null || !resolved.period) {
      warnings.push(
        `Yasal faiz oranı tanımlı değil (${cursor}). ${paymentDate} – ${calculationDate} aralığı için faiz hesaplanamadı.`
      );
      break;
    }

    const periodEnd = resolved.period.endDate ?? calculationDate;
    const segmentEnd = minIso(calculationDate, periodEnd);
    const segDays =
      segmentEnd < calculationDate
        ? calendarDaysBetween(cursor, addDaysIso(segmentEnd, 1))
        : calendarDaysBetween(cursor, segmentEnd);
    if (segDays > 0) {
      const segInterest = roundMoney((principal * resolved.rate * segDays) / 36500);
      segments.push({
        startDate: cursor,
        endDate: segmentEnd,
        annualRatePercent: resolved.rate,
        calendarDayCount: segDays,
        interestAmount: segInterest,
      });
      totalInterest += segInterest;
    }

    if (segmentEnd >= calculationDate) break;
    cursor = addDaysIso(segmentEnd, 1);
  }

  totalInterest = roundMoney(totalInterest);
  const dayCount =
    segments.length > 0
      ? segments.reduce((sum, seg) => sum + seg.calendarDayCount, 0)
      : calendarDaysBetween(paymentDate, calculationDate);
  return { dayCount, interest: totalInterest, segments };
}

function buildGroup(
  payments: InsurancePaymentRecord[],
  calculationDate: string,
  kind: "zmts" | "casco",
  periods: LegalInterestRatePeriod[],
  warnings: string[],
  garameInterestContext: InsuranceDeductionsResult["garameInterestContext"]
): InsuranceDeductionGroup {
  const rows: InsuranceInterestDeductionRow[] = [];

  for (const p of payments) {
    if (!isEligiblePayment(p)) continue;

    if (p.paymentDate > calculationDate) {
      warnings.push(
        `${kind.toUpperCase()} ödeme tarihi (${p.paymentDate}) hesap tarihinden sonra; faiz hesaplanmadı.`
      );
      continue;
    }

    const principal = roundMoney(p.paymentAmount);
    const accrual = accrueLegalInterest(principal, p.paymentDate, calculationDate, periods, warnings);
    const interest = accrual.interest;
    const principalPlusInterest = roundMoney(principal + interest);

    rows.push({
      paymentDate: p.paymentDate,
      calculationDate,
      principalAmount: principal,
      calendarDayCount: accrual.dayCount,
      interestSegments: accrual.segments,
      interestAmount: interest,
      principalPlusInterest,
    });

    if (isGarameEnabled(p)) {
      garameInterestContext.push({
        paymentId: p.id,
        kind,
        principalPlusInterest,
      });
    }
  }

  const principalTotal = roundMoney(rows.reduce((s, r) => s + r.principalAmount, 0));
  const interestTotal = roundMoney(rows.reduce((s, r) => s + r.interestAmount, 0));
  const deductionTotal = roundMoney(rows.reduce((s, r) => s + r.principalPlusInterest, 0));

  return { rows, principalTotal, interestTotal, deductionTotal };
}

export function calculateInsuranceDeductions(
  draft: TrafficInjuryDraft,
  finalCompensationBeforeInsurance: number,
  warnings: string[],
  periods: LegalInterestRatePeriod[] = LEGAL_INTEREST_RATE_PERIODS
): InsuranceDeductionsResult {
  const calculationDate = draft.common.calculationDate;

  if (periods.length === 0 && (draft.zmtsPayments.some(isEligiblePayment) || draft.cascoPayments.some(isEligiblePayment))) {
    warnings.push(
      "Yasal faiz oranı tablosu boş. ZMTS/Kasko mahsupları yalnızca ana para ile uygulanır; faiz hesaplanmadı."
    );
  }

  const garameInterestContext: InsuranceDeductionsResult["garameInterestContext"] = [];
  const zmts = buildGroup(
    draft.zmtsPayments ?? [],
    calculationDate,
    "zmts",
    periods,
    warnings,
    garameInterestContext
  );
  const casco = buildGroup(
    draft.cascoPayments ?? [],
    calculationDate,
    "casco",
    periods,
    warnings,
    garameInterestContext
  );

  const totalDeduction = roundMoney(zmts.deductionTotal + casco.deductionTotal);
  const finalCompensationAfterInsurance = roundMoney(
    Math.max(0, finalCompensationBeforeInsurance - totalDeduction)
  );

  return {
    zmts,
    casco,
    finalCompensationAfterInsurance,
    garameInterestContext,
  };
}
