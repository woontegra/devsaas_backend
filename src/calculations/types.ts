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

export interface AccidentIncomeBlock {
  fixedAmount: number | null;
  useAverage: boolean;
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

export interface Beneficiary {
  id: string;
  fullName: string;
  relation: RelationType;
  birthDate: string;
  gender: Gender;
  educationStatus?: string;
  workStatus?: string;
  dependencyStatus?: string;
  claimsSupport?: boolean;
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
  accidentIncome: AccidentIncomeBlock;
  hospitalExpenses: ExpenseItem[];
  travelExpenses: ExpenseItem[];
  caregiverExpenses: CaregiverExpenseRow[];
  passivePhaseAge?: number;
}

export interface TrafficDeathDraft extends DraftBase {
  calculationType: "TRAFFIC_DEATH";
  deceased: DeceasedPerson;
  incomePeriods: IncomePeriod[];
  beneficiaries: Beneficiary[];
  supportRelations: SupportRelation[];
  liability: LiabilityBlock;
  deathExpenses: DeathExpenseBlock;
  priorPayments: PriorPayment[];
  insurance: InsuranceInfo;
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
