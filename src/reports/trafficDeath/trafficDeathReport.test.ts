import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { createRequire } from "node:module";
import { CALCULATION_SCHEMA_VERSION } from "../../calculations/types.js";
import type { TrafficDeathDraft } from "../../calculations/types.js";
import { calculateTrafficDeath } from "../../calculations/trafficDeath/calculateTrafficDeath.js";
import { formatDateIso, formatMoney, formatPercent } from "../trafficInjury/reportFormat.js";
import { buildTrafficDeathReportModel, trafficDeathReportFilename } from "./trafficDeathReportModel.js";
import { generateTrafficDeathWordReport } from "./trafficDeathWordReport.js";
import { generateTrafficDeathPdfReport } from "./trafficDeathPdfReport.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (data: Buffer) => Promise<{ text: string; numpages: number }>;

const SPOUSE_ID = "8a128cca-7b80-42bf-b5bc-54035cf76786";

export function ayseDraft(): TrafficDeathDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_DEATH",
    employmentStatus: "WORKING",
    common: { eventDate: "2020-06-01", calculationDate: "2026-09-28" },
    deceased: { birthDate: "1970-01-01", deathDate: "2020-06-01", gender: "male", fullName: "Ahmet Yılmaz" },
    deceasedFamilyInfo: {
      maritalStatus: null,
      militaryStatus: "COMPLETED",
      educationStatus: "graduate",
      educationOtherDescription: "",
      hasChildren: false,
      childrenCount: 0,
      children: [],
      militaryServiceStartDate: "1990-01-01",
      militaryServiceDurationMonths: 12,
    },
    accidentIncome: { incomeMode: "minWage", fixedAmount: null, averageSources: [] },
    nonWorkingSelectedIncome: null,
    incomePeriods: [],
    beneficiaries: [
      {
        id: SPOUSE_ID,
        fullName: "Ayşe Yılmaz",
        relation: "spouse",
        birthDate: "1975-01-01",
        gender: "female",
        claimantStatus: "PLAINTIFF",
        remarried: false,
        remarriageDate: null,
      },
    ],
    supportRelations: [],
    liability: { injuredFaultRatio: 0, parties: [], externalFaultRatio: 0 },
    deceasedFaultRate: 0,
    responsibleParties: [],
    externalFaultRate: 100,
    deathExpenses: { otherExpenses: [] },
    priorPayments: [],
    insurance: {},
    sosyalYardimOdenekleri: [],
    capitalValueDocuments: [],
    zmtsPayments: [
      {
        id: "zmts-1",
        paymentDate: "2023-01-01",
        paymentAmount: 350000,
        liabilityLimit: 0,
        accidentLimit: 1000000,
        garameEntries: [],
        garameEnabled: false,
        claimantId: SPOUSE_ID,
        claimantName: "Ayşe Yılmaz",
        claimantRelation: "spouse",
      },
    ],
    cascoPayments: [
      {
        id: "casco-1",
        paymentDate: "2023-06-01",
        paymentAmount: 100000,
        liabilityLimit: 0,
        accidentLimit: 0,
        garameEntries: [],
        garameEnabled: false,
        claimantId: SPOUSE_ID,
        claimantName: "Ayşe Yılmaz",
        claimantRelation: "spouse",
      },
    ],
    marriageProbabilityDeduction: { under18ChildCount: 0, note: "" },
    educationExpenseDeduction: { notes: "" },
  } as TrafficDeathDraft;
}

export function emineDraft(): TrafficDeathDraft {
  const draft = ayseDraft();
  draft.common.internalFileName = "Emine Tutkun Evlenme Deneme";
  draft.deceased = { ...draft.deceased, fullName: "Hasan Tutkun", birthDate: "1990-05-05" };
  draft.beneficiaries = [
    {
      id: SPOUSE_ID,
      fullName: "Emine Tutkun",
      relation: "spouse",
      birthDate: "1994-02-15",
      gender: "female",
      claimantStatus: "PLAINTIFF",
      remarried: false,
      remarriageDate: null,
    },
    { id: "c1", fullName: "Ali Tutkun", relation: "child", birthDate: "2014-04-01", gender: "male", claimantStatus: "PLAINTIFF" },
    { id: "c2", fullName: "Zeynep Tutkun", relation: "child", birthDate: "2016-07-12", gender: "female", claimantStatus: "PLAINTIFF" },
    { id: "c3", fullName: "Can Tutkun", relation: "child", birthDate: "2019-11-20", gender: "male", claimantStatus: "PLAINTIFF" },
  ];
  draft.zmtsPayments = draft.zmtsPayments.map((payment) => ({ ...payment, claimantName: "Emine Tutkun" }));
  draft.cascoPayments = draft.cascoPayments.map((payment) => ({ ...payment, claimantName: "Emine Tutkun" }));
  draft.marriageProbabilityDeduction = { under18ChildCount: 3, note: "" };
  return draft;
}

