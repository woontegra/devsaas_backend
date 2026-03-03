export type Gender = "male" | "female";

export interface ActuarialInput {
  birthDate: string; // ISO date YYYY-MM-DD
  accidentDate: string; // ISO date YYYY-MM-DD
  gender: Gender;
  monthlyIncome: number;
  disabilityRate: number; // 0-100
  interestRate: number; // annual e.g. 0.05 for 5%
  wageIncreaseRate: number; // annual e.g. 0.03 for 3%
}

export interface ActuarialResult {
  ageAtAccident: number;
  activePeriodYears: number;
  passivePeriodYears: number;
  monthlyPension: number;
  discountFactor: number;
  presentCapitalValue: number;
  breakdown: {
    activePeriodPV: number;
    passivePeriodPV: number;
  };
  metadata: {
    interestRate: number;
    wageIncreaseRate: number;
    disabilityRate: number;
    calculatedAt: string; // ISO
  };
}
