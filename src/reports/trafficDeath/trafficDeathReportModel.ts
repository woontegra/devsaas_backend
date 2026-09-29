/**
 * TRAFFIC_DEATH rapor modeli.
 * Yalnızca hesap motorunun ürettiği sonucu ve girdideki kimlik alanlarını biçimler.
 * Pay, faiz, kusur, evlenme oranı ve tazminat burada yeniden hesaplanmaz.
 */
import type { PersonLifeProfile } from "../../calculations/trafficDeath/supportPeriods/personLifeTypes.js";
import type {
  TrafficDeathCalculationResult,
  TrafficDeathFutureClaimantRow,
  TrafficDeathProcessedClaimantRow,
} from "../../calculations/trafficDeath/types.js";
import { MARRIAGE_CHILD_RATE_POINTS } from "../../calculations/trafficDeath/marriageProbability.js";
import type { TrafficDeathDraft } from "../../calculations/types.js";
import {
  formatDateIso,
  formatKn8,
  formatMoney,
  formatPercent,
  formatTrhYmd,
} from "../trafficInjury/reportFormat.js";

const LIFE_TABLE_LABEL = "TRH 2010";

const SHARE_INTRO =
  "Yargıtay 17. Hukuk Dairesinin yerleşik içtihatları doğrultusunda, desteğin vefatından sonra geride kalan eş, anne, baba ve çocuklar yönünden destek payları hesaplanmaktadır. Bu yöntemde desteğin gelirinden 2 payın kendisine, 2 payın sağ kalan eşe, anne, baba ve çocukların her birine ise 1’er pay ayrılması esas alınmaktadır. Destek görenlerden birinin destek süresinin sona ermesi halinde pay dağılımı yeniden yapılmakta ve sonraki dönem için yeni destek oranları belirlenmektedir.";

const ROLE_LABEL: Record<string, string> = {
  DECEASED: "Müteveffa",
  SPOUSE: "Eş",
  MOTHER: "Anne",
  FATHER: "Baba",
  CHILD: "Çocuk",
  OTHER_ADULT: "Diğer",
};

const RELATION_LABEL: Record<string, string> = {
  spouse: "Eş",
  mother: "Anne",
  father: "Baba",
  child: "Çocuk",
  sibling: "Kardeş",
  other: "Diğer",
};

const INCOME_MODE_LABELS: Record<string, string> = {
  minWage: "Net asgari ücret",
  fixed: "Sabit net gelir",
  average: "Ortalama net gelir",
};

const EDUCATION_LABELS: Record<string, string> = {
  preschool: "Okul öncesi",
  primary: "İlkokul",
  middle: "Ortaokul",
  high: "Lise",
  university: "Üniversite",
  postgraduate: "Lisansüstü",
  graduate: "Mezun",
  not_in_education: "Öğrenim görmüyor",
  other: "Diğer (özel bakıma muhtaç)",
};

const MARITAL_LABELS: Record<string, string> = {
  MARRIED: "Evli",
  SINGLE: "Bekar",
  DIVORCED: "Dul",
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  WORKING: "Çalışıyor",
  NOT_WORKING: "Çalışmıyor",
};

const FAULT_TYPE_LABELS: Record<string, string> = {
  INDIVIDUAL_DRIVER: "Gerçek Kişi Şoför",
  INDIVIDUAL_VEHICLE_OWNER: "Gerçek Kişi Araç Sahibi",
  CORPORATE_VEHICLE_OWNER: "Tüzel Kişi Araç Sahibi",
};

export interface ReportGrid {
  columns: string[];
  rows: string[][];
  /** Toplam satırları; tablonun sonunda kalın yazılır. */
  footer?: string[][];
}

export interface PeriodTables {
  income: ReportGrid;
  distribution: ReportGrid;
}

export interface InsuranceSegmentLine {
  start: string;
  end: string;
  days: string;
  rate: string;
  interest: string;
  formula: string;
}

export interface InsurancePaymentBlock {
  title: string;
  claimant: string;
  kind: string;
  principal: string;
  paymentDate: string;
  calculationDate: string;
  segments: InsuranceSegmentLine[];
  totalInterest: string;
  principalLine: string;
  updatedLine: string;
}

