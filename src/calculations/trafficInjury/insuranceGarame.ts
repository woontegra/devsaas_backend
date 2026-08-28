import type { InsurancePaymentRecord } from "../types.js";

/** Eski taslaklar: garameEnabled yoksa kapalı kabul et */
export function isGarameEnabled(row: InsurancePaymentRecord): boolean {
  return row.garameEnabled === true;
}

/** Garame motoruna yalnızca açık kayıtlar girer */
export function paymentsForGarameMotor(
  rows: InsurancePaymentRecord[] | undefined
): InsurancePaymentRecord[] {
  return (rows ?? []).filter(isGarameEnabled);
}
