import type { ActuarialInput, Gender } from "./types.js";

const VALID_GENDERS: readonly Gender[] = ["male", "female"] as const;

function isValidDateString(s: string): boolean {
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s.slice(0, 10));
}

function isNonNegativeNumber(n: unknown): n is number {
  return typeof n === "number" && !Number.isNaN(n) && n >= 0;
}

function isInRange(n: number, min: number, max: number): boolean {
  return n >= min && n <= max;
}

export function validateActuarialInput(input: unknown): { valid: true; data: ActuarialInput } | { valid: false; errors: string[] } {
  const errors: string[] = [];

  if (input === null || typeof input !== "object") {
    return { valid: false, errors: ["Input must be an object"] };
  }

  const o = input as Record<string, unknown>;

  if (typeof o.birthDate !== "string" || !isValidDateString(o.birthDate)) {
    errors.push("birthDate must be a valid ISO date string (YYYY-MM-DD)");
  }
  if (typeof o.accidentDate !== "string" || !isValidDateString(o.accidentDate)) {
    errors.push("accidentDate must be a valid ISO date string (YYYY-MM-DD)");
  }
  if (!VALID_GENDERS.includes(o.gender as Gender)) {
    errors.push("gender must be 'male' or 'female'");
  }
  if (!isNonNegativeNumber(o.monthlyIncome)) {
    errors.push("monthlyIncome must be a non-negative number");
  }
  if (!isNonNegativeNumber(o.disabilityRate) || !isInRange(o.disabilityRate, 0, 100)) {
    errors.push("disabilityRate must be a number between 0 and 100");
  }
  if (!isNonNegativeNumber(o.interestRate)) {
    errors.push("interestRate must be a non-negative number");
  }
  if (!isNonNegativeNumber(o.wageIncreaseRate)) {
    errors.push("wageIncreaseRate must be a non-negative number");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const birthDate = o.birthDate as string;
  const accidentDate = o.accidentDate as string;
  if (new Date(accidentDate).getTime() < new Date(birthDate).getTime()) {
    errors.push("accidentDate must be on or after birthDate");
  }
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      birthDate,
      accidentDate,
      gender: o.gender as Gender,
      monthlyIncome: o.monthlyIncome as number,
      disabilityRate: o.disabilityRate as number,
      interestRate: o.interestRate as number,
      wageIncreaseRate: o.wageIncreaseRate as number,
    },
  };
}
