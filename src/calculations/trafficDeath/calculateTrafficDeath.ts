import type { TrafficDeathDraft } from "../types.js";
import { applyFault } from "../trafficInjury/applyFault.js";
import { applyCapitalValueDeduction } from "../trafficInjury/applyCapitalValueDeduction.js";
import { accrueClaimantLegalPayment } from "../trafficInjury/calculateInsuranceDeductions.js";
import type { InsurancePaymentRecord } from "../types.js";
import { LEGAL_INTEREST_RATE_PERIODS } from "../../data/legalInterestRates.js";
import { actuarialDays360Inclusive } from "../trafficInjury/dayCount360.js";
import {
  addDaysIso,
  compareIso,
  minIso,
  splitByMinWagePeriods,
  type DateRange,
} from "../trafficInjury/dateUtils.js";
import { discountRawForKn, knRawForPeriod } from "../trafficInjury/knFormat.js";
import { dailyFromMonthly, roundMoney } from "../trafficInjury/money.js";
import { calculateTrafficDeathSupportPeriods } from "./supportPeriods/calculateSupportPeriods.js";
import type { ShareEntry, SupportPeriod } from "./supportPeriods/types.js";
import { resolveMarriageProbability } from "./marriageProbability.js";
import { resolveDeathIncome } from "./resolveDeathIncome.js";
import type {
  ClaimantUpdatedPaymentDetail,
  TrafficDeathCalculationResult,
  TrafficDeathClaimantLoss,
  TrafficDeathFutureClaimantRow,
  TrafficDeathProcessedClaimantRow,
} from "./types.js";

const RELATION_LABEL: Record<string, string> = {
  spouse: "Eş",
  mother: "Anne",
  father: "Baba",
  child: "Çocuk",
  sibling: "Kardeş",
  other: "Diğer",
};

function claimantMeta(
  key: string,
  draft: TrafficDeathDraft,
  columnKeys: Array<{ key: string; header: string; synthetic?: boolean }>
): {
  claimantName: string;
  relationLabel: string;
  claimantStatus: "PLAINTIFF" | "OUT_OF_CASE" | "SYNTHETIC" | null;
} {
  const ben = draft.beneficiaries.find((b) => b.id === key);
  if (ben) {
    return {
      claimantName: ben.fullName?.trim() || RELATION_LABEL[ben.relation] || key,
      relationLabel: RELATION_LABEL[ben.relation] ?? ben.relation,
      claimantStatus: ben.claimantStatus === "OUT_OF_CASE" ? "OUT_OF_CASE" : "PLAINTIFF",
    };
  }
  const col = columnKeys.find((c) => c.key === key);
  return {
    claimantName: col?.header ?? key,
    relationLabel: col?.header ?? key,
    claimantStatus: col?.synthetic ? "SYNTHETIC" : null,
  };
}

function claimantShareEntries(shares: Record<string, ShareEntry>): Array<[string, ShareEntry]> {
  return Object.entries(shares).filter(([key, entry]) => {
    if (key === "deceased") return false;
    return entry.percentage > 0 && Number.isFinite(entry.percentage);
  });
}

function sumDeathExpenses(draft: TrafficDeathDraft) {
  const preDeathTreatment =
    typeof draft.deathExpenses.preDeathTreatment === "number" && draft.deathExpenses.preDeathTreatment > 0
      ? draft.deathExpenses.preDeathTreatment
      : 0;
  const funeralCost =
    typeof draft.deathExpenses.funeralCost === "number" && draft.deathExpenses.funeralCost > 0
      ? draft.deathExpenses.funeralCost
      : 0;
  const transportCost =
    typeof draft.deathExpenses.transportCost === "number" && draft.deathExpenses.transportCost > 0
      ? draft.deathExpenses.transportCost
      : 0;
  const otherExpenses = roundMoney(
    (draft.deathExpenses.otherExpenses ?? []).reduce(
      (s, e) => s + (typeof e.amount === "number" && e.amount > 0 ? e.amount : 0),
      0
    )
  );
  return {
    preDeathTreatment: roundMoney(preDeathTreatment),
    funeralCost: roundMoney(funeralCost),
    transportCost: roundMoney(transportCost),
    otherExpenses,
    total: roundMoney(preDeathTreatment + funeralCost + transportCost + otherExpenses),
  };
}

