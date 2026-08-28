import { roundMoney } from "./money.js";

/** PSD mahsup politikası — ileride araç/işleten/işveren kusuru için genişletilebilir */
export interface PsdDeductionPolicy {
  /** Mahsup edilebilir PSD çarpanı (varsayılan: davacı kusuru düşülür) */
  deductibleMultiplier(injuredFaultRatio: number): number;
}

export const defaultPsdDeductionPolicy: PsdDeductionPolicy = {
  deductibleMultiplier: (injuredFaultRatio) => 1 - injuredFaultRatio / 100,
};

export interface PsdApplicationResult {
  psdTotal: number;
  psdDeductibleAfterFault: number;
  totalAfterPSD: number;
}

export function applyCapitalValueDeduction(
  totalAfterFault: number,
  psdTotal: number,
  injuredFaultRatio: number,
  policy: PsdDeductionPolicy = defaultPsdDeductionPolicy
): PsdApplicationResult {
  const multiplier = policy.deductibleMultiplier(injuredFaultRatio);
  const psdDeductibleAfterFault = roundMoney(psdTotal * multiplier);
  const totalAfterPSD = Math.max(0, roundMoney(totalAfterFault - psdDeductibleAfterFault));
  return {
    psdTotal: roundMoney(psdTotal),
    psdDeductibleAfterFault,
    totalAfterPSD,
  };
}
