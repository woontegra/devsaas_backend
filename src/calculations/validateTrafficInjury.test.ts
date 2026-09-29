import { describe, it, expect } from "vitest";
import { validateCalculationDraft } from "./validateDraft.js";
import { CALCULATION_SCHEMA_VERSION, type InsurancePaymentRecord } from "./types.js";
import {
  isInsurancePaymentEmpty,
  isTempPeriodEmpty,
  resolveIncomeMode,
} from "./validateTrafficInjury.js";

function baseDraft(over: Record<string, unknown> = {}) {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_INJURY" as const,
    common: { eventDate: "2020-06-01", calculationDate: "2024-01-15" },
    parties: {
      plaintiff: {
        firstName: "Ali",
        lastName: "Veli",
        birthDate: "1985-03-10",
        gender: "MALE" as const,
      },
      defendants: [
        {
          id: "d-zmts",
          type: "COMPULSORY_TRAFFIC_INSURER" as const,
          organizationName: "ZMTS A.Ş.",
        },
        { id: "d-casco", type: "CASCO_INSURER" as const, organizationName: "Kasko A.Ş." },
      ],
    },
    liability: {
      injuredFaultRatio: 20,
      parties: [{ id: "lp1", partyType: "defendant" as const, name: "Gerçek Kişi Şoför", faultRatio: 80 }],
    },
    disability: { permanentDisabilityRate: 35, disabilityStartDate: "2020-09-01" },
    temporaryIncapacityPeriods: [],
    accidentIncome: { incomeMode: "fixed" as const, fixedAmount: 15000, averageSources: [] },
    hospitalExpenses: [],
    travelExpenses: [],
    caregiverExpenses: [],
    capitalValueDocuments: [],
    zmtsPayments: [],
    cascoPayments: [],
    ...over,
  };
}