function insurancePaymentSlices(
  row: InsurancePaymentRecord
): Array<{ claimantId: string; principal: number; paymentDate: string }> {
  if (row.garameEnabled === true) {
    return (row.deathGarameRows ?? []).flatMap((person) => {
      const claimantId = person.claimantId?.trim() ?? "";
      const principal = person.paymentAmount ?? 0;
      const paymentDate = person.paymentDate?.trim() ?? "";
      if (!claimantId || principal <= 0 || !paymentDate) return [];
      return [{ claimantId, principal, paymentDate }];
    });
  }
  const claimantId = row.claimantId?.trim() ?? "";
  const principal = row.paymentAmount ?? 0;
  const paymentDate = row.paymentDate?.trim() ?? "";
  if (!claimantId || principal <= 0 || !paymentDate) return [];
  return [{ claimantId, principal, paymentDate }];
}

function hasEligibleInsurancePayment(rows: TrafficDeathDraft["zmtsPayments"]): boolean {
  return (rows ?? []).some((row) => {
    if (row.garameEnabled === true) return insurancePaymentSlices(row).length > 0;
    return Boolean(row.paymentDate?.trim()) && (row.paymentAmount ?? 0) > 0;
  });
}

function applyClaimantInsurancePayments(
  claimantLosses: TrafficDeathClaimantLoss[],
  draft: TrafficDeathDraft,
  warnings: string[]
): TrafficDeathClaimantLoss[] {
  const calculationDate = draft.common.calculationDate;
  const visible = new Set(claimantLosses.map((c) => c.claimantId));
  const zmts = new Map<string, ClaimantUpdatedPaymentDetail[]>();
  const casco = new Map<string, ClaimantUpdatedPaymentDetail[]>();

  const add = (
    target: Map<string, ClaimantUpdatedPaymentDetail[]>,
    slice: { claimantId: string; principal: number; paymentDate: string }
  ) => {
    if (!visible.has(slice.claimantId)) return;
    if (slice.paymentDate > calculationDate) return;
    const detail = accrueClaimantLegalPayment(
      slice.principal,
      slice.paymentDate,
      calculationDate,
      LEGAL_INTEREST_RATE_PERIODS,
      warnings
    );
    const list = target.get(slice.claimantId) ?? [];
    list.push(detail);
    target.set(slice.claimantId, list);
  };

  for (const row of draft.zmtsPayments ?? []) {
    for (const slice of insurancePaymentSlices(row)) add(zmts, slice);
  }
  for (const row of draft.cascoPayments ?? []) {
    for (const slice of insurancePaymentSlices(row)) add(casco, slice);
  }

  return claimantLosses.map((c) => {
    const zmtsDetails = zmts.get(c.claimantId) ?? [];
    const cascoDetails = casco.get(c.claimantId) ?? [];
    const updatedZmtsPaymentAmount = roundMoney(zmtsDetails.reduce((s, d) => s + d.updatedAmount, 0));
    const updatedCascoPaymentAmount = roundMoney(cascoDetails.reduce((s, d) => s + d.updatedAmount, 0));
    const afterMarriage = c.lossAfterMarriageProbability ?? 0;
    return {
      ...c,
      updatedZmtsPaymentAmount,
      updatedCascoPaymentAmount,
      lossAfterInsurancePayments: roundMoney(
        Math.max(0, afterMarriage - updatedZmtsPaymentAmount - updatedCascoPaymentAmount)
      ),
      ...(zmtsDetails.length > 0 ? { zmtsPaymentDetails: zmtsDetails } : {}),
      ...(cascoDetails.length > 0 ? { cascoPaymentDetails: cascoDetails } : {}),
    };
  });
}

/**
 * PSD / ZMTS / Kasko satırı varsa yaralanmadaki kademeli mahsup uygulanır
 * ve eski priorPayments tutarı ikinci kez düşülmez.
 * Üç kart da boşsa eski önceki ödeme mahsubu korunur.
 * Sosyal yardım hiçbir zaman düşülmez.
 */
function resolveDeathPaymentCards(params: {
  draft: TrafficDeathDraft;
  totalAfterMarriageProbability: number;
  totalAfterClaimantInsurance: number;
  deceasedFaultRate: number;
  deathExpenseTotal: number;
  legacyPrior: { total: number; applied: boolean };
  warnings: string[];
}): Pick<
  TrafficDeathCalculationResult,
  | "priorPaymentsTotal"
  | "priorPaymentsApplied"
  | "finalCompensation"
  | "psdTotal"
  | "psdDeductibleAfterFault"
  | "totalAfterCapitalValue"
  | "insuranceDeductions"
