import type { Trh2010LifeEntry } from "../../data/trh2010.js";
import type { DeathZmtsGarameRow, IncomeMode } from "../types.js";

export type TrafficInjuryPeriodKind =
  | "temporary_incapacity"
  | "processed_permanent"
  | "future_permanent";

export type FuturePeriodPhase = "ACTIVE" | "PASSIVE";

export interface TrafficInjuryPeriodRow {
  startDate: string;
  endDate: string;
  dayCount: number;
  monthlyNetIncome: number;
  dailyNetIncome: number;
  kn?: number;
  discountFactor?: number;
  increasedIncome?: number;
  discountedIncome?: number;
  disabilityRate: number;
  periodDamage: number;
  periodKind: TrafficInjuryPeriodKind;
  /** İşleyecek dönem — yapısal aktif/pasif evre (formül şimdilik aynı) */
  phase?: FuturePeriodPhase;
}

export interface ResolvedIncomeInfo {
  incomeMode: IncomeMode;
  monthlyNetAtEvent: number;
  monthlyNetAtCalculation: number;
  dailyNetAtCalculation: number;
  coefficient: number;
  eventDateMinWage: number | null;
}

export interface LifeExpectancyInfo {
  completedAgeYears: number | null;
  ageAtAccident: { years: number; months: number; days: number } | null;
  decimalLifeExpectancy: number | null;
  lifeExpectancyYmd: Trh2010LifeEntry;
  probableLifeEndDate: string | null;
  passivePhaseStartDate: string | null;
}

export interface LegalInterestSegment {
  startDate: string;
  endDate: string;
  annualRatePercent: number;
  calendarDayCount: number;
  interestAmount: number;
}

export interface InsuranceInterestDeductionRow {
  paymentDate: string;
  calculationDate: string;
  principalAmount: number;
  calendarDayCount: number;
  interestSegments: LegalInterestSegment[];
  interestAmount: number;
  principalPlusInterest: number;
  /** TRAFFIC_DEATH ZMTS satırında ödeme kaydına bağ. Mahsup tutarını değiştirmez. */
  paymentId?: string;
  claimantId?: string;
  claimantName?: string | null;
  claimantRelation?: string | null;
  /** Kişi satırları. Mahsup tutarına eklenmez. */
  deathGarameRows?: DeathZmtsGarameRow[];
}

export interface InsuranceDeductionGroup {
  rows: InsuranceInterestDeductionRow[];
  principalTotal: number;
  interestTotal: number;
  deductionTotal: number;
}

export interface InsuranceDeductions {
  zmts: InsuranceDeductionGroup;
  casco: InsuranceDeductionGroup;
}

/** Garame / sigorta mahsup aşaması için hazır bağlantı alanları */
export interface InsuranceClaimContext {
  /** Kusur ve PSD sonrası nihai tazminat (sigorta öncesi) */
  claimAmountBeforeGarame: number;
  /** Sigorta yasal faiz mahsubu sonrası nihai tazminat */
  claimAmountAfterInsurance: number;
  /** Toplam zarar (kusur öncesi) — garame dağılımı için */
  totalDamageBeforeFault: number;
  /** Kusur sonrası toplam */
  totalAfterFault: number;
  /** PSD sonrası toplam */
  totalAfterPSD: number;
  injuredFaultRate: number;
  /** garameEnabled=true kayıtların faizli mahsup tutarları — garame motoru için */
  garameInterestContext: Array<{
    paymentId: string;
    kind: "zmts" | "casco";
    principalPlusInterest: number;
  }>;
}

export interface TrafficInjuryCalculationResult {
  resolvedIncome: ResolvedIncomeInfo;
  dailyNetIncome: number;
  processedPeriods: TrafficInjuryPeriodRow[];
  temporaryIncapacityPeriods: TrafficInjuryPeriodRow[];
  futurePeriods: TrafficInjuryPeriodRow[];
  temporaryIncapacityTotal: number;
  processedPermanentTotal: number;
  futurePermanentTotal: number;
  totalDamageBeforeFault: number;
  injuredFaultRate: number;
  faultDeductionAmount: number;
  totalAfterFault: number;
  psdTotal: number;
  psdDeductibleAfterFault: number;
  totalAfterPSD: number;
  lifeExpectancy: LifeExpectancyInfo;
  /** Motor tarafından çözümlenen maluliyet oranı (%) */
  permanentDisabilityRate: number;
  probableLifeEndDate: string | null;
  passivePhaseStartDate: string | null;
  finalCompensationBeforeInsurance: number;
  insuranceDeductions: InsuranceDeductions;
  finalCompensationAfterInsurance: number;
  insuranceClaimContext: InsuranceClaimContext;
  /** Dönemler arası boşluk kullanıcı onayıyla kesintisiz kabul edildi */
  temporaryIncapacityGapIgnored?: boolean;
  /** Kesintisiz geçici İG aralığı (ignoreGap=true iken) */
  temporaryIncapacityEffectiveRange?: { startDate: string; endDate: string } | null;
  warnings: string[];
}

export interface FuturePeriodSegment {
  startDate: string;
  endDate: string;
  /** Takvim yılına göre KN dönemi (1-tabanlı) — KN = 1,10 ^ periodIndex */
  periodIndex: number;
  phase: FuturePeriodPhase;
}