async function docxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file("word/document.xml")!.async("string");
  return xml
    .replace(/<w:tab\/>/g, " ")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, " ");
}

describe("TRAFFIC_DEATH rapor modeli, Word ve PDF paritesi", () => {
  const draft = ayseDraft();
  const result = calculateTrafficDeath(draft);
  const model = buildTrafficDeathReportModel(draft, result, new Date("2026-09-28T12:00:00"));
  const spouse = result.claimantLosses.find((row) => row.claimantId === SPOUSE_ID)!;

  it("motor sonucu Ayşe Yılmaz örneğiyle aynıdır", () => {
    expect(spouse.updatedZmtsPaymentAmount).toBe(597352.77);
    expect(spouse.updatedCascoPaymentAmount).toBe(166897.23);
    expect(spouse.lossAfterInsurancePayments).toBe(2951098.16);
    expect(result.finalCompensation).toBe(2951098.16);
  });

  it("model motor alanlarını yeniden hesaplamadan taşır", () => {
    expect(model.lossCalculation.rows).toEqual([
      [
        "Ayşe Yılmaz (Eş)",
        formatMoney(spouse.processedLoss),
        formatMoney(spouse.futureLoss),
        formatMoney(spouse.totalLoss),
        formatMoney(spouse.lossAfterDeceasedFault),
        formatMoney(spouse.lossAfterMarriageProbability),
      ],
    ]);
    expect(model.lossInsurance.rows).toEqual([
      ["Ayşe Yılmaz (Eş)", "597.352,77 TL", "166.897,23 TL", "2.951.098,16 TL"],
    ]);
    expect(model.lossInsurance.footer?.[0]?.[3]).toBe(formatMoney(result.totalAfterClaimantInsurance));
    expect(model.finals.footer?.[0]?.[3]).toBe(formatMoney(result.finalCompensation));
    expect(model.finals.rows).toEqual([["Ayşe Yılmaz", "Eş", "Davacı", "2.951.098,16 TL"]]);

    const zmts = model.insurance.find((block) => block.kind === "ZMTS")!;
    expect(zmts.segments.map((segment) => segment.formula)).toEqual([
      "350.000,00 × 517 × 9 / 36.000 = 45.237,50 TL",
      "350.000,00 × 790 × 24 / 36.000 = 184.333,33 TL",
      "350.000,00 × 59 × 31 / 36.000 = 17.781,94 TL",
    ]);
    expect(zmts.totalInterest).toBe("Toplam Faiz: 247.352,77 TL");
    expect(zmts.updatedLine).toContain("= 597.352,77 TL");
    const casco = model.insurance.find((block) => block.kind === "Kasko")!;
    expect(casco.segments.map((segment) => segment.formula)).toEqual([
      "100.000,00 × 366 × 9 / 36.000 = 9.150,00 TL",
      "100.000,00 × 790 × 24 / 36.000 = 52.666,67 TL",
      "100.000,00 × 59 × 31 / 36.000 = 5.080,56 TL",
    ]);
    expect(casco.updatedLine).toContain("= 166.897,23 TL");

    const percentCells = model.sharePercentages.rows.map((row) => row[2]);
    const enginePercents = result.shareRatioPeriods.flatMap((period) =>
      result.columnKeys.map((column) => period.percentages[column.key]?.trim() || "—")
    );
    expect(percentCells).toEqual(enginePercents);
    expect(model.marriage.main?.rows[0]?.[6]).toBe(`%${result.marriageProbability!.finalMarriageProbabilityRate}`);
    expect(model.marriage.main?.rows[0]?.[1]).toBe("51 yıl 8 ay 27 gün");
    expect(model.processed?.distribution.footer).toEqual([
      ["Davacı Toplamı", "Ayşe Yılmaz (Eş)", "", formatMoney(spouse.processedLoss)],
    ]);
    expect(model.future?.distribution.footer).toEqual([
      ["Davacı Toplamı", "Ayşe Yılmaz (Eş)", "", formatMoney(spouse.futureLoss)],
    ]);
    expect(model.processed?.income.rows.length).toBeGreaterThan(0);
    expect(model.processed?.income.columns).toHaveLength(5);
    expect(model.future?.income.columns).toHaveLength(6);
    expect(model.insurance.map((block) => block.title)).toEqual(["ZMTS — Ayşe Yılmaz (Eş)", "Kasko — Ayşe Yılmaz (Eş)"]);
  });

  it("Word tek dikey bölümdür ve hiçbir hücrede dolgu rengi yoktur", async () => {
    const zip = await JSZip.loadAsync(await generateTrafficDeathWordReport(model));
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml.match(/<w:sectPr/g)).toHaveLength(1);
    expect(xml).not.toContain('w:orient="landscape"');
    expect(xml).not.toContain("<w:shd");
  });

  it("Word ve PDF aynı değerleri içerir", async () => {
    const word = normalizeSpaces(await docxText(await generateTrafficDeathWordReport(model)));
    const pdfBuffer = await generateTrafficDeathPdfReport(model);
    expect(pdfBuffer.subarray(0, 5).toString()).toBe("%PDF-");
    const parsed = await pdfParse(pdfBuffer);
    const pdf = normalizeSpaces(parsed.text);
    expect(parsed.numpages).toBeGreaterThan(1);

    const deceasedLife = (result.personLives as Array<{ role: string; probableLifeEndDate: string | null }>).find(
      (life) => life.role === "DECEASED"
    )!;
    const required = [
      "TRAFİK KAZASI NEDENİYLE",
      "Ahmet Yılmaz",
      "Ayşe Yılmaz",
      formatDateIso(draft.common.calculationDate),
      formatPercent(result.deceasedFaultRate),
      formatDateIso(deceasedLife.probableLifeEndDate),
      "597.352,77 TL",
      "166.897,23 TL",
      "2.951.098,16 TL",
      formatMoney(result.finalCompensation),
      formatMoney(spouse.processedLoss),
      formatMoney(spouse.futureLoss),
      "350.000,00 × 517 × 9 / 36.000 = 45.237,50 TL",
      "350.000,00 × 790 × 24 / 36.000 = 184.333,33 TL",
      "350.000,00 × 59 × 31 / 36.000 = 17.781,94 TL",
      "100.000,00 × 366 × 9 / 36.000 = 9.150,00 TL",
      "Toplam Faiz: 247.352,77 TL",
      "Toplam Faiz: 66.897,23 TL",
      ...model.marriage.formulas,
      "Evlenme İhtimali Hesap Özeti",
      "51 yıl 8 ay 27 gün",
      "Davacı Toplamı",
      "GENEL TOPLAM",
      "ZMTS — Ayşe Yılmaz (Eş)",
      "Kasko — Ayşe Yılmaz (Eş)",
      "10.2 Sigorta Mahsupları ve Kalan Zarar",
    ];
    for (const value of required) {
      expect(word, `Word: ${value}`).toContain(value);
      expect(pdf, `PDF: ${value}`).toContain(value);
    }
    for (const period of result.shareRatioPeriods) {
      for (const share of Object.values(period.shares)) {
        if (share.trim()) {
          expect(word).toContain(share.trim());
          expect(pdf).toContain(share.trim());
        }
      }
    }
    expect(word).not.toContain("İşlemiş dönem toplamı");
    expect(word).not.toContain("İşleyecek dönem toplamı");
    expect(pdf).not.toContain("İşlemiş dönem toplamı");
    expect(pdf).not.toContain("İşleyecek dönem toplamı");
  });

  it("çoklu hak sahibinde sonuç tablosu satırları GENEL TOPLAM'a eşittir", () => {
    const multi = ayseDraft();
    multi.common.internalFileName = "Çoklu Hak Sahibi Deneme";
    multi.beneficiaries.push(
      { id: "c1", fullName: "Mehmet Yılmaz", relation: "child", birthDate: "2008-03-10", gender: "male", claimantStatus: "PLAINTIFF" },
      { id: "m1", fullName: "Fatma Yılmaz", relation: "mother", birthDate: "1948-02-02", gender: "female", claimantStatus: "OUT_OF_CASE" }
    );
    multi.deceasedFaultRate = 20;
    multi.externalFaultRate = 10;
    multi.deathExpenses = { funeralCost: 25000, otherExpenses: [] };
    const multiResult = calculateTrafficDeath(multi);
    const multiModel = buildTrafficDeathReportModel(multi, multiResult, new Date("2026-09-28T12:00:00"));

    const parseMoney = (value: string) => Number(value.replace(" TL", "").replace(/\./g, "").replace(",", "."));
    const rowsTotal = multiModel.finals.rows.reduce((sum, row) => sum + parseMoney(row[3]!), 0);
    expect(Math.round(rowsTotal * 100) / 100).toBe(multiResult.finalCompensation);
    expect(multiModel.finals.footer?.[0]?.[3]).toBe(formatMoney(multiResult.finalCompensation));
    expect(multiModel.finals.rows.some((row) => row[2] === "Dava Dışı")).toBe(true);
    expect(multiModel.finals.rows.at(-1)).toEqual(["Ölüm ve cenaze giderleri", "—", "—", "25.000,00 TL"]);
    expect(multiModel.shareDistribution.rows.some((row) => row[1] === "ÇOCUK (Mehmet Yılmaz)")).toBe(true);
  });

  it("evlenme ihtimali bölümü Emine Tutkun örneğinde tablo olarak gösterilir", async () => {
    const emine = emineDraft();
    const emineResult = calculateTrafficDeath(emine);
    const emineModel = buildTrafficDeathReportModel(emine, emineResult, new Date("2026-09-28T12:00:00"));

    expect(emineModel.marriage.main?.rows).toEqual([
      ["Emine Tutkun (Eş)", "32 yıl 7 ay 13 gün", "31-35", "%17", "3", "%15", "%2"],
    ]);
    expect(emineModel.marriage.summary?.columns).toEqual([
      "Baz Oran",
      "Çocuk Sayısı",
      "Çocuk Başına İndirim",
      "Toplam Çocuk İndirimi",
      "Nihai Evlenme İhtimali Oranı",
    ]);
    expect(emineModel.marriage.summary?.rows).toEqual([["%17", "3", "%5", "%15", "%2"]]);
    expect(emineModel.marriage.formulas).toEqual(["%17 − (3 × %5) = %2"]);

    const word = normalizeSpaces(await docxText(await generateTrafficDeathWordReport(emineModel)));
    const pdf = normalizeSpaces((await pdfParse(await generateTrafficDeathPdfReport(emineModel))).text);
    for (const value of ["Emine Tutkun (Eş)", "32 yıl 7 ay 13 gün", "Evlenme İhtimali Hesap Özeti", "%17 − (3 × %5) = %2"]) {
      expect(word, `Word: ${value}`).toContain(value);
      expect(pdf, `PDF: ${value}`).toContain(value);
    }
    expect(word).not.toContain("Hesap Formülü");
    expect(pdf).not.toContain("Hesap Formülü");
  });

  it("eş yoksa evlenme ihtimali tablosu yerine bilgi metni gösterilir", () => {
    const noSpouse = ayseDraft();
    noSpouse.beneficiaries = [
      { id: "c1", fullName: "Mehmet Yılmaz", relation: "child", birthDate: "2008-03-10", gender: "male", claimantStatus: "PLAINTIFF" },
    ];
    noSpouse.zmtsPayments = [];
    noSpouse.cascoPayments = [];
    const noSpouseModel = buildTrafficDeathReportModel(noSpouse, calculateTrafficDeath(noSpouse), new Date("2026-09-28T12:00:00"));
    expect(noSpouseModel.marriage.main).toBeNull();
    expect(noSpouseModel.marriage.message).toBe("Evlenme ihtimali indirimi uygulanmamıştır.");
  });

  it("dosya adı kullanıcı önerisine uyar", () => {
    expect(trafficDeathReportFilename(draft, "docx")).toBe(
      "Trafik_Kazasi_Destekten_Yoksun_Kalma_Raporu_Ahmet_Yilmaz.docx"
    );
    expect(trafficDeathReportFilename(draft, "pdf")).toMatch(/\.pdf$/);
  });
});