> {
  const psdTotal = roundMoney(
    (params.draft.capitalValueDocuments ?? []).reduce(
      (s, d) => s + (typeof d.amount === "number" && d.amount > 0 ? d.amount : 0),
      0
    )
  );
  const active =
    psdTotal > 0 ||
    hasEligibleInsurancePayment(params.draft.zmtsPayments) ||
    hasEligibleInsurancePayment(params.draft.cascoPayments);
  if (!active) {
    return {
      priorPaymentsTotal: params.legacyPrior.total,
      priorPaymentsApplied: params.legacyPrior.applied,
      finalCompensation: roundMoney(
        Math.max(0, params.totalAfterMarriageProbability + params.deathExpenseTotal - params.legacyPrior.total)
      ),
    };
  }

  const psd = applyCapitalValueDeduction(
    params.totalAfterClaimantInsurance,
    psdTotal,
    params.deceasedFaultRate
  );
  const finalCompensation = roundMoney(psd.totalAfterPSD + params.deathExpenseTotal);
  const gross = roundMoney(params.totalAfterMarriageProbability + params.deathExpenseTotal);
  const appliedMahsup = roundMoney(Math.max(0, gross - finalCompensation));
  return {
    psdTotal: psd.psdTotal,
    psdDeductibleAfterFault: psd.psdDeductibleAfterFault,
    totalAfterCapitalValue: psd.totalAfterPSD,
    priorPaymentsTotal: appliedMahsup,
    priorPaymentsApplied: appliedMahsup > 0,
    finalCompensation,
  };
}

function sumPriorPayments(draft: TrafficDeathDraft): { total: number; applied: boolean } {
  const items = draft.priorPayments ?? [];
  if (items.length === 0) return { total: 0, applied: false };
  const total = roundMoney(
    items.reduce((s, p) => s + (typeof p.amount === "number" && p.amount > 0 ? p.amount : 0), 0)
  );
  return { total, applied: total > 0 };
}

/** FUTURE destek dönemlerini takvim yılı + KN periodIndex ile kesiştir */
function splitFutureByKnYears(
  period: SupportPeriod,
  calculationDate: string
): Array<{ startDate: string; endDate: string; periodIndex: number }> {
  const futureStart = addDaysIso(calculationDate, 1);
  const start = compareIso(period.startDate, futureStart) < 0 ? futureStart : period.startDate;
  const end = period.endDate;
  if (compareIso(start, end) > 0) return [];

  const firstFutureYear = parseInt(futureStart.slice(0, 4), 10);
  const out: Array<{ startDate: string; endDate: string; periodIndex: number }> = [];
  let cursor = start;
  while (compareIso(cursor, end) <= 0) {
    const year = cursor.slice(0, 4);
    const yearEnd = minIso(`${year}-12-31`, end);
    const segmentYear = parseInt(year, 10);
    const periodIndex = segmentYear - firstFutureYear + 1;
    out.push({ startDate: cursor, endDate: yearEnd, periodIndex });
    if (compareIso(yearEnd, end) >= 0) break;
    cursor = addDaysIso(yearEnd, 1);
  }
  return out;
}

function accumulateClaimant(
  map: Map<string, TrafficDeathClaimantLoss>,
  row: {
    claimantId: string;
    claimantName: string;
    relationLabel: string;
    claimantStatus: TrafficDeathClaimantLoss["claimantStatus"];
    processed?: number;
    future?: number;
  }
) {
  const existing = map.get(row.claimantId);
  if (!existing) {
    map.set(row.claimantId, {
      claimantId: row.claimantId,
      claimantName: row.claimantName,
      relationLabel: row.relationLabel,
      claimantStatus: row.claimantStatus,
      processedLoss: roundMoney(row.processed ?? 0),
      futureLoss: roundMoney(row.future ?? 0),
      totalLoss: roundMoney((row.processed ?? 0) + (row.future ?? 0)),
    });
    return;
  }
  existing.processedLoss = roundMoney(existing.processedLoss + (row.processed ?? 0));
  existing.futureLoss = roundMoney(existing.futureLoss + (row.future ?? 0));
  existing.totalLoss = roundMoney(existing.processedLoss + existing.futureLoss);
}

