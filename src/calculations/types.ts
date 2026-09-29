/**
 * Discriminated CalculationDraft — schemaVersion 2
 * Yalnızca veri girişi / doğrulama; aktüeryal hesap yok.
 */

export const CALCULATION_SCHEMA_VERSION = 2 as const;

export type CalculationType =
  | "TRAFFIC_INJURY"
  | "TRAFFIC_DEATH"
  | "WORK_INJURY"
  | "WORK_DEATH";

export type Gender = "male" | "female";
export type IncomeAmountKind = "gross" | "net";
export type IncomeSourceType =
  | "min_wage"
  | "payroll"
  | "comparable"
  | "chamber"
  | "witness"
  | "other"
  | "sgk"
  | "wage";

export type RelationType =
  | "spouse"
  | "child"
  | "mother"
  | "father"
  | "sibling"
  | "other";

export type LiablePartyType =
  | "plaintiff"
  | "defendant"
  | "employer"
  | "subcontractor"
  | "third_party"
  | "other";

export interface CommonCaseInfo {
  internalFileName?: string;
  courtName?: string;
  caseNumber?: string;
  eventDate: string;
  calculationDate: string;
  eventDescription?: string;
  /** Trafik hesapları */
  insuranceCompany?: string;
  policyNumber?: string;
  coverageNotes?: string;
  /** İş kazası hesapları */
  eventLocation?: string;
  workplaceName?: string;
  workplaceRegistryNo?: string;
  accidentNotificationDate?: string;
  fileNote?: string;
}

export interface IncomePeriod {
  id: string;
  startDate: string;
  endDate?: string;
  amount: number;
  amountKind: IncomeAmountKind;
  sourceType: IncomeSourceType;
  documentSource?: string;
  label?: string;
}

export interface LiableParty {
  id: string;
  partyType: LiablePartyType;
  name: string;
  faultRatio: number;
}

export interface LiabilityBlock {
  /** Zarar gören / işçi kusuru */
  injuredFaultRatio: number;
  parties: LiableParty[];
  /** Trafik: dava dışı kusur (hesap indirimine dahil edilmez) */
  externalFaultRatio?: number;
  /** İş kazası: kaçınılmazlık oranı (0–100) */
  inevitabilityRatio?: number;
}

export interface PersonBase {
  fullName?: string;
  birthDate: string;
  gender: Gender;
  occupation?: string;
  employmentStatus?: string;
  retirementStatus?: string;
  insuranceStatus?: string;
  notes?: string;
}

export interface InjuredPerson extends PersonBase {
  workStatus?: string;
}

export type PlaintiffGender = "FEMALE" | "MALE" | "";

export type DefendantType =
  | "INDIVIDUAL_DRIVER"
  | "INDIVIDUAL_VEHICLE_OWNER"
  | "CORPORATE_VEHICLE_OWNER"
  | "COMPULSORY_TRAFFIC_INSURER"
  | "CASCO_INSURER";

export interface PlaintiffInfo {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: PlaintiffGender;
}

export interface DefendantParty {
  id: string;
  type: DefendantType;
  firstName?: string;
  lastName?: string;
  organizationName?: string;
}

export type TrafficDeathResponsibleType =
  | "INDIVIDUAL_DRIVER"
  | "INDIVIDUAL_VEHICLE_OWNER"
  | "CORPORATE_VEHICLE_OWNER";

export interface TrafficDeathResponsibleParty {
  id: string;
  type: TrafficDeathResponsibleType;
  faultRatio: number;
}

export interface TrafficInjuryParties {
  plaintiff: PlaintiffInfo;
  defendants: DefendantParty[];
}

export interface DeceasedPerson extends PersonBase {
  deathDate: string;
  maritalStatus?: string;
}

export interface EmployeePerson extends PersonBase {
  jobAtEvent?: string;
}

export interface DeceasedEmployee extends PersonBase {
  deathDate: string;
  jobAtEvent?: string;
}

export interface EmploymentInfo {
  employerName?: string;
  subEmployerName?: string;
  hireDate?: string;
  leaveDate?: string;
  jobAtEvent?: string;
  insuranceStatus?: string;
}

