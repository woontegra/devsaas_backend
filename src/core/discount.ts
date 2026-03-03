/**
 * Discount factor: v^t = 1 / (1 + i)^t
 * Pure functions only.
 */
export function discountFactor(interestRate: number, years: number): number {
  if (years <= 0) return 1;
  const v = 1 / (1 + interestRate);
  return Math.pow(v, years);
}

export function discountFactorMonthly(annualInterestRate: number, months: number): number {
  if (months <= 0) return 1;
  const monthlyRate = Math.pow(1 + annualInterestRate, 1 / 12) - 1;
  const v = 1 / (1 + monthlyRate);
  return Math.pow(v, months);
}
