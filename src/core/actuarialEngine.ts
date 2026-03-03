import type { ActuarialInput, ActuarialResult } from "./types.js";
import { presentValueActivePeriod } from "./capital.js";
import { presentValuePassivePeriod } from "./capital.js";
import { discountFactor } from "./discount.js";

const RETIREMENT_AGE = 65;
const MAX_AGE = 100;

function ageFromDates(birthDateStr: string, eventDateStr: string): number {
  const birth = new Date(birthDateStr);
  const event = new Date(eventDateStr);
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  return (event.getTime() - birth.getTime()) / msPerYear;
}

function calculateActivePeriodYears(ageAtAccident: number): number {
  if (ageAtAccident >= RETIREMENT_AGE) return 0;
  return RETIREMENT_AGE - ageAtAccident;
}

function calculatePassivePeriodYears(ageAtAccident: number, activeYears: number): number {
  const retirementAge = ageAtAccident + activeYears;
  if (retirementAge >= MAX_AGE) return 0;
  return MAX_AGE - retirementAge;
}

/**
 * Pure actuarial calculation. No mutation, no I/O, no external dependency.
 */
export function calculateActuarial(input: ActuarialInput): ActuarialResult {
  const ageAtAccident = ageFromDates(input.birthDate, input.accidentDate);
  const activePeriodYears = calculateActivePeriodYears(ageAtAccident);
  const passivePeriodYears = calculatePassivePeriodYears(ageAtAccident, activePeriodYears);

  const monthlyPension = input.monthlyIncome * (input.disabilityRate / 100);

  const activePV = presentValueActivePeriod(
    monthlyPension,
    ageAtAccident,
    input.gender,
    input.interestRate,
    input.wageIncreaseRate,
    activePeriodYears
  );

  const passivePV = presentValuePassivePeriod(
    monthlyPension,
    ageAtAccident,
    activePeriodYears,
    input.gender,
    input.interestRate,
    passivePeriodYears
  );

  const presentCapitalValue = activePV + passivePV;

  const effectiveYears = activePeriodYears + passivePeriodYears;
  const discountFactorValue = effectiveYears > 0
    ? discountFactor(input.interestRate, effectiveYears / 2)
    : 1;

  return {
    ageAtAccident: Math.floor(ageAtAccident * 100) / 100,
    activePeriodYears,
    passivePeriodYears,
    monthlyPension: Math.round(monthlyPension * 100) / 100,
    discountFactor: Math.round(discountFactorValue * 1e6) / 1e6,
    presentCapitalValue: Math.round(presentCapitalValue * 100) / 100,
    breakdown: {
      activePeriodPV: Math.round(activePV * 100) / 100,
      passivePeriodPV: Math.round(passivePV * 100) / 100,
    },
    metadata: {
      interestRate: input.interestRate,
      wageIncreaseRate: input.wageIncreaseRate,
      disabilityRate: input.disabilityRate,
      calculatedAt: new Date().toISOString(),
    },
  };
}
