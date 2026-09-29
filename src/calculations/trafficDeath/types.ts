/** TRAFFIC_DEATH parasal destekten yoksun kalma sonucu — injury result modelinden ayrı */

export interface TrafficDeathResolvedIncome {
  incomeMode: string;
  monthlyNetAtEvent: number;
  monthlyNetAtCalculation: number;
  dailyNetAtCalculation: number;
  coefficient: number;
  eventDateMinWage: number | null;
}

export interface TrafficDeathProcessedClaimantRow {
  startDate: string;
  endDate: string;
  dayCount: number;
  monthlyNetIncome: number;
  dailyNetIncome: number;
  periodIncome: number;
  claimantId: string;
  claimantName: string;
  claimantStatus: "PLAINTIFF" | "OUT_OF_CASE" | "SYNTHETIC" | null;
  relationLabel: string;
  shareFraction: string;
  sharePercentage: number;
  supportRate: number;
  periodDamage: number;
  periodKind: "processed_support";
}

export interface TrafficDeathFutureClaimantRow {
  startDate: string;
  endDate: string;
  dayCount: number;
  monthlyNetIncome: number;
  dailyNetIncome: number;
  kn: number;
  discountFactor: number;
  increasedIncome: number;
  discountedIncome: number;
  claimantId: string;
  claimantName: string;
  claimantStatus: "PLAINTIFF" | "OUT_OF_CASE" | "SYNTHETIC" | null;
  relationLabel: string;
  shareFraction: string;
  sharePercentage: number;
  periodDamage: number;
  periodKind: "future_support";
  periodIndex: number;
}

export interface TrafficDeathClaimantLoss {
  claimantId: string;
  claimantName: string;
  relationLabel: string;
  claimantStatus: "PLAINTIFF" | "OUT_OF_CASE" | "SYNTHETIC" | null;
  processedLoss: number;
  futureLoss: number;
  totalLoss: number;
  /** Bu satıra uygulanan müteveffa kusur oranı. Eski kayıtlarda yoktur. */
  deceasedFaultRate?: number;
  /** totalLoss üzerine kusur bir kez uygulandıktan sonra kalan zarar. */
  lossAfterDeceasedFault?: number;
  /** Yalnız eş satırında kusur sonrası tutara uygulanan nihai evlenme ihtimali oranı. */
  marriageProbabilityRate?: number;
  marriageProbabilityApplied?: boolean;
  /** Evlenme ihtimali indirimi sonrası kalan zarar. Eş dışında kusur sonrası tutarla aynıdır. */
  lossAfterMarriageProbability?: number;
  /** ZMTS ana para + ödeme tarihinden hesap tarihine yasal faiz. */
  updatedZmtsPaymentAmount?: number;
  /** Kasko ana para + ödeme tarihinden hesap tarihine yasal faiz. */
  updatedCascoPaymentAmount?: number;
  /** Evlenme sonrası zarardan ZMTS ve Kasko güncel ödemeleri düşüldükten sonra kalan. 0'ın altına inmez. */
  lossAfterInsurancePayments?: number;
  zmtsPaymentDetails?: ClaimantUpdatedPaymentDetail[];
  cascoPaymentDetails?: ClaimantUpdatedPaymentDetail[];
}

export interface ClaimantPaymentInterestSegment {
  startDate: string;
  endDate: string;
  annualRatePercent: number;
  calendarDayCount: number;
  interestAmount: number;
}

export interface ClaimantUpdatedPaymentDetail {
  principal: number;
  paymentDate: string;
  calculationDate: string;
  legalInterestAmount: number;
  updatedAmount: number;
  interestSegments?: ClaimantPaymentInterestSegment[];
}

export interface TrafficDeathExpenseTotals {
  preDeathTreatment: number;
  funeralCost: number;
  transportCost: number;
  otherExpenses: number;
  total: number;
}

export interface TrafficDeathCalculationResult {
  calculationType: "TRAFFIC_DEATH";
  resolvedIncome: TrafficDeathResolvedIncome;
  dailyNetIncome: number;
  personLives: unknown[];
  shareRatioPeriods: Array<{
    startDate: string;
    endDate: string;
    label?: string;
    periodType?: "PAST" | "FUTURE";
    shares: Record<string, string>;
    percentages: Record<string, string>;
  }>;
  columnKeys: Array<{ key: string; header: string; subLabel?: string; synthetic?: boolean }>;
  supportPeriods: unknown[];
  processedPeriods: TrafficDeathProcessedClaimantRow[];
  futurePeriods: TrafficDeathFutureClaimantRow[];
  claimantLosses: TrafficDeathClaimantLoss[];
  processedTotal: number;
  futureTotal: number;
  totalSupportLoss: number;
  deceasedFaultRate: number;
  faultDeductionAmount: number;
  totalAfterFault: number;
  /** Hak sahibi bazlı evlenme sütununun toplamı. Eski kayıtlarda yoktur. */
  totalAfterMarriageProbability?: number;
  /** Görünen hak sahiplerinin ZMTS güncel ödeme toplamı. */
  updatedZmtsPaymentTotal?: number;
  /** Görünen hak sahiplerinin Kasko güncel ödeme toplamı. */
  updatedCascoPaymentTotal?: number;
  /** Hak sahibi bazlı sigorta/kasko mahsubu sonrası destek zararı toplamı. */
  totalAfterClaimantInsurance?: number;
  marriageProbability?: import("./marriageProbability.js").MarriageProbabilityResolution;
  deathExpenses: TrafficDeathExpenseTotals;
  priorPaymentsTotal: number;
  priorPaymentsApplied: boolean;
  /** Yeni kart yolu. Eski kayıtlarda yoktur; yoksa priorPayments mahsubu geçerlidir. */
  psdTotal?: number;
  psdDeductibleAfterFault?: number;
  /** Peşin sermaye sonrası destek zararı (giderler eklenmeden önce). */
  totalAfterCapitalValue?: number;
  insuranceDeductions?: {
    zmts: import("../trafficInjury/types.js").InsuranceDeductionGroup;
    casco: import("../trafficInjury/types.js").InsuranceDeductionGroup;
  };
  finalCompensation: number;
  warnings: string[];
}
