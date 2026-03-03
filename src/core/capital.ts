import { getSurvivalProbability } from "./mortalityTables.js";
import { discountFactor } from "./discount.js";

/**
 * Present value of a monthly annuity (payments at end of month).
 * Pure: no mutation, no I/O.
 * PV = sum over t of (monthlyPayment * survival * v^t) for each month.
 */
export function presentValueMonthlyAnnuity(
  monthlyPayment: number,
  startAge: number,
  gender: "male" | "female",
  interestRate: number,
  numberOfYears: number
): number {
  let pv = 0;
  const months = Math.max(0, Math.floor(numberOfYears * 12));
  for (let m = 0; m < months; m++) {
    const yearsFromStart = m / 12;
    const surv = getSurvivalProbability(startAge, gender, yearsFromStart);
    const monthlyV = Math.pow(1 / (1 + interestRate), (m + 1) / 12);
    pv += monthlyPayment * surv * monthlyV;
  }
  return pv;
}

/**
 * Present value at accident date of future pension over passive period.
 * Pension is constant in real terms (no wage increase in passive).
 */
export function presentValuePassivePeriod(
  monthlyPension: number,
  ageAtAccident: number,
  activePeriodYears: number,
  gender: "male" | "female",
  interestRate: number,
  passiveYears: number
): number {
  const startAge = ageAtAccident + activePeriodYears;
  return presentValueMonthlyAnnuity(
    monthlyPension,
    startAge,
    gender,
    interestRate,
    passiveYears
  );
}

/**
 * Present value of pension during active period with wage increase.
 * Each year payment = monthlyPension * 12 * (1 + wageIncrease)^(year index).
 */
export function presentValueActivePeriod(
  monthlyPension: number,
  ageAtAccident: number,
  gender: "male" | "female",
  interestRate: number,
  wageIncreaseRate: number,
  activeYears: number
): number {
  let pv = 0;
  for (let y = 0; y < activeYears; y++) {
    const surv = getSurvivalProbability(ageAtAccident, gender, y);
    const v = discountFactor(interestRate, y);
    const annualPayment = monthlyPension * 12 * Math.pow(1 + wageIncreaseRate, y);
    pv += annualPayment * surv * v;
  }
  return pv;
}