export function calculateTrafficDeath(draft: TrafficDeathDraft): TrafficDeathCalculationResult {
  const warnings: string[] = [];
  const support = calculateTrafficDeathSupportPeriods(draft);
  if (support.errors.length > 0) {
    throw new Error(support.errors.join(" · ") || "Destek dönemleri hesaplanamadı.");
  }

  const income = resolveDeathIncome(draft, warnings);
  const calcDate = draft.common.calculationDate;
  const columnKeys = support.columnKeys;
  const processedRows: TrafficDeathProcessedClaimantRow[] = [];
  const futureRows: TrafficDeathFutureClaimantRow[] = [];
  const lossMap = new Map<string, TrafficDeathClaimantLoss>();

  for (const period of support.periods) {
    if (!period.supportActive || !period.shares || Object.keys(period.shares).length === 0) {
      continue;
    }
    const claimants = claimantShareEntries(period.shares);
    if (claimants.length === 0) continue;

    if (period.periodType === "PAST") {
      const range: DateRange = { startDate: period.startDate, endDate: period.endDate };
      for (const wageSeg of splitByMinWagePeriods(range)) {
        const dayCount = actuarialDays360Inclusive(wageSeg.startDate, wageSeg.endDate);
        if (dayCount <= 0) continue;
        const monthlyNetIncome = income.getMonthlyNetForDate(wageSeg.startDate);
        const dailyNetIncome = dailyFromMonthly(monthlyNetIncome);
        const periodIncome = roundMoney(dailyNetIncome * dayCount);

        for (const [claimantId, share] of claimants) {
          const meta = claimantMeta(claimantId, draft, columnKeys);
          const periodDamage = roundMoney(periodIncome * (share.percentage / 100));
          processedRows.push({
            startDate: wageSeg.startDate,
            endDate: wageSeg.endDate,
            dayCount,
            monthlyNetIncome,
            dailyNetIncome,
            periodIncome,
            claimantId,
            claimantName: meta.claimantName,
            claimantStatus: meta.claimantStatus,
            relationLabel: meta.relationLabel,
            shareFraction: share.fraction,
            sharePercentage: share.percentage,
            supportRate: share.percentage,
            periodDamage,
            periodKind: "processed_support",
          });
          accumulateClaimant(lossMap, {
            claimantId,
            ...meta,
            processed: periodDamage,
          });
        }
      }
      continue;
    }

    // FUTURE — KN yıllarına bölünmüş destek dönemi
    for (const knSeg of splitFutureByKnYears(period, calcDate)) {
      const dayCount = actuarialDays360Inclusive(knSeg.startDate, knSeg.endDate);
      if (dayCount <= 0) continue;

      const monthlyNetIncome = income.monthlyNetAtCalculation;
      const dailyNetIncome = income.dailyNetAtCalculation;
      const knRaw = knRawForPeriod(knSeg.periodIndex);
      const discountRaw = discountRawForKn(knRaw);
      const increasedIncome = roundMoney(dailyNetIncome * dayCount * knRaw);
      const discountedIncome = roundMoney(increasedIncome / knRaw);

      for (const [claimantId, share] of claimants) {
        const meta = claimantMeta(claimantId, draft, columnKeys);
        const periodDamage = roundMoney(discountedIncome * (share.percentage / 100));
        futureRows.push({
          startDate: knSeg.startDate,
          endDate: knSeg.endDate,
          dayCount,
          monthlyNetIncome,
          dailyNetIncome,
          kn: knRaw,
          discountFactor: discountRaw,
          increasedIncome,
          discountedIncome,
          claimantId,
          claimantName: meta.claimantName,
          claimantStatus: meta.claimantStatus,
          relationLabel: meta.relationLabel,
          shareFraction: share.fraction,
          sharePercentage: share.percentage,
          periodDamage,
          periodKind: "future_support",
          periodIndex: knSeg.periodIndex,
        });
        accumulateClaimant(lossMap, {
          claimantId,
          ...meta,
          future: periodDamage,
        });
      }
    }
  }

  const processedTotal = roundMoney(processedRows.reduce((s, r) => s + r.periodDamage, 0));
  const futureTotal = roundMoney(futureRows.reduce((s, r) => s + r.periodDamage, 0));
  const totalSupportLoss = roundMoney(processedTotal + futureTotal);

  const deceasedFaultRate = applyFault(0, draft.deceasedFaultRate ?? 0).injuredFaultRate;

  const deathExpenses = sumDeathExpenses(draft);
  const prior = sumPriorPayments(draft);

  // Müteveffa asla claimant loss satırında olmamalı.
  // Kusur her hak sahibinin kendi toplamına bir kez uygulanır; toplama tekrar uygulanmaz.
  const filteredClaimants = [...lossMap.values()]
    .filter((c) => c.claimantId !== "deceased")
    .map((c) => {
      const fault = applyFault(c.totalLoss, deceasedFaultRate);
      return {
        ...c,
        deceasedFaultRate: fault.injuredFaultRate,
        lossAfterDeceasedFault: fault.totalAfterFault,
      };
    })
    .sort((a, b) => a.claimantName.localeCompare(b.claimantName, "tr"));

  const totalAfterFault = roundMoney(
    filteredClaimants.reduce((s, c) => s + (c.lossAfterDeceasedFault ?? 0), 0)
  );
  const faultDeductionAmount = roundMoney(totalSupportLoss - totalAfterFault);

  const marriageProbability = resolveMarriageProbability(draft);
  const marriageRate = marriageProbability.applied ? marriageProbability.finalMarriageProbabilityRate : 0;
  const marriedClaimants = filteredClaimants.map((c) => {
    const afterFault = c.lossAfterDeceasedFault ?? 0;
    const applies = marriageProbability.applied && c.claimantId === marriageProbability.spouseClaimantId;
    const lossAfterMarriageProbability = applies
      ? roundMoney(afterFault * (1 - marriageRate / 100))
      : afterFault;
    return {
      ...c,
      marriageProbabilityApplied: applies,
      marriageProbabilityRate: applies ? marriageRate : 0,
      lossAfterMarriageProbability,
    };
  });
  const claimantLosses = applyClaimantInsurancePayments(marriedClaimants, draft, warnings);
  const totalAfterMarriageProbability = roundMoney(
    claimantLosses.reduce((s, c) => s + (c.lossAfterMarriageProbability ?? 0), 0)
  );
  const updatedZmtsPaymentTotal = roundMoney(
    claimantLosses.reduce((s, c) => s + (c.updatedZmtsPaymentAmount ?? 0), 0)
  );
  const updatedCascoPaymentTotal = roundMoney(
    claimantLosses.reduce((s, c) => s + (c.updatedCascoPaymentAmount ?? 0), 0)
  );
  const totalAfterClaimantInsurance = roundMoney(
    claimantLosses.reduce((s, c) => s + (c.lossAfterInsurancePayments ?? 0), 0)
  );
  const paymentCards = resolveDeathPaymentCards({
    draft,
    totalAfterMarriageProbability,
    totalAfterClaimantInsurance,
    deceasedFaultRate,
    deathExpenseTotal: deathExpenses.total,
    legacyPrior: prior,
    warnings,
  });

  return {
    calculationType: "TRAFFIC_DEATH",
    resolvedIncome: {
      incomeMode: income.incomeMode,
      monthlyNetAtEvent: income.monthlyNetAtEvent,
      monthlyNetAtCalculation: income.monthlyNetAtCalculation,
      dailyNetAtCalculation: income.dailyNetAtCalculation,
      coefficient: income.coefficient,
      eventDateMinWage: income.eventDateMinWage,
    },
    dailyNetIncome: income.dailyNetAtCalculation,
    personLives: support.personLives,
    shareRatioPeriods: support.shareRatioPeriods,
    columnKeys: support.columnKeys,
    supportPeriods: support.periods,
    processedPeriods: processedRows,
    futurePeriods: futureRows,
    claimantLosses,
    processedTotal,
    futureTotal,
    totalSupportLoss,
    deceasedFaultRate,
    faultDeductionAmount,
    totalAfterFault,
    totalAfterMarriageProbability,
    updatedZmtsPaymentTotal,
    updatedCascoPaymentTotal,
    totalAfterClaimantInsurance,
    marriageProbability,
    deathExpenses,
    ...paymentCards,
    warnings: [...warnings, ...support.warnings],
  };
}
