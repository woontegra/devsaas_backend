import type { PersonLifeProfile } from "./personLifeTypes.js";

/** Destek payı aktör türleri */
export type SupportFactorKind =
  | "DECEASED"
  | "REAL_SPOUSE"
  | "REAL_CHILD"
  | "REAL_MOTHER"
  | "REAL_FATHER"
  | "PROBABLE_SPOUSE"
  | "PROBABLE_CHILD";

export interface SupportFactor {
  key: string;
  kind: SupportFactorKind;
  label: string;
  units: number;
  beneficiaryId?: string;
}

export type TimelineEventKind =
  | "DEATH"
  | "REARING_START"
  | "REARING_END"
  | "MILITARY_START"
  | "MILITARY_END"
  | "PROBABLE_MARRIAGE"
  | "PROBABLE_CHILD_BIRTH"
  | "PROBABLE_CHILD_EXIT"
  | "CHILD_SUPPORT_END"
  | "SPOUSE_SUPPORT_END"
  | "MOTHER_SUPPORT_END"
  | "FATHER_SUPPORT_END"
  | "DECEASED_PROBABLE_LIFE_END";

export interface TimelineEvent {
  date: string;
  kind: TimelineEventKind;
  factorKey?: string;
  label?: string;
}

export interface ShareEntry {
  baseUnits: number;
  transferredUnits: number;
  display: string;
  /** Pay Dağılımı tablosu — "2/6", "(1+1)/7" */
  fraction: string;
  rate: number;
  percentage: number;
}

export interface SupportPeriod {
  startDate: string;
  endDate: string;
  label?: string;
  /** İşlemiş (hesap tarihine kadar) / işleyecek (hesap tarihinden sonra) */
  periodType?: "PAST" | "FUTURE";
  supportActive: boolean;
  activeFactors: SupportFactor[];
  shares: Record<string, ShareEntry>;
}

export interface SupportPeriodMotorResult {
  periods: SupportPeriod[];
  shareRatioPeriods: Array<{
    startDate: string;
    endDate: string;
    label?: string;
    periodType?: "PAST" | "FUTURE";
    shares: Record<string, string>;
    percentages: Record<string, string>;
  }>;
  columnKeys: Array<{ key: string; header: string; subLabel?: string; synthetic?: boolean }>;
  personLives: PersonLifeProfile[];
  warnings: string[];
  errors: string[];
}

export interface ParsedSupportContext {
  deathDate: string;
  calculationDate: string;
  deceasedBirthDate: string;
  deceasedGender: "male" | "female";
  deceasedEducation: string | null;
  deceasedProbableLifeEndDate: string | null;
  hasRealChildren: boolean;
  hasRealSpouse: boolean;
  generateProbableFamily: boolean;
  militaryStartDate: string | null;
  militaryDurationMonths: 6 | 12 | null;
  rearingEndAge: number | null;
  isChildAtDeath: boolean;
  realSpouse: {
    beneficiaryId: string;
    remarried: boolean;
    remarriageDate: string | null;
    probableLifeEndDate: string | null;
    effectiveSupportEndDate: string | null;
  } | null;
  realChildren: Array<{
    key: string;
    beneficiaryId: string;
    birthDate: string;
    gender: "male" | "female";
    supportEndDate: string | null;
    effectiveSupportEndDate: string | null;
    supportActiveAtDeath: boolean;
  }>;
  realMother: {
    key: string;
    beneficiaryId: string;
    birthDate: string;
    probableLifeEndDate: string;
    supportEndDate: string;
  } | null;
  realFather: {
    key: string;
    beneficiaryId: string;
    birthDate: string;
    probableLifeEndDate: string;
    supportEndDate: string;
  } | null;
  personLives: PersonLifeProfile[];
}