export interface DisabilityBlock {
  permanentDisabilityRate?: number;
  disabilityStartDate?: string;
  reportDate?: string;
  reportBasis?: string;
  earningCapacityLoss?: boolean;
  notes?: string;
  caregiverNeeded?: boolean;
}

export interface TemporaryIncapacityPeriod {
  id: string;
  startDate: string;
  endDate: string;
  dayCount?: number;
  rate?: number;
  notes?: string;
}

export type AverageIncomeKind = "min_wage" | "tuik" | "union" | "witness" | "other";

export interface AverageIncomeSource {
  id: string;
  kind: AverageIncomeKind;
  label?: string;
  amountKind: IncomeAmountKind;
  amount: number;
  netAmount?: number;
}

export type IncomeMode = "minWage" | "fixed" | "average";

export interface AccidentIncomeBlock {
  incomeMode: IncomeMode;
  fixedAmount: number | null;
  useAverage?: boolean;
  averageSources: AverageIncomeSource[];
  averageNetResult?: number;
}

export interface CaregiverExpenseRow {
  id: string;
  startDate: string;
  endDate: string;
  amount: number;
}

export interface ExpenseItem {
  id: string;
  name: string;
  category?: string;
  date?: string;
  startDate?: string;
  endDate?: string;
  amount: number;
  monthlyAmount?: number;
  notes?: string;
}

export interface PriorPayment {
  id: string;
  payer?: string;
  paymentType?: string;
  date?: string;
  amount: number;
  notes?: string;
}

export interface InsuranceInfo {
  company?: string;
  policyNumber?: string;
  coverageNotes?: string;
}

export type BeneficiaryClaimantStatus = "PLAINTIFF" | "OUT_OF_CASE";

export interface Beneficiary {
  id: string;
  fullName: string;
  relation: RelationType;
  birthDate: string;
  gender: Gender;
  claimantStatus?: BeneficiaryClaimantStatus;
  educationStatus?: string;
  workStatus?: string;
  dependencyStatus?: string;
  claimsSupport?: boolean;
  remarried?: boolean;
  remarriageDate?: string | null;
  notes?: string;
}

export interface SupportRelation {
  id: string;
  beneficiaryId: string;
  startDate?: string;
  endDate?: string;
  actualSupport?: boolean;
  supportShareInput?: number;
  educationOngoing?: boolean;
  remarriageAssessment?: string;
  specialNotes?: string;
}

export interface DeathExpenseBlock {
  preDeathTreatment?: number;
  preDeathIncomeLossNotes?: string;
  funeralCost?: number;
  transportCost?: number;
  otherExpenses: ExpenseItem[];
}

export interface SgkIncomeRecord {
  id: string;
  incomeKind?: string;
  startDate?: string;
  monthlyAmount?: number;
  paidPeriodNotes?: string;
  recourseNotes?: string;
  documentNotes?: string;
}

export interface SgkDeathIncomeRecord {
  id: string;
  beneficiaryId?: string;
  incomeKind?: string;
  startDate?: string;
  monthlyAmount?: number;
  bindingRatio?: number;
  documentDate?: string;
  documentNotes?: string;
}

export interface CapitalValueDocument {
  id: string;
  personLabel?: string;
  beneficiaryId?: string;
  amount?: number;
  documentDate?: string;
  documentNumber?: string;
  recourseIndicated?: boolean;
  notes?: string;
}

/** Garame satırının bağlandığı dosya içi kişi kaydı */
export type InsuranceGarameSubjectRef = "plaintiff";

/**
 * Garame dağılımı — tek yaralı/hak sahibi satırı.
 * Kullanıcı: subjectRef veya externalPersonLabel.
 * Motor çıktıları: claimAmount … payableAfterPersonLimit.
 */
/**
 * TRAFFIC_DEATH ZMTS garame satırı. Hak sahibi claimantId ile bağlanır.
 * Dağıtım formülü bu satırlardan türetilmez; mevcut mahsup tutarını değiştirmez.
 */
export interface DeathZmtsGarameRow {
  claimantId: string;
  claimantName?: string;
  claimantStatus?: "PLAINTIFF" | "OUT_OF_CASE";
  claimantRelation?: string;
  paymentDate?: string;
  paymentAmount?: number;
  /** Kişi başı limit. Mevcut ZMTS alan adıyla aynıdır. */
  liabilityLimit?: number;
  /** Kaza başı limit. Mevcut ZMTS alan adıyla aynıdır. */
  accidentLimit?: number;
}