export interface MarriageReport {
  applied: boolean;
  message: string | null;
  /** Her uygulanabilir hak sahibi için bir satır. */
  main: ReportGrid | null;
  summary: ReportGrid | null;
  /** Özet tablosunun altındaki tek satırlık matematiksel ifade, satır başına bir tane. */
  formulas: string[];
}

export interface TrafficDeathReportModel {
  titleLines: string[];
  metaRows: Array<[string, string]>;
  summary: string;
  deceasedRows: Array<[string, string]>;
  incomeRows: Array<[string, string]>;
  incomeNote: string;
  faultRows: Array<[string, string]>;
  claimantLives: ReportGrid;
  claimantSupport: ReportGrid;
  shareIntro: string;
  shareDistribution: ReportGrid;
  sharePercentages: ReportGrid;
  processed: PeriodTables | null;
  processedEmpty: string | null;
  future: PeriodTables | null;
  futureEmpty: string | null;
  marriage: MarriageReport;
  insurance: InsurancePaymentBlock[];
  insuranceEmpty: string | null;
  lossCalculation: ReportGrid;
  lossInsurance: ReportGrid;
  otherItems: Array<[string, string]> | null;
  /** Diğer kalem yoksa bölüm numarası atlanmaz. */
  conclusionTitle: string;
  finals: ReportGrid;
  closing: string;
  signatureLines: string[];
}

function isPersonLife(value: unknown): value is PersonLifeProfile {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<PersonLifeProfile>;
  return typeof row.personId === "string" && typeof row.role === "string";
}

function calendarAge(entry: { years: number; months: number; days: number } | null | undefined): string {
  if (!entry) return "—";
  return `${entry.years} yıl ${entry.months} ay ${entry.days} gün`;
}

