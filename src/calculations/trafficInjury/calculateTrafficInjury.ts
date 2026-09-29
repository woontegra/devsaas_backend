import type { TrafficInjuryDraft } from "../types.js";
import { applyCapitalValueDeduction } from "./applyCapitalValueDeduction.js";
import { applyFault } from "./applyFault.js";
import { buildFuturePeriods } from "./buildFuturePeriods.js";
import { buildProcessedWindow } from "./buildProcessedPeriods.js";
import { calculateFuturePermanent } from "./calculateFuturePermanent.js";
import { calculateProcessedPermanent } from "./calculateProcessedPermanent.js";
import { calculateTemporaryIncapacity, resolveTemporaryIncapacityGapIgnored } from "./calculateTemporaryIncapacity.js";
import { computeEffectiveTemporaryRange } from "../tempIncapacityPeriodUtils.js";
import { resolveIncome } from "./resolveIncome.js";
import { resolveLifeExpectancy } from "./resolveLifeExpectancy.js";
import { calculateInsuranceDeductions } from "./calculateInsuranceDeductions.js";
import { roundMoney } from "./money.js";
import type { TrafficInjuryCalculationResult } from "./types.js";
import { assertDisabilityStartDateForCalculation } from "../disabilityStartDateValidation.js";

function sumPsd(documents: TrafficInjuryDraft["capitalValueDocuments"]): number {
  return roundMoney(
    documents.reduce((s, d) => s + (typeof d.amount === "number" && d.amount > 0 ? d.amount : 0), 0)
  );
}

export function calculateTrafficInjury(draft: TrafficInjuryDraft): TrafficInjuryCalculationResult {
  assertDisabilityStartDateForCalculation(draft);
  const warnings: string[] = [];

  const income = resolveIncome(draft, warnings);
  const life = resolveLifeExpectancy(draft);
  const processedWindow = buildProcessedWindow(draft);

  const temp = calculateTemporaryIncapacity(draft, processedWindow, income);
  const processed = calculateProcessedPermanent(draft, processedWindow, income);

  const gapIgnored = resolveTemporaryIncapacityGapIgnored(draft);
  const temporaryIncapacityEffectiveRange = gapIgnored
    ? computeEffectiveTemporaryRange(draft.temporaryIncapacityPeriods)
    : null;

  const futureSegments = buildFuturePeriods(
    draft.common.calculationDate,
    life.probableLifeEndDate,
    life.passivePhaseStartDate
  );
  const disabilityRate = draft.disability.permanentDisabilityRate ?? 0;
  const future = calculateFuturePermanent(futureSegments, income, disabilityRate);

  const processedPeriods = [...temp.rows, ...processed.rows];

  const temporaryIncapacityTotal = temp.total;
  const processedPermanentTotal = processed.total;
  const futurePermanentTotal = future.total;

  const totalDamageBeforeFault = roundMoney(
    temporaryIncapacityTotal + processedPermanentTotal + futurePermanentTotal
  );

  const injuredFaultRatio = draft.liability.injuredFaultRatio ?? 0;
  const fault = applyFault(totalDamageBeforeFault, injuredFaultRatio);

  const psdTotal = sumPsd(draft.capitalValueDocuments);
  const psd = applyCapitalValueDeduction(fault.totalAfterFault, psdTotal, fault.injuredFaultRate);

  const finalCompensationBeforeInsurance = psd.totalAfterPSD;
  const insurance = calculateInsuranceDeductions(draft, finalCompensationBeforeInsurance, warnings);

  return {
    resolvedIncome: {
      incomeMode: income.incomeMode,
      monthlyNetAtEvent: income.monthlyNetAtEvent,
      monthlyNetAtCalculation: income.monthlyNetAtCalculation,
      dailyNetAtCalculation: income.dailyNetAtCalculation,
      coefficient: income.coefficient,
      eventDateMinWage: income.eventDateMinWage,
    },
    dailyNetIncome: income.dailyNetAtCalculation,
    processedPeriods,
    temporaryIncapacityPeriods: temp.rows,
    futurePeriods: future.rows,
    temporaryIncapacityTotal,
    processedPermanentTotal,
    futurePermanentTotal,
    totalDamageBeforeFault,
    injuredFaultRate: fault.injuredFaultRate,
    faultDeductionAmount: fault.faultDeductionAmount,
    totalAfterFault: fault.totalAfterFault,
    psdTotal: psd.psdTotal,
    psdDeductibleAfterFault: psd.psdDeductibleAfterFault,
    totalAfterPSD: psd.totalAfterPSD,
    lifeExpectancy: life,
    permanentDisabilityRate: disabilityRate,
    probableLifeEndDate: life.probableLifeEndDate,
    passivePhaseStartDate: life.passivePhaseStartDate,
    finalCompensationBeforeInsurance,
    insuranceDeductions: {
      zmts: insurance.zmts,
      casco: insurance.casco,
    },
    finalCompensationAfterInsurance: insurance.finalCompensationAfterInsurance,
    insuranceClaimContext: {
      claimAmountBeforeGarame: finalCompensationBeforeInsurance,
      claimAmountAfterInsurance: insurance.finalCompensationAfterInsurance,
      totalDamageBeforeFault,
      totalAfterFault: fault.totalAfterFault,
      totalAfterPSD: psd.totalAfterPSD,
      injuredFaultRate: fault.injuredFaultRate,
      garameInterestContext: insurance.garameInterestContext,
    },
    temporaryIncapacityGapIgnored: gapIgnored,
    temporaryIncapacityEffectiveRange,
    warnings,
  };
}