export interface InsuranceGarameEntry {
  id: string;
  subjectRef?: InsuranceGarameSubjectRef;
  /** Dosya dışı kaza mağduru tanımı — yalnızca subjectRef yokken */
  externalPersonLabel?: string;
  claimAmount?: number;
  garameBasisAmount?: number;
  garameRatio?: number;
  accidentLimitShare?: number;
  payableAfterPersonLimit?: number;
}

export interface InsurancePaymentRecord {
  id: string;
  paymentDate: string;
  paymentAmount: number;
  /** Kişi başı limit (TL) */
  liabilityLimit: number;
  /** Kaza başı limit (TL) */
  accidentLimit?: number;
  /** parties.defendants[].id — ilgili sigorta davalısına referans */
  defendantId?: string;
  /** Garame dağılım satırları */
  garameEntries?: InsuranceGarameEntry[];
  /** Garame hesabı bu ödeme kaydı için uygulanacak mı (varsayılan: kapalı) */
  garameEnabled?: boolean;
  /**
   * TRAFFIC_DEATH ZMTS: ödemenin yapıldığı davacı.
   * Eski kayıtlarda yoktur; yoksa rastgele kişiye bağlanmaz.
   */
  claimantId?: string;
  claimantName?: string;
  claimantRelation?: string;
  /** Garame açıkken kişi satırları. Kapalıyken normal ödeme alanları geçerlidir. */
  deathGarameRows?: DeathZmtsGarameRow[];
}

export interface CareExpensesBlock {
  temporaryCaregiver?: boolean;
  permanentCaregiver?: boolean;
  careStartDate?: string;
  careEndDate?: string;
  monthlyCareCost?: number;
  treatmentCost?: number;
  hospitalCost?: number;
  prosthesisCost?: number;
  otherExpenses: ExpenseItem[];
}

/** Ortak üst alanlar */
interface DraftBase {
  schemaVersion: typeof CALCULATION_SCHEMA_VERSION | number;
  common: CommonCaseInfo;
}

export interface TrafficInjuryDraft extends DraftBase {
  calculationType: "TRAFFIC_INJURY";
  parties: TrafficInjuryParties;
  liability: LiabilityBlock;
  disability: DisabilityBlock;
  temporaryIncapacityPeriods: TemporaryIncapacityPeriod[];
  /** Dönemler arası boşlukları kesintisiz geçici İG olarak hesapla */
  temporaryIncapacityIgnoreGaps?: boolean;
  accidentIncome: AccidentIncomeBlock;
  hospitalExpenses: ExpenseItem[];
  travelExpenses: ExpenseItem[];
  caregiverExpenses: CaregiverExpenseRow[];
  passivePhaseAge?: number;
  /** İşlemiş dönem başlangıcı (varsayılan: common.eventDate) */
  processedPeriodStartDate?: string;
  /** İşlemiş dönem bitişi (varsayılan: common.calculationDate) */
  processedPeriodEndDate?: string;
  capitalValueDocuments: CapitalValueDocument[];
  /**
   * Sosyal yardım ödeneği belgeleri. Peşin sermaye kayıtlarından bağımsızdır.
   * Hesap motoruna dahil değildir; eski kayıtlarda yoktur.
   */
  sosyalYardimOdenekleri?: CapitalValueDocument[];
  zmtsPayments: InsurancePaymentRecord[];
  cascoPayments: InsurancePaymentRecord[];
}

export type DeceasedEmploymentStatus = "WORKING" | "NOT_WORKING" | null;

export type DeceasedMaritalStatus = "MARRIED" | "SINGLE" | "DIVORCED";

export type DeceasedMilitaryStatus = "COMPLETED" | "NOT_COMPLETED";

export type DeceasedChildEducationLevel =
  | "preschool"
  | "primary"
  | "middle"
  | "high"
  | "university"
  | "postgraduate"
  | "graduate"
  | "not_in_education"
  | "other";

export interface DeceasedChildRecord {
  id: string;
  gender: Gender;
  educationLevel: DeceasedChildEducationLevel | null;
  educationOther?: string;
}