function todayTr(now = new Date()): string {
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${now.getFullYear()}`;
}

function moneyOperand(value: number): string {
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rateOperand(value: number): string {
  return value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

function ratePoint(value: number): string {
  return `%${value}`;
}

function shareCell(fraction: string | null | undefined, percentage: number | null | undefined): string {
  const frac = fraction?.trim() || "—";
  if (percentage == null || !Number.isFinite(percentage)) return frac === "—" ? "—" : frac;
  const pct = Number.isInteger(percentage)
    ? `%${percentage}`
    : `%${percentage.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
  return `${frac} (${pct})`;
}

function statusLabel(status: string | null | undefined): string {
  if (status === "PLAINTIFF") return "Davacı";
  if (status === "OUT_OF_CASE") return "Dava Dışı";
  return "—";
}

function claimantLabel(name: string, relationLabel: string | null | undefined): string {
  const relation = relationLabel?.trim();
  return relation ? `${name} (${relation})` : name;
}

function periodRange(startDate: string, endDate: string): string {
  return `${formatDateIso(startDate)} – ${formatDateIso(endDate)}`;
}

interface ClaimantPeriodRow {
  startDate: string;
  endDate: string;
  claimantId: string;
  claimantName: string;
  claimantStatus: string | null;
  relationLabel: string;
  shareFraction: string;
  sharePercentage: number;
  periodDamage: number;
}

/**
 * Dönem satırlarını gelir cetveli ve davacı dağılımı olarak iki dar tabloya ayırır.
 * Davacı toplamları ekrandaki gruplamayla aynı şekilde dönem zararlarının toplamıdır.
 */
function buildPeriodTables<R extends ClaimantPeriodRow>(
  rows: R[],
  periodKey: (row: R) => string,
  incomeColumns: string[],
  incomeCells: (row: R) => string[]
): PeriodTables | null {
  if (rows.length === 0) return null;
  const plaintiffs: Array<{ claimantId: string; label: string }> = [];
  const seen = new Set<string>();
  const order: string[] = [];
  const periods = new Map<string, { first: R; byClaimantId: Map<string, R> }>();
  const totals = new Map<string, number>();

  for (const row of rows) {
    const key = periodKey(row);
    let period = periods.get(key);
    if (!period) {
      period = { first: row, byClaimantId: new Map() };
      periods.set(key, period);
      order.push(key);
    }
    if (row.claimantStatus !== "PLAINTIFF") continue;
    if (!seen.has(row.claimantId)) {
      seen.add(row.claimantId);
      plaintiffs.push({
        claimantId: row.claimantId,
        label: claimantLabel(row.claimantName?.trim() || row.claimantId, row.relationLabel),
      });
    }
    period.byClaimantId.set(row.claimantId, row);
    totals.set(row.claimantId, (totals.get(row.claimantId) ?? 0) + row.periodDamage);
  }

  const incomeRows: string[][] = [];
  const distributionRows: string[][] = [];
  for (const key of order) {
    const period = periods.get(key)!;
    const range = periodRange(period.first.startDate, period.first.endDate);
    incomeRows.push([range, ...incomeCells(period.first)]);
    for (const plaintiff of plaintiffs) {
      const cell = period.byClaimantId.get(plaintiff.claimantId);
      if (!cell) continue;
      distributionRows.push([
        range,
        plaintiff.label,
        shareCell(cell.shareFraction, cell.sharePercentage),
        formatMoney(cell.periodDamage),
      ]);
    }
  }

  return {
    income: { columns: ["Dönem", ...incomeColumns], rows: incomeRows },
    distribution: {
      columns: ["Dönem", "Hak Sahibi", "Pay", "Destek Tazminatı"],
      rows: distributionRows,
      footer: plaintiffs.map((plaintiff) => [
        "Davacı Toplamı",
        plaintiff.label,
        "",
        formatMoney(totals.get(plaintiff.claimantId) ?? 0),
      ]),
    },
  };
}

function buildProcessed(rows: TrafficDeathProcessedClaimantRow[]): PeriodTables | null {
  return buildPeriodTables(
    rows,
    (row) =>
      [row.startDate, row.endDate, row.dayCount, row.monthlyNetIncome, row.dailyNetIncome, row.periodIncome].join("|"),
    ["Gün", "Aylık Net Gelir", "Günlük Net Gelir", "Dönem Geliri"],
    (row) => [
      String(row.dayCount),
      formatMoney(row.monthlyNetIncome),
      formatMoney(row.dailyNetIncome),
      formatMoney(row.periodIncome),
    ]
  );
}

function buildFuture(rows: TrafficDeathFutureClaimantRow[]): PeriodTables | null {
  return buildPeriodTables(
    rows,
    (row) =>
      [row.startDate, row.endDate, row.dayCount, row.kn, row.discountFactor, row.dailyNetIncome, row.discountedIncome].join("|"),
    ["Gün", "KN", "1/KN", "Günlük Net Gelir", "İskontolu Dönem Geliri"],
    (row) => [
      String(row.dayCount),
      formatKn8(row.kn),
      formatKn8(row.discountFactor),
      formatMoney(row.dailyNetIncome),
      formatMoney(row.discountedIncome),
    ]
  );
}

function positiveMoney(label: string, amount: number | null | undefined, target: Array<[string, string]>): void {
  if (amount == null || !Number.isFinite(amount) || amount === 0) return;
  target.push([label, formatMoney(amount)]);
}

export function trafficDeathReportFilename(draft: TrafficDeathDraft, ext: "docx" | "pdf"): string {
  const raw = draft.common.internalFileName?.trim() || draft.deceased.fullName?.trim() || "hesap";
  const safe = raw
    .replace(/İ/g, "I")
    .replace(/ı/g, "i")
    .replace(/Ş/g, "S")
    .replace(/ş/g, "s")
    .replace(/Ğ/g, "G")
    .replace(/ğ/g, "g")
    .replace(/Ü/g, "U")
    .replace(/ü/g, "u")
    .replace(/Ö/g, "O")
    .replace(/ö/g, "o")
    .replace(/Ç/g, "C")
    .replace(/ç/g, "c")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 60);
  return `Trafik_Kazasi_Destekten_Yoksun_Kalma_Raporu_${safe || "hesap"}.${ext}`;
}