describe("validateTrafficInjuryDraft — extended", () => {
  it("accepts completely empty temporary incapacity placeholder row", () => {
    const res = validateCalculationDraft(
      baseDraft({
        temporaryIncapacityPeriods: [{ id: "t0", startDate: "", endDate: "" }],
      })
    );
    expect(res.errors.filter((e) => e.field.startsWith("temporaryIncapacityPeriods"))).toHaveLength(0);
    expect(isTempPeriodEmpty({ id: "t0", startDate: "", endDate: "" })).toBe(true);
  });

  it("errors when temp period is partially filled without dates", () => {
    const res = validateCalculationDraft(
      baseDraft({
        temporaryIncapacityPeriods: [{ id: "t1", startDate: "", endDate: "", dayCount: 5 }],
      })
    );
    expect(res.errors.some((e) => e.field.includes("temporaryIncapacityPeriods[0].startDate"))).toBe(true);
    expect(res.errors.some((e) => e.field.includes("temporaryIncapacityPeriods[0].endDate"))).toBe(true);
  });

  it("validates incomeMode minWage when eventDate has wage period", () => {
    const res = validateCalculationDraft(
      baseDraft({
        accidentIncome: { incomeMode: "minWage", fixedAmount: null, averageSources: [] },
      })
    );
    expect(res.errors.filter((e) => e.field.startsWith("accidentIncome"))).toHaveLength(0);
    expect(res.warnings.filter((w) => w.code === "INCOME_MISSING")).toHaveLength(0);
  });

  it("warns for minWage when eventDate has no wage period", () => {
    const res = validateCalculationDraft(
      baseDraft({
        common: { eventDate: "2005-01-01", calculationDate: "2024-01-15" },
        accidentIncome: { incomeMode: "minWage", fixedAmount: null, averageSources: [] },
      })
    );
    expect(res.warnings.some((w) => w.code === "MIN_WAGE_PERIOD_MISSING")).toBe(true);
  });

  it("warns for fixed mode without positive fixedAmount", () => {
    const res = validateCalculationDraft(
      baseDraft({
        accidentIncome: { incomeMode: "fixed", fixedAmount: null, averageSources: [] },
      })
    );
    expect(res.warnings.some((w) => w.code === "INCOME_MISSING")).toBe(true);
  });

  it("warns for average mode without averageNetResult", () => {
    const res = validateCalculationDraft(
      baseDraft({
        accidentIncome: {
          incomeMode: "average",
          fixedAmount: null,
          averageSources: [{ id: "a1", kind: "witness", amountKind: "net", amount: 1000 }],
        },
      })
    );
    expect(res.warnings.some((w) => w.code === "INCOME_MISSING")).toBe(true);
  });

  it("accepts average mode with averageNetResult > 0", () => {
    const res = validateCalculationDraft(
      baseDraft({
        accidentIncome: {
          incomeMode: "average",
          fixedAmount: null,
          averageSources: [{ id: "a1", kind: "witness", amountKind: "net", amount: 1000 }],
          averageNetResult: 8500,
        },
      })
    );
    expect(res.warnings.filter((w) => w.code === "INCOME_MISSING")).toHaveLength(0);
  });

  it("resolveIncomeMode ignores deprecated useAverage when incomeMode set", () => {
    expect(
      resolveIncomeMode({
        incomeMode: "minWage",
        fixedAmount: 5000,
        useAverage: true,
        averageSources: [],
      })
    ).toBe("minWage");
  });

  it("accepts empty PSD row", () => {
    const res = validateCalculationDraft(
      baseDraft({
        capitalValueDocuments: [{ id: "psd1", amount: 0, documentDate: "", documentNumber: "", notes: "" }],
      })
    );
    expect(res.errors.filter((e) => e.field.startsWith("capitalValueDocuments"))).toHaveLength(0);
  });

  it("rejects negative PSD amount when row used", () => {
    const res = validateCalculationDraft(
      baseDraft({
        capitalValueDocuments: [{ id: "psd1", amount: -1, notes: "Belge" }],
      })
    );
    expect(res.errors.some((e) => e.field.includes("capitalValueDocuments[0].amount"))).toBe(true);
  });

  it("accepts a missing sosyal yardım list", () => {
    const res = validateCalculationDraft(baseDraft());
    expect(res.errors.filter((e) => e.field.startsWith("sosyalYardimOdenekleri"))).toHaveLength(0);
  });

  it("rejects negative sosyal yardım amount without flagging PSD rows", () => {
    const res = validateCalculationDraft(
      baseDraft({
        capitalValueDocuments: [{ id: "psd1", amount: 100, notes: "PSD" }],
        sosyalYardimOdenekleri: [{ id: "s1", amount: -5, notes: "Yardım" }],
      })
    );
    expect(res.errors.some((e) => e.field.includes("sosyalYardimOdenekleri[0].amount"))).toBe(true);
    expect(res.errors.some((e) => e.field.startsWith("capitalValueDocuments"))).toBe(false);
  });

  it("accepts empty ZMTS/Kasko payment rows", () => {
    const res = validateCalculationDraft(
      baseDraft({
        zmtsPayments: [
          {
            id: "z1",
            paymentDate: "",
            paymentAmount: 0,
            liabilityLimit: 0,
            accidentLimit: 0,
            garameEntries: [],
          },
        ],
        cascoPayments: [
          {
            id: "c1",
            paymentDate: "",
            paymentAmount: 0,
            liabilityLimit: 0,
            accidentLimit: 0,
          },
        ],
      })
    );
    expect(res.errors.filter((e) => e.field.startsWith("zmtsPayments"))).toHaveLength(0);
    expect(res.errors.filter((e) => e.field.startsWith("cascoPayments"))).toHaveLength(0);
    expect(
      isInsurancePaymentEmpty({
        id: "z1",
        paymentDate: "",
        paymentAmount: 0,
        liabilityLimit: 0,
        accidentLimit: 0,
      })
    ).toBe(true);
  });

  it("rejects negative insurance limits", () => {
    const res = validateCalculationDraft(
      baseDraft({
        zmtsPayments: [
          {
            id: "z1",
            paymentDate: "2021-01-01",
            paymentAmount: 100,
            liabilityLimit: -1,
            accidentLimit: 0,
            defendantId: "d-zmts",
          },
        ],
      })
    );
    expect(res.errors.some((e) => e.field.includes("liabilityLimit"))).toBe(true);
  });

  it("warns when defendantId missing but single insurer defendant exists", () => {
    const res = validateCalculationDraft(
      baseDraft({
        zmtsPayments: [
          {
            id: "z1",
            paymentDate: "2021-01-01",
            paymentAmount: 100,
            liabilityLimit: 1000,
            accidentLimit: 5000,
          },
        ],
      })
    );
    expect(res.warnings.some((w) => w.code === "DEFENDANT_ID_MISSING")).toBe(true);
  });

  it("validates garame external victim requires label", () => {
    const res = validateCalculationDraft(
      baseDraft({
        zmtsPayments: [
          {
            id: "z1",
            paymentDate: "2021-01-01",
            paymentAmount: 100,
            liabilityLimit: 1000,
            accidentLimit: 5000,
            defendantId: "d-zmts",
            garameEnabled: true,
            garameEntries: [{ id: "g1" }],
          },
        ],
      })
    );
    expect(res.errors.some((e) => e.field.includes("externalPersonLabel"))).toBe(true);
  });

  it("accepts garame plaintiff reference without duplicate fields", () => {
    const res = validateCalculationDraft(
      baseDraft({
        zmtsPayments: [
          {
            id: "z1",
            paymentDate: "2021-01-01",
            paymentAmount: 100,
            liabilityLimit: 1000,
            accidentLimit: 5000,
            defendantId: "d-zmts",
            garameEnabled: true,
            garameEntries: [{ id: "g1", subjectRef: "plaintiff" }],
          },
        ],
      })
    );
    expect(res.errors.filter((e) => e.field.includes("garameEntries"))).toHaveLength(0);
  });

  it("garameEnabled=false iken garameEntries doğrulanmaz", () => {
    const res = validateCalculationDraft(
      baseDraft({
        zmtsPayments: [
          {
            id: "z1",
            paymentDate: "2021-01-01",
            paymentAmount: 100,
            liabilityLimit: 1000,
            accidentLimit: 5000,
            defendantId: "d-zmts",
            garameEnabled: false,
            garameEntries: [{ id: "g1" }],
          },
        ],
      })
    );
    expect(res.errors.filter((e) => e.field.includes("garameEntries"))).toHaveLength(0);
  });

  it("eski draft garameEnabled olmadan — kapalı kabul", () => {
    const row: InsurancePaymentRecord = {
      id: "z1",
      paymentDate: "2021-01-01",
      paymentAmount: 100,
      liabilityLimit: 1000,
      accidentLimit: 5000,
      garameEntries: [{ id: "g1" }],
    };
    expect(isInsurancePaymentEmpty(row)).toBe(false);
    const res = validateCalculationDraft(baseDraft({ zmtsPayments: [row] }));
    expect(res.errors.filter((e) => e.field.includes("garameEntries"))).toHaveLength(0);
  });

  it("rejects invalid passivePhaseAge", () => {
    const res = validateCalculationDraft(baseDraft({ passivePhaseAge: 0 }));
    expect(res.errors.some((e) => e.field === "passivePhaseAge")).toBe(true);
  });

  it("accepts default-range passivePhaseAge", () => {
    const res = validateCalculationDraft(baseDraft({ passivePhaseAge: 60 }));
    expect(res.errors.filter((e) => e.field === "passivePhaseAge")).toHaveLength(0);
  });

  it("includes calculationDate in validation (required ISO)", () => {
    const res = validateCalculationDraft(
      baseDraft({ common: { eventDate: "2020-06-01", calculationDate: "" } })
    );
    expect(res.errors.some((e) => e.field === "common.calculationDate")).toBe(true);
  });

  it("allows calculationDate after eventDate", () => {
    const res = validateCalculationDraft(
      baseDraft({ common: { eventDate: "2020-06-01", calculationDate: "2025-06-01" } })
    );
    expect(res.errors.some((e) => e.field === "common.calculationDate")).toBe(false);
    expect(res.errors.some((e) => e.code === "EVENT_AFTER_CALCULATION")).toBe(false);
  });

  it("rejects calculationDate before eventDate", () => {
    const res = validateCalculationDraft(
      baseDraft({ common: { eventDate: "2024-06-01", calculationDate: "2024-01-01" } })
    );
    expect(res.errors.some((e) => e.code === "EVENT_AFTER_CALCULATION")).toBe(true);
  });

  it("rejects processedPeriodStartDate before eventDate", () => {
    const res = validateCalculationDraft(
      baseDraft({
        common: { eventDate: "2020-06-01", calculationDate: "2024-01-15" },
        processedPeriodStartDate: "2019-01-01",
      })
    );
    expect(res.errors.some((e) => e.field === "processedPeriodStartDate" && e.code === "BEFORE_EVENT_DATE")).toBe(
      true
    );
  });

  it("rejects processedPeriodEndDate after calculationDate", () => {
    const res = validateCalculationDraft(
      baseDraft({
        common: { eventDate: "2020-06-01", calculationDate: "2024-01-15" },
        processedPeriodEndDate: "2025-01-01",
      })
    );
    expect(
      res.errors.some((e) => e.field === "processedPeriodEndDate" && e.code === "AFTER_CALCULATION_DATE")
    ).toBe(true);
  });

  it("accepts processed period within event and calculation bounds", () => {
    const res = validateCalculationDraft(
      baseDraft({
        common: { eventDate: "2020-06-01", calculationDate: "2024-01-15" },
        processedPeriodStartDate: "2021-01-01",
        processedPeriodEndDate: "2023-12-31",
      })
    );
    expect(res.errors.filter((e) => e.field.startsWith("processedPeriod"))).toHaveLength(0);
  });

  it("does not warn DAY_COUNT_MISMATCH when dayCount matches 30/360 actuarial rule", () => {
    const res = validateCalculationDraft(
      baseDraft({
        disability: { permanentDisabilityRate: 35, disabilityStartDate: "2021-06-09" },
        temporaryIncapacityPeriods: [
          { id: "t1", startDate: "2020-06-01", endDate: "2021-06-08", dayCount: 360 },
        ],
      })
    );
    expect(res.warnings.filter((w) => w.code === "DAY_COUNT_MISMATCH")).toHaveLength(0);
  });

  it("warns DAY_COUNT_MISMATCH when dayCount differs from temporary period calendar rule", () => {
    const res = validateCalculationDraft(
      baseDraft({
        temporaryIncapacityPeriods: [
          { id: "t1", startDate: "2020-06-01", endDate: "2020-08-31", dayCount: 93 },
        ],
      })
    );
    expect(res.warnings.some((w) => w.code === "DAY_COUNT_MISMATCH")).toBe(true);
    expect(res.warnings.some((w) => w.message.includes("(92)"))).toBe(true);
  });
});