export interface DeceasedFamilyInfo {
  maritalStatus: DeceasedMaritalStatus | null;
  militaryStatus: DeceasedMilitaryStatus | null;
  militaryServiceStartDate?: string | null;
  militaryServiceDurationMonths?: 6 | 12 | null;
  educationStatus?: DeceasedChildEducationLevel | null;
  educationOtherDescription?: string;
  hasChildren: boolean | null;
  childrenCount: number;
  children: DeceasedChildRecord[];
}

/** Kullanıcı girdisi. Oran ve tutar motor tarafından türetilir. */
export interface MarriageProbabilityDeductionState {
  under18ChildCount: number;
  note?: string;
}

/** Eğitim gideri indirimi henüz parasal hesaba girmez. Not kaydı tutulur. */
export interface EducationExpenseDeductionState {
  notes: string;
}

export interface TrafficDeathDraft extends DraftBase {
  calculationType: "TRAFFIC_DEATH";
  employmentStatus: DeceasedEmploymentStatus;
  deceased: DeceasedPerson;
  deceasedFamilyInfo?: DeceasedFamilyInfo;
  accidentIncome: AccidentIncomeBlock;
  nonWorkingSelectedIncome: number | null;
  incomePeriods: IncomePeriod[];
  beneficiaries: Beneficiary[];
  supportRelations: SupportRelation[];
  liability: LiabilityBlock;
  deceasedFaultRate?: number;
  responsibleParties?: TrafficDeathResponsibleParty[];
  externalFaultRate?: number;
  /** @deprecated */
  claimantFaultRates?: Record<string, number>;
  deathExpenses: DeathExpenseBlock;
  priorPayments: PriorPayment[];
  insurance: InsuranceInfo;
  /**
   * Sosyal yardım ödeneği. Yaralanma ile aynı kayıt yapısıdır.
   * Hesap motoruna dahil değildir; eski kayıtlarda yoktur.
   */
  sosyalYardimOdenekleri?: CapitalValueDocument[];
  /** Peşin sermaye değeri. Eski kayıtlarda yoktur; yoksa önceki ödeme mahsubu korunur. */
  capitalValueDocuments?: CapitalValueDocument[];
  /** ZMTS ödemeleri. Eski kayıtlarda yoktur. */
  zmtsPayments?: InsurancePaymentRecord[];
  /** Kasko ödemeleri. Eski kayıtlarda yoktur. */
  cascoPayments?: InsurancePaymentRecord[];
  marriageProbabilityDeduction?: MarriageProbabilityDeductionState;
  educationExpenseDeduction?: EducationExpenseDeductionState;
}

export interface WorkInjuryDraft extends DraftBase {
  calculationType: "WORK_INJURY";
  employee: EmployeePerson;
  employment: EmploymentInfo;
  incomePeriods: IncomePeriod[];
  liability: LiabilityBlock;
  disability: DisabilityBlock;
  temporaryIncapacityPeriods: TemporaryIncapacityPeriod[];
  sgkIncome: SgkIncomeRecord[];
  capitalValueDocuments: CapitalValueDocument[];
  careAndExpenses: CareExpensesBlock;
  priorPayments: PriorPayment[];
}

export interface WorkDeathDraft extends DraftBase {
  calculationType: "WORK_DEATH";
  deceasedEmployee: DeceasedEmployee;
  employment: EmploymentInfo;
  incomePeriods: IncomePeriod[];
  beneficiaries: Beneficiary[];
  supportRelations: SupportRelation[];
  liability: LiabilityBlock;
  sgkDeathIncomes: SgkDeathIncomeRecord[];
  capitalValueDocuments: CapitalValueDocument[];
  expenses: ExpenseItem[];
  priorPayments: PriorPayment[];
}

export type CalculationDraft =
  | TrafficInjuryDraft
  | TrafficDeathDraft
  | WorkInjuryDraft
  | WorkDeathDraft;

/** Geriye uyumluluk alias */
export type CalculationDraftInput = CalculationDraft;

export type DraftSection = string;

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
}

export interface CalculationValidateResponse {
  valid: boolean;
  schemaVersion: number;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  completedSections: DraftSection[];
  missingSections: DraftSection[];
  message: string;
}