export function buildTrafficDeathReportModel(
  draft: TrafficDeathDraft,
  result: TrafficDeathCalculationResult,
  now = new Date()
): TrafficDeathReportModel {
  const lives = result.personLives.filter(isPersonLife);
  const deceasedLife = lives.find((life) => life.role === "DECEASED");
  const deceasedName = draft.deceased.fullName?.trim() || "—";
  const eventDate = formatDateIso(draft.common.eventDate);
  const calculationDate = formatDateIso(draft.common.calculationDate);

  const metaRows: Array<[string, string]> = [
    ["Hesaplama Türü", "Trafik kazası nedeniyle destekten yoksun kalma"],
    ["Kaza Tarihi", eventDate],
    ["Hesap Tarihi", calculationDate],
    ["Müteveffa", deceasedName],
  ];
  const fileName = draft.common.internalFileName?.trim();
  if (fileName) metaRows.push(["Dosya / Hesap Adı", fileName]);
  const courtName = draft.common.courtName?.trim();
  if (courtName) metaRows.push(["Mahkeme", courtName]);
  const caseNumber = draft.common.caseNumber?.trim();
  if (caseNumber) metaRows.push(["Dosya No", caseNumber]);
  metaRows.push(["Rapor Tarihi", todayTr(now)]);

  const summary = `${eventDate} tarihinde meydana gelen trafik kazası nedeniyle vefat eden ${deceasedName} yönünden destekten yoksun kalma tazminatı hesabı ${calculationDate} tarihi itibarıyla, ${LIFE_TABLE_LABEL} yaşam tablosu esas alınarak yapılmıştır.`;

  const deceasedRows: Array<[string, string]> = [["Ad Soyad", deceasedName]];
  if (draft.deceased.birthDate) deceasedRows.push(["Doğum Tarihi", formatDateIso(draft.deceased.birthDate)]);
  deceasedRows.push(["Kaza Tarihi", eventDate], ["Hesap Tarihi", calculationDate]);
  if (draft.deceased.gender === "male" || draft.deceased.gender === "female") {
    deceasedRows.push(["Cinsiyet", draft.deceased.gender === "male" ? "Erkek" : "Kadın"]);
  }
  const marital = draft.deceasedFamilyInfo?.maritalStatus;
  if (marital && MARITAL_LABELS[marital]) deceasedRows.push(["Medeni Durum", MARITAL_LABELS[marital]]);
  const education = draft.deceasedFamilyInfo?.educationStatus;
  if (education) {
    const label = EDUCATION_LABELS[education] ?? education;
    const other = draft.deceasedFamilyInfo?.educationOtherDescription?.trim();
    deceasedRows.push(["Eğitim Durumu", education === "other" && other ? `${label} (${other})` : label]);
  }
  if (draft.employmentStatus && EMPLOYMENT_LABELS[draft.employmentStatus]) {
    deceasedRows.push(["Çalışma Durumu", EMPLOYMENT_LABELS[draft.employmentStatus]]);
  }
  const incomeMode = result.resolvedIncome.incomeMode;
  if (INCOME_MODE_LABELS[incomeMode]) deceasedRows.push(["Gelir Türü", INCOME_MODE_LABELS[incomeMode]]);
  deceasedRows.push(["Esas Alınan Gelir", formatMoney(result.resolvedIncome.monthlyNetAtEvent)]);
  if (deceasedLife?.ageAtAccident) {
    deceasedRows.push(["Kaza Tarihindeki Yaşı", calendarAge(deceasedLife.ageAtAccident)]);
  }
  if (deceasedLife?.remainingLifetime) {
    deceasedRows.push([
      "Bakiye Ömür",
      formatTrhYmd({
        year: deceasedLife.remainingLifetime.years,
        month: deceasedLife.remainingLifetime.months,
        day: deceasedLife.remainingLifetime.days,
      }),
    ]);
  }
  if (deceasedLife?.probableLifeEndDate) {
    deceasedRows.push(["Muhtemel Yaşam Sonu Tarihi", formatDateIso(deceasedLife.probableLifeEndDate)]);
  }
  deceasedRows.push(
    ["Müteveffa Kusur Oranı", formatPercent(result.deceasedFaultRate)],
    ["Kullanılan Yaşam Tablosu", LIFE_TABLE_LABEL]
  );

  const incomeRows: Array<[string, string]> = [
    ["Gelir türü", INCOME_MODE_LABELS[incomeMode] ?? incomeMode],
    ["Kaza tarihindeki aylık net gelir", formatMoney(result.resolvedIncome.monthlyNetAtEvent)],
    ["Hesap tarihindeki aylık net gelir", formatMoney(result.resolvedIncome.monthlyNetAtCalculation)],
    ["Hesap tarihindeki günlük net gelir", formatMoney(result.resolvedIncome.dailyNetAtCalculation)],
  ];
  if (result.resolvedIncome.eventDateMinWage != null) {
    incomeRows.push(["Kaza tarihindeki asgari ücret", formatMoney(result.resolvedIncome.eventDateMinWage)]);
  }

  const faultRows: Array<[string, string]> = [["Müteveffa", formatPercent(result.deceasedFaultRate)]];
  for (const party of draft.responsibleParties ?? []) {
    faultRows.push([FAULT_TYPE_LABELS[party.type] ?? party.type, formatPercent(party.faultRatio)]);
  }
  if (typeof draft.externalFaultRate === "number" && Number.isFinite(draft.externalFaultRate)) {
    faultRows.push(["Dava Dışı Kusur", formatPercent(draft.externalFaultRate)]);
  }

  const beneficiariesById = new Map(draft.beneficiaries.map((row) => [row.id, row]));
  const claimantLifeRows: string[][] = [];
  const claimantSupportRows: string[][] = [];
  for (const life of lives) {
    if (life.role === "DECEASED") continue;
    const beneficiary = beneficiariesById.get(life.personId);
    const name = beneficiary?.fullName?.trim() || ROLE_LABEL[life.role] || life.personId;
    const relation = beneficiary ? RELATION_LABEL[beneficiary.relation] ?? beneficiary.relation : ROLE_LABEL[life.role] ?? life.role;
    claimantLifeRows.push([
      name,
      statusLabel(beneficiary?.claimantStatus),
      relation,
      formatDateIso(life.birthDate),
      calendarAge(life.ageAtAccident),
      formatTrhYmd({
        year: life.remainingLifetime.years,
        month: life.remainingLifetime.months,
        day: life.remainingLifetime.days,
      }),
    ]);
    claimantSupportRows.push([
      claimantLabel(name, relation),
      eventDate,
      formatDateIso(life.supportEndDate),
      formatDateIso(life.effectiveSupportEndDate),
    ]);
  }

  const shareDistributionRows: string[][] = [];
  const sharePercentageRows: string[][] = [];
  for (const period of result.shareRatioPeriods) {
    const range = `${formatDateIso(period.startDate)} – ${formatDateIso(period.endDate)}`;
    for (const column of result.columnKeys) {
      const personName = beneficiariesById.get(column.key)?.fullName?.trim();
      const label = personName ? `${column.header} (${personName})` : column.header;
      shareDistributionRows.push([range, label, period.shares[column.key]?.trim() || "—"]);
      sharePercentageRows.push([range, label, period.percentages[column.key]?.trim() || "—"]);
    }
  }

  const marriage = result.marriageProbability;
  const marriageApplied = Boolean(marriage && (marriage.spouseName || marriage.applied));
  const marriageEntries = marriageApplied && marriage ? [marriage] : [];
  const marriageReport: MarriageReport =
    marriageEntries.length > 0
      ? {
          applied: true,
          message: null,
          main: {
            columns: [
              "Hak Sahibi",
              "Hesap Tarihindeki Yaş",
              "Yaş Aralığı",
              "Baz Oran",
              "18 Yaş Altı Çocuk",
              "Çocuk İndirimi",
              "Nihai Oran",
            ],
            rows: marriageEntries.map((entry) => [
              `${entry.spouseName ?? "Eş"} (Eş)`,
              calendarAge(entry.spouseAgeYmd),
              entry.spouseAgeRangeKey ?? "—",
              ratePoint(entry.baseMarriageProbabilityRate),
              String(entry.under18ChildCount),
              ratePoint(entry.under18ChildCount * MARRIAGE_CHILD_RATE_POINTS),
              ratePoint(entry.finalMarriageProbabilityRate),
            ]),
          },
          summary: {
            columns: [
              "Baz Oran",
              "Çocuk Sayısı",
              "Çocuk Başına İndirim",
              "Toplam Çocuk İndirimi",
              "Nihai Evlenme İhtimali Oranı",
            ],
            rows: marriageEntries.map((entry) => [
              ratePoint(entry.baseMarriageProbabilityRate),
              String(entry.under18ChildCount),
              ratePoint(MARRIAGE_CHILD_RATE_POINTS),
              ratePoint(entry.under18ChildCount * MARRIAGE_CHILD_RATE_POINTS),
              ratePoint(entry.finalMarriageProbabilityRate),
            ]),
          },
          formulas: marriageEntries.map((entry) => {
            const nominal = entry.under18ChildCount * MARRIAGE_CHILD_RATE_POINTS;
            const floor = entry.baseMarriageProbabilityRate - nominal < 0 ? " (alt sınır %0)" : "";
            return `${ratePoint(entry.baseMarriageProbabilityRate)} − (${entry.under18ChildCount} × ${ratePoint(MARRIAGE_CHILD_RATE_POINTS)}) = ${ratePoint(entry.finalMarriageProbabilityRate)}${floor}`;
          }),
        }
      : {
          applied: false,
          message: "Evlenme ihtimali indirimi uygulanmamıştır.",
          main: null,
          summary: null,
          formulas: [],
        };

  const yearBasisLabel = (36000).toLocaleString("tr-TR");
  const insurance: InsurancePaymentBlock[] = result.claimantLosses.flatMap((row) => {
    const name = claimantLabel(row.claimantName, row.relationLabel);
    const blocks = [
      ...(row.zmtsPaymentDetails ?? []).map((detail) => ({ kind: "ZMTS", detail })),
      ...(row.cascoPaymentDetails ?? []).map((detail) => ({ kind: "Kasko", detail })),
    ];
    return blocks.map(({ kind, detail }) => ({
      title: `${kind} — ${name}`,
      claimant: name,
      kind,
      principal: formatMoney(detail.principal),
      paymentDate: formatDateIso(detail.paymentDate),
      calculationDate: formatDateIso(detail.calculationDate),
      segments: (detail.interestSegments ?? []).map((segment) => ({
        start: formatDateIso(segment.startDate),
        end: formatDateIso(segment.endDate),
        days: String(segment.calendarDayCount),
        rate: formatPercent(segment.annualRatePercent),
        interest: formatMoney(segment.interestAmount),
        formula: `${moneyOperand(detail.principal)} × ${segment.calendarDayCount} × ${rateOperand(segment.annualRatePercent)} / ${yearBasisLabel} = ${moneyOperand(segment.interestAmount)} TL`,
      })),
      totalInterest: `Toplam Faiz: ${moneyOperand(detail.legalInterestAmount)} TL`,
      principalLine: `Ana Ödeme: ${moneyOperand(detail.principal)} TL`,
      updatedLine: `Güncellenmiş Ödeme: ${moneyOperand(detail.principal)} + ${moneyOperand(detail.legalInterestAmount)} = ${moneyOperand(detail.updatedAmount)} TL`,
    }));
  });

  const lossCalculationRows = result.claimantLosses.map((row) => [
    claimantLabel(row.claimantName, row.relationLabel),
    formatMoney(row.processedLoss),
    formatMoney(row.futureLoss),
    formatMoney(row.totalLoss),
    formatMoney(row.lossAfterDeceasedFault),
    formatMoney(row.lossAfterMarriageProbability),
  ]);
  const lossInsuranceRows = result.claimantLosses.map((row) => [
    claimantLabel(row.claimantName, row.relationLabel),
    formatMoney(row.updatedZmtsPaymentAmount),
    formatMoney(row.updatedCascoPaymentAmount),
    row.lossAfterInsurancePayments == null ? "—" : formatMoney(row.lossAfterInsurancePayments),
  ]);

  const otherItems: Array<[string, string]> = [];
  positiveMoney("Ölüm öncesi tedavi giderleri", result.deathExpenses.preDeathTreatment, otherItems);
  positiveMoney("Diğer ölüm öncesi giderler", result.deathExpenses.otherExpenses, otherItems);
  positiveMoney("Cenaze giderleri", result.deathExpenses.funeralCost, otherItems);
  positiveMoney("Cenaze nakil giderleri", result.deathExpenses.transportCost, otherItems);
  positiveMoney("Peşin sermaye değeri (kusur sonrası mahsup)", result.psdDeductibleAfterFault, otherItems);

  const finalRows = result.claimantLosses.map((row) => [
    row.claimantName,
    row.relationLabel || "—",
    statusLabel(row.claimantStatus),
    formatMoney(row.lossAfterInsurancePayments ?? row.lossAfterMarriageProbability),
  ]);
  if (result.totalAfterCapitalValue != null) {
    const appliedPsd =
      Math.round(((result.totalAfterClaimantInsurance ?? 0) - result.totalAfterCapitalValue) * 100) / 100;
    if (appliedPsd > 0) {
      finalRows.push(["Peşin sermaye değeri mahsubu", "—", "—", `-${formatMoney(appliedPsd)}`]);
    }
  } else if (result.priorPaymentsTotal > 0) {
    finalRows.push(["Önceki ödeme mahsubu", "—", "—", `-${formatMoney(result.priorPaymentsTotal)}`]);
  }
  if (result.deathExpenses.total > 0) {
    finalRows.push(["Ölüm ve cenaze giderleri", "—", "—", formatMoney(result.deathExpenses.total)]);
  }

  return {
    titleLines: [
      "TRAFİK KAZASI NEDENİYLE",
      "DESTEKTEN YOKSUN KALMA TAZMİNATI",
      "HESAP RAPORU",
    ],
    metaRows,
    summary,
    deceasedRows,
    incomeRows,
    incomeNote:
      "İşlemiş ve işleyecek dönem cetvellerindeki gelir tutarları, yukarıdaki gelir esası üzerinden hesap motorunun ürettiği dönem değerleridir.",
    faultRows,
    claimantLives: {
      columns: ["Hak Sahibi", "Durumu", "Yakınlık", "Doğum Tarihi", "Kaza Tarihindeki Yaş", "Bakiye Ömür"],
      rows: claimantLifeRows,
    },
    claimantSupport: {
      columns: ["Hak Sahibi", "Destek Başlangıcı", "Destek Sonu", "Hesapta Esas Alınan Destek Sonu"],
      rows: claimantSupportRows,
    },
    shareIntro: SHARE_INTRO,
    shareDistribution: {
      columns: ["Dönem", "Hak Sahibi", "Pay"],
      rows: shareDistributionRows,
    },
    sharePercentages: {
      columns: ["Dönem", "Hak Sahibi", "Yüzde"],
      rows: sharePercentageRows,
    },
    processed: buildProcessed(result.processedPeriods),
    processedEmpty: result.processedPeriods.length === 0 ? "İşlemiş dönem satırı yok." : null,
    future: buildFuture(result.futurePeriods),
    futureEmpty: result.futurePeriods.length === 0 ? "İşleyecek dönem satırı yok." : null,
    marriage: marriageReport,
    insurance,
    insuranceEmpty: insurance.length === 0 ? "Hak sahibine bağlı ZMTS veya kasko ödemesi bulunmamaktadır." : null,
    lossCalculation: {
      columns: ["Hak Sahibi", "İşlemiş", "İşleyecek", "Toplam", "Kusur Sonrası", "Evlenme İndirimi Sonrası"],
      rows: lossCalculationRows,
      footer: [
        [
          "TOPLAM",
          "",
          "",
          "",
          formatMoney(result.totalAfterFault),
          formatMoney(result.totalAfterMarriageProbability ?? result.totalAfterFault),
        ],
      ],
    },
    lossInsurance: {
      columns: [
        "Hak Sahibi",
        "Sigorta Şirketinden Ödenen",
        "Kasko Şirketinden Ödenen",
        "Mahsup Sonrası Kalan Zarar",
      ],
      rows: lossInsuranceRows,
      footer: [
        [
          "TOPLAM",
          formatMoney(result.updatedZmtsPaymentTotal),
          formatMoney(result.updatedCascoPaymentTotal),
          formatMoney(result.totalAfterClaimantInsurance),
        ],
      ],
    },
    otherItems: otherItems.length > 0 ? otherItems : null,
    conclusionTitle: otherItems.length > 0 ? "12. SONUÇ VE KANAAT" : "11. SONUÇ VE KANAAT",
    finals: {
      columns: ["Hak Sahibi / Kalem", "Yakınlık", "Durumu", "Tutar"],
      rows: finalRows,
      footer: [["GENEL TOPLAM", "", "", formatMoney(result.finalCompensation)]],
    },
    closing: `Yukarıda açıklanan hesaplama esasları ve indirimler doğrultusunda, ${calculationDate} tarihi itibarıyla hesaplanan destekten yoksun kalma tazminatı tutarları yukarıdaki tabloda gösterilmiştir. Hesap, dosyada yer alan veriler ve uygulanan aktüeryal esaslar çerçevesinde düzenlenmiştir. Tutarların hüküm ve takdire bağlanması yargı merciine aittir.`,
    signatureLines: ["Raporu düzenleyen", "Ad soyad:", "Unvan:", "Tarih:", "İmza:"],
  };
}
