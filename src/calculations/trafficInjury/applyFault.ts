import { roundMoney } from "./money.js";

export interface FaultApplicationResult {
  injuredFaultRate: number;
  faultDeductionAmount: number;
  totalAfterFault: number;
}

/** Toplam zarara tek seferde kusur indirimi */
export function applyFault(totalDamage: number, injuredFaultRatio: number): FaultApplicationResult {
  const rate = Math.max(0, Math.min(100, injuredFaultRatio));
  const totalAfterFault = roundMoney(totalDamage * (1 - rate / 100));
  return {
    injuredFaultRate: rate,
    totalAfterFault,
    faultDeductionAmount: roundMoney(totalDamage - totalAfterFault),
  };
}
