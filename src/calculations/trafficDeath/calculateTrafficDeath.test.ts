import { describe, expect, it } from "vitest";
import { CALCULATION_SCHEMA_VERSION } from "../types.js";
import type { TrafficDeathDraft } from "../types.js";
import { calculateTrafficDeath } from "./calculateTrafficDeath.js";
import { validateTrafficDeathDraft } from "../validateTrafficDeath.js";
import { hashCalculationInput } from "../hash/calculationInputHash.js";
import { calculateTrafficDeathSupportPeriods } from "./supportPeriods/calculateSupportPeriods.js";
import { actuarialDays360Inclusive } from "../trafficInjury/dayCount360.js";
import { addDaysIso } from "../trafficInjury/dateUtils.js";
import { applyFault } from "../trafficInjury/applyFault.js";
import { roundMoney } from "../trafficInjury/money.js";
import { accrueClaimantLegalPayment } from "../trafficInjury/calculateInsuranceDeductions.js";

function baseDraft(over: Partial<TrafficDeathDraft> = {}): TrafficDeathDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_DEATH",
    common: { eventDate: "2020-06-01", calculationDate: "2024-01-15" },
    deceased: {
      birthDate: "1970-01-01",
      deathDate: "2020-06-01",
      gender: "male",
      fullName: "Ahmet",
    },
    employmentStatus: "WORKING",
    deceasedFamilyInfo: {
      maritalStatus: "MARRIED",
      militaryStatus: "COMPLETED",
      militaryServiceStartDate: "1990-01-01",
      militaryServiceDurationMonths: 12,
      educationStatus: "graduate",
      hasChildren: false,
      childrenCount: 0,
      children: [],
    },
    accidentIncome: { incomeMode: "fixed", fixedAmount: 9000, averageSources: [] },
    nonWorkingSelectedIncome: null,
    incomePeriods: [],
    beneficiaries: [
      {
        id: "sp",
        fullName: "Ayşe",
        relation: "spouse",
        birthDate: "1975-01-01",
        gender: "female",
        claimantStatus: "PLAINTIFF",
      },
    ],
    supportRelations: [],
    liability: { injuredFaultRatio: 0, parties: [] },
    deceasedFaultRate: 0,
    responsibleParties: [],
    externalFaultRate: 0,
    deathExpenses: { otherExpenses: [] },
    priorPayments: [],
    insurance: {},
    ...over,
  };
}

describe("calculateTrafficDeath monetary motor", () => {
  it("A) single spouse produces processed + future losses", () => {
    const result = calculateTrafficDeath(baseDraft());
    expect(result.calculationType).toBe("TRAFFIC_DEATH");
    expect(result.processedTotal).toBeGreaterThan(0);
    expect(result.futureTotal).toBeGreaterThan(0);
    expect(result.claimantLosses.some((c) => c.claimantId === "sp")).toBe(true);
    expect(result.claimantLosses.some((c) => c.claimantId === "deceased")).toBe(false);
    expect(result.dailyNetIncome).toBeGreaterThan(0);
    expect(result.resolvedIncome.monthlyNetAtEvent).toBe(9000);
  });

  it("B) spouse + child applies period share changes", () => {
    const draft = baseDraft({
      deceasedFamilyInfo: {
        maritalStatus: "MARRIED",
        militaryStatus: "COMPLETED",
        militaryServiceStartDate: "1990-01-01",
        militaryServiceDurationMonths: 12,
        educationStatus: "graduate",
        hasChildren: true,
        childrenCount: 1,
        children: [{ id: "ch1", gender: "male", educationLevel: "high" }],
      },
      beneficiaries: [
        {
          id: "sp",
          fullName: "Ayşe",
          relation: "spouse",
          birthDate: "1975-01-01",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "ch",
          fullName: "Ali",
          relation: "child",
          birthDate: "2010-01-01",
          gender: "male",
          claimantStatus: "PLAINTIFF",
        },
      ],
    });
    const support = calculateTrafficDeathSupportPeriods(draft);
    const result = calculateTrafficDeath(draft);
    expect(result.claimantLosses.map((c) => c.claimantId).sort()).toEqual(
      expect.arrayContaining(["sp", "ch"])
    );
    // Pay motor percentages reused — first active period shares present on monetary rows
    const firstPast = result.processedPeriods[0];
    expect(firstPast?.sharePercentage).toBeGreaterThan(0);
    expect(support.shareRatioPeriods.length).toBe(result.shareRatioPeriods.length);
  });

  it("C) child support end changes later period rates", () => {
    const draft = baseDraft({
      common: { eventDate: "2020-06-01", calculationDate: "2020-06-15" },
      deceasedFamilyInfo: {
        maritalStatus: "MARRIED",
        militaryStatus: "COMPLETED",
        militaryServiceStartDate: "1990-01-01",
        militaryServiceDurationMonths: 12,
        educationStatus: "graduate",
        hasChildren: true,
        childrenCount: 1,
        children: [{ id: "ch1", gender: "male", educationLevel: "high" }],
      },
      beneficiaries: [
        {
          id: "sp",
          fullName: "Ayşe",
          relation: "spouse",
          birthDate: "1975-01-01",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "ch",
          fullName: "Ali",
          relation: "child",
          birthDate: "2005-01-01",
          gender: "male",
          claimantStatus: "PLAINTIFF",
        },
      ],
    });
    const result = calculateTrafficDeath(draft);
    const childRates = [
      ...new Set(
        [...result.processedPeriods, ...result.futurePeriods]
          .filter((r) => r.claimantId === "ch")
          .map((r) => r.sharePercentage)
      ),
    ];
    const spouseOnlyFuture = result.futurePeriods.filter(
      (r) => r.claimantId === "sp" && !result.futurePeriods.some(
        (o) => o.claimantId === "ch" && o.startDate === r.startDate && o.endDate === r.endDate
      )
    );
    expect(childRates.length + spouseOnlyFuture.length).toBeGreaterThan(0);
  });

  it("E) deceased fault 35% is applied once per claimant, not again on the total", () => {
    const zero = calculateTrafficDeath(baseDraft({ deceasedFaultRate: 0 }));
    const faulted = calculateTrafficDeath(baseDraft({ deceasedFaultRate: 35 }));
    expect(faulted.deceasedFaultRate).toBe(35);
    expect(zero.claimantLosses.every((c) => c.lossAfterDeceasedFault === c.totalLoss)).toBe(true);
    for (const row of faulted.claimantLosses) {
      expect(row.lossAfterDeceasedFault).toBe(applyFault(row.totalLoss, 35).totalAfterFault);
    }
    const summed = roundMoney(
      faulted.claimantLosses.reduce((s, c) => s + (c.lossAfterDeceasedFault ?? 0), 0)
    );
    expect(faulted.totalAfterFault).toBe(summed);
    expect(faulted.totalAfterFault).not.toBe(applyFault(summed, 35).totalAfterFault);
    const afterMarriage = roundMoney(
      faulted.claimantLosses.reduce((s, c) => s + (c.lossAfterMarriageProbability ?? 0), 0)
    );
    expect(faulted.totalAfterMarriageProbability).toBe(afterMarriage);
    expect(faulted.finalCompensation).toBe(
      roundMoney(
        Math.max(
          0,
          afterMarriage + faulted.deathExpenses.total - (faulted.priorPaymentsApplied ? faulted.priorPaymentsTotal : 0)
        )
      )
    );
  });

  it("education notes do not change the death result or hash", () => {
    const plain = baseDraft();
    const withNotes = baseDraft({
      marriageProbabilityDeduction: { under18ChildCount: 0, note: "not" },
      educationExpenseDeduction: { notes: "eğitim notu" },
    });
    const a = calculateTrafficDeath(plain);
    const b = calculateTrafficDeath(withNotes);
    expect(b.totalSupportLoss).toBe(a.totalSupportLoss);
    expect(b.totalAfterFault).toBe(a.totalAfterFault);
    expect(b.finalCompensation).toBe(a.finalCompensation);
    expect(hashCalculationInput(withNotes)).toBe(hashCalculationInput(plain));
  });

  it("applies remarriage probability only to the spouse and floors the rate at 0", () => {
    const woman = baseDraft({
      beneficiaries: [
        {
          id: "sp",
          fullName: "Ayşe",
          relation: "spouse",
          birthDate: "1990-01-01",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "ch",
          fullName: "Çocuk",
          relation: "child",
          birthDate: "2010-01-01",
          gender: "male",
          claimantStatus: "PLAINTIFF",
        },
      ],
      marriageProbabilityDeduction: { under18ChildCount: 0 },
    });
    const zeroChildren = calculateTrafficDeath(woman);
    expect(zeroChildren.marriageProbability?.spouseAgeRangeKey).toBe("31-35");
    expect(zeroChildren.marriageProbability?.baseMarriageProbabilityRate).toBe(17);
    expect(zeroChildren.marriageProbability?.finalMarriageProbabilityRate).toBe(17);

    const twoChildren = calculateTrafficDeath({
      ...woman,
      marriageProbabilityDeduction: { under18ChildCount: 2 },
    });
    expect(twoChildren.marriageProbability?.finalMarriageProbabilityRate).toBe(7);
    const spouse = twoChildren.claimantLosses.find((c) => c.claimantId === "sp");
    const child = twoChildren.claimantLosses.find((c) => c.claimantId === "ch");
    expect(spouse).toBeTruthy();
    expect(child).toBeTruthy();
    expect(spouse?.marriageProbabilityApplied).toBe(true);
    expect(spouse?.lossAfterMarriageProbability).toBe(
      roundMoney((spouse?.lossAfterDeceasedFault ?? 0) * 0.93)
    );
    expect(child?.marriageProbabilityApplied).toBe(false);
    expect(child?.lossAfterMarriageProbability).toBe(child?.lossAfterDeceasedFault);
    expect(twoChildren.totalAfterMarriageProbability).toBe(
      roundMoney(twoChildren.claimantLosses.reduce((s, c) => s + (c.lossAfterMarriageProbability ?? 0), 0))
    );
    expect(twoChildren.finalCompensation).toBe(
      roundMoney(
        Math.max(
          0,
          (twoChildren.totalAfterMarriageProbability ?? 0) +
            twoChildren.deathExpenses.total -
            (twoChildren.priorPaymentsApplied ? twoChildren.priorPaymentsTotal : 0)
        )
      )
    );
    expect(
      hashCalculationInput({ ...woman, marriageProbabilityDeduction: { under18ChildCount: 2 } })
    ).not.toBe(hashCalculationInput(woman));

    const man = calculateTrafficDeath(
      baseDraft({
        beneficiaries: [
          {
            id: "sp",
            fullName: "Ali",
            relation: "spouse",
            birthDate: "2000-01-01",
            gender: "male",
            claimantStatus: "PLAINTIFF",
          },
        ],
        marriageProbabilityDeduction: { under18ChildCount: 1 },
      })
    );
    expect(man.marriageProbability?.baseMarriageProbabilityRate).toBe(71);
    expect(man.marriageProbability?.finalMarriageProbabilityRate).toBe(66);

    const floored = calculateTrafficDeath(
      baseDraft({
        marriageProbabilityDeduction: { under18ChildCount: 1 },
      })
    );
    expect(floored.marriageProbability?.baseMarriageProbabilityRate).toBe(2);
    expect(floored.marriageProbability?.finalMarriageProbabilityRate).toBe(0);
    expect(floored.claimantLosses.every((c) => c.lossAfterMarriageProbability === c.lossAfterDeceasedFault)).toBe(true);

    const noSpouse = calculateTrafficDeath(
      baseDraft({
        beneficiaries: [
          {
            id: "mo",
            fullName: "Anne",
            relation: "mother",
            birthDate: "1950-01-01",
            gender: "female",
            claimantStatus: "PLAINTIFF",
          },
        ],
      })
    );
    expect(noSpouse.marriageProbability?.applied).toBe(false);
    expect(noSpouse.marriageProbability?.finalMarriageProbabilityRate).toBe(0);
    expect(noSpouse.totalAfterMarriageProbability).toBe(noSpouse.totalAfterFault);
  });

  it("claimant fault examples: 35%, 0% and 100% stay on each totalLoss", () => {
    expect(applyFault(700_000, 35).totalAfterFault).toBe(455_000);
    expect(applyFault(400_000, 35).totalAfterFault).toBe(260_000);
    expect(roundMoney(455_000 + 260_000)).toBe(715_000);
    expect(applyFault(700_000, 0).totalAfterFault).toBe(700_000);
    expect(applyFault(400_000, 100).totalAfterFault).toBe(0);

    const full = calculateTrafficDeath(baseDraft({ deceasedFaultRate: 100 }));
    expect(full.claimantLosses.every((c) => c.lossAfterDeceasedFault === 0)).toBe(true);
    expect(full.totalAfterFault).toBe(0);
  });

  it("F) deceased 2-share never becomes claimant loss", () => {
    const result = calculateTrafficDeath(
      baseDraft({
        beneficiaries: [
          {
            id: "sp",
            fullName: "Ayşe",
            relation: "spouse",
            birthDate: "1975-01-01",
            gender: "female",
            claimantStatus: "PLAINTIFF",
          },
          {
            id: "mo",
            fullName: "Fatma",
            relation: "mother",
            birthDate: "1945-01-01",
            gender: "female",
            claimantStatus: "PLAINTIFF",
          },
          {
            id: "fa",
            fullName: "Mehmet",
            relation: "father",
            birthDate: "1940-01-01",
            gender: "male",
            claimantStatus: "PLAINTIFF",
          },
        ],
      })
    );
    expect(result.claimantLosses.every((c) => c.claimantId !== "deceased")).toBe(true);
    expect(result.processedPeriods.every((r) => r.claimantId !== "deceased")).toBe(true);
    expect(result.futurePeriods.every((r) => r.claimantId !== "deceased")).toBe(true);
  });

  it("G) share percentages match supportPeriods motor", () => {
    const draft = baseDraft({
      beneficiaries: [
        {
          id: "sp",
          fullName: "Ayşe",
          relation: "spouse",
          birthDate: "1975-01-01",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "mo",
          fullName: "Fatma",
          relation: "mother",
          birthDate: "1945-01-01",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "fa",
          fullName: "Mehmet",
          relation: "father",
          birthDate: "1940-01-01",
          gender: "male",
          claimantStatus: "PLAINTIFF",
        },
      ],
    });
    const support = calculateTrafficDeathSupportPeriods(draft);
    const result = calculateTrafficDeath(draft);
    expect(result.shareRatioPeriods).toEqual(support.shareRatioPeriods);
    const firstActive = support.periods.find((p) => p.supportActive && p.shares.sp);
    expect(firstActive).toBeTruthy();
    const moneyRow = result.processedPeriods.find(
      (r) =>
        r.claimantId === "sp" &&
        r.startDate === firstActive!.startDate
    );
    if (moneyRow) {
      expect(moneyRow.sharePercentage).toBe(firstActive!.shares.sp!.percentage);
      expect(moneyRow.shareFraction).toBe(firstActive!.shares.sp!.fraction);
    }
  });

  it("H) calculation date boundary does not duplicate days", () => {
    const draft = baseDraft({
      common: { eventDate: "2020-06-01", calculationDate: "2022-06-01" },
    });
    const result = calculateTrafficDeath(draft);
    const calcDate = draft.common.calculationDate;
    const futureStart = addDaysIso(calcDate, 1);
    expect(result.processedPeriods.every((r) => r.endDate <= calcDate)).toBe(true);
    expect(result.futurePeriods.every((r) => r.startDate >= futureStart)).toBe(true);
    // no overlapping inclusive day between last processed end and first future start
    for (const p of result.processedPeriods) {
      for (const f of result.futurePeriods) {
        expect(p.endDate < f.startDate || p.startDate > f.endDate).toBe(true);
      }
    }
  });

  it("day count uses actuarial 360 helper", () => {
    expect(actuarialDays360Inclusive("2020-01-01", "2020-06-30")).toBe(180);
    expect(actuarialDays360Inclusive("2020-07-01", "2020-12-31")).toBe(180);
  });

  it("I) result snapshot shape is restorable", () => {
    const result = calculateTrafficDeath(baseDraft({ deceasedFaultRate: 20 }));
    const json = JSON.parse(JSON.stringify(result)) as typeof result;
    expect(json.calculationType).toBe("TRAFFIC_DEATH");
    expect(json.claimantLosses.length).toBeGreaterThan(0);
    expect(json.personLives).toBeTruthy();
    expect(json.shareRatioPeriods.length).toBeGreaterThan(0);
    expect(json.claimantLosses.every((c) => typeof c.lossAfterDeceasedFault === "number")).toBe(true);
    expect(json.claimantLosses.every((c) => typeof c.lossAfterMarriageProbability === "number")).toBe(true);
    expect(json.marriageProbability?.spouseName).toBe("Ayşe");
    expect(json.marriageProbability?.finalMarriageProbabilityRate).toBe(2);
    expect(json.totalAfterFault).toBe(
      roundMoney(json.claimantLosses.reduce((s, c) => s + (c.lossAfterDeceasedFault ?? 0), 0))
    );
  });

  it("J) future/processed periods never extend past deceased probable life end", () => {
    const draft = baseDraft({
      deceased: {
        birthDate: "1946-02-20",
        deathDate: "2024-04-15",
        gender: "male",
        fullName: "Müteveffa",
      },
      common: { eventDate: "2024-04-15", calculationDate: "2026-09-02" },
      deceasedFamilyInfo: {
        maritalStatus: "MARRIED",
        militaryStatus: "COMPLETED",
        militaryServiceStartDate: "1966-01-01",
        militaryServiceDurationMonths: 12,
        educationStatus: "graduate",
        hasChildren: true,
        childrenCount: 1,
        children: [],
      },
      beneficiaries: [
        {
          id: "sp",
          fullName: "Yüksel Ergin",
          relation: "spouse",
          birthDate: "1950-05-15",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "ebru",
          fullName: "Ebru Aydın",
          relation: "child",
          birthDate: "2011-05-20",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
      ],
    });

    const result = calculateTrafficDeath(draft);
    const deceasedEnd = result.personLives.find(
      (p) => (p as { role?: string }).role === "DECEASED" || (p as { personId?: string }).personId === "deceased"
    ) as { probableLifeEndDate?: string } | undefined;
    // personLives may be raw profiles
    const end =
      deceasedEnd?.probableLifeEndDate ??
      (result.personLives as Array<{ role?: string; probableLifeEndDate?: string }>).find(
        (p) => p.role === "DECEASED"
      )?.probableLifeEndDate;
    expect(end).toBe("2031-02-07");

    for (const row of result.processedPeriods) {
      expect(row.endDate <= end!).toBe(true);
    }
    for (const row of result.futurePeriods) {
      expect(row.endDate <= end!).toBe(true);
    }
    for (const period of result.shareRatioPeriods) {
      expect(period.endDate <= end!).toBe(true);
      expect(period.startDate <= end!).toBe(true);
    }
    expect(result.shareRatioPeriods.some((p) => p.startDate > end!)).toBe(false);
  });

  it("K) /calculations/run contract: 15.04.2024 + 6y9m22d => probableLifeEndDate 2031-02-07", () => {
    const draft = baseDraft({
      deceased: {
        birthDate: "1946-02-20",
        deathDate: "2024-04-15",
        gender: "male",
        fullName: "Müteveffa",
      },
      common: { eventDate: "2024-04-15", calculationDate: "2026-09-02" },
      deceasedFamilyInfo: {
        maritalStatus: "MARRIED",
        militaryStatus: "COMPLETED",
        militaryServiceStartDate: "1966-01-01",
        militaryServiceDurationMonths: 12,
        educationStatus: "graduate",
        hasChildren: true,
        childrenCount: 1,
        children: [],
      },
      beneficiaries: [
        {
          id: "sp",
          fullName: "Eş",
          relation: "spouse",
          birthDate: "1950-05-15",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
      ],
      deceasedFaultRate: 100,
    });

    // Same motor bound by POST /calculations/run
    const result = calculateTrafficDeath(draft);
    const deceased = (result.personLives as Array<{
      role?: string;
      personId?: string;
      remainingLifetime?: { years: number; months: number; days: number };
      probableLifeEndDate?: string;
    }>).find((p) => p.role === "DECEASED" || p.personId === "deceased");

    expect(deceased?.remainingLifetime).toMatchObject({ years: 6, months: 9, days: 22 });
    expect(deceased?.probableLifeEndDate).toBe("2031-02-07");
    expect(deceased?.probableLifeEndDate).not.toBe("2031-02-06");
  });

  it("L) deceased life end 07.02.2031 is inclusive last pay/future day; no empty 07.02 marker row", () => {
    const draft = baseDraft({
      deceased: {
        birthDate: "1946-02-20",
        deathDate: "2024-04-15",
        gender: "male",
        fullName: "Müteveffa",
      },
      common: { eventDate: "2024-04-15", calculationDate: "2026-09-02" },
      deceasedFamilyInfo: {
        maritalStatus: "MARRIED",
        militaryStatus: "COMPLETED",
        militaryServiceStartDate: "1966-01-01",
        militaryServiceDurationMonths: 12,
        educationStatus: "graduate",
        hasChildren: true,
        childrenCount: 1,
        children: [],
      },
      beneficiaries: [
        {
          id: "sp",
          fullName: "Yüksel Ergin",
          relation: "spouse",
          birthDate: "1950-05-15",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "ebru",
          fullName: "Ebru Aydın",
          relation: "child",
          birthDate: "2011-05-20",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
      ],
      deceasedFaultRate: 100,
    });

    const result = calculateTrafficDeath(draft);
    const end = "2031-02-07";

    const lastShare = result.shareRatioPeriods.at(-1);
    expect(lastShare?.endDate).toBe(end);
    expect(Object.keys(lastShare?.shares ?? {}).length).toBeGreaterThan(0);
    expect(
      result.shareRatioPeriods.some(
        (p) => p.startDate === end && Object.keys(p.shares).length === 0
      )
    ).toBe(false);
    expect(result.shareRatioPeriods.some((p) => p.startDate > end)).toBe(false);
    expect(result.shareRatioPeriods.some((p) => p.endDate > end)).toBe(false);

    const maxFutureEnd = result.futurePeriods.reduce(
      (m, r) => (r.endDate > m ? r.endDate : m),
      "0000-01-01"
    );
    expect(maxFutureEnd).toBe(end);
    expect(result.futurePeriods.some((r) => r.endDate === end)).toBe(true);
    expect(result.futurePeriods.some((r) => r.startDate > end || r.endDate > end)).toBe(false);
    expect(result.futurePeriods.some((r) => r.startDate >= "2031-02-08")).toBe(false);

    const jan2031Row = result.futurePeriods.find(
      (r) => r.startDate === "2031-01-01" || (r.startDate <= "2031-01-01" && r.endDate >= "2031-01-01")
    );
    if (jan2031Row) {
      expect(jan2031Row.endDate).toBe(end);
    }
  });
});

describe("TRAFFIC_DEATH sigorta kart mahsubu", () => {
  it("sosyal yardım does not change money or hash", () => {
    const plain = baseDraft();
    const withAid = baseDraft({
      sosyalYardimOdenekleri: [{ id: "s", amount: 50000, notes: "yardım" }],
    });
    const a = calculateTrafficDeath(plain);
    const b = calculateTrafficDeath(withAid);
    expect(b.finalCompensation).toBe(a.finalCompensation);
    expect(b.totalSupportLoss).toBe(a.totalSupportLoss);
    expect(b.insuranceDeductions).toBeUndefined();
    expect(hashCalculationInput(withAid)).toBe(hashCalculationInput(plain));
  });

  it("keeps legacy priorPayments when the new cards are missing or empty", () => {
    const legacy = calculateTrafficDeath(
      baseDraft({ priorPayments: [{ id: "old", amount: 1000 }] })
    );
    const emptyCards = calculateTrafficDeath(
      baseDraft({
        priorPayments: [{ id: "old", amount: 1000 }],
        capitalValueDocuments: [],
        zmtsPayments: [],
        cascoPayments: [],
      })
    );
    const afterMarriage = legacy.totalAfterMarriageProbability ?? 0;
    expect(legacy.psdTotal).toBeUndefined();
    expect(legacy.finalCompensation).toBe(
      roundMoney(Math.max(0, afterMarriage + legacy.deathExpenses.total - 1000))
    );
    expect(emptyCards.finalCompensation).toBe(legacy.finalCompensation);
    expect(emptyCards.priorPaymentsTotal).toBe(1000);
  });

  it("deducts PSD after fault and does not also deduct priorPayments", () => {
    const plain = calculateTrafficDeath(baseDraft({ deceasedFaultRate: 0 }));
    const withPsd = calculateTrafficDeath(
      baseDraft({
        deceasedFaultRate: 0,
        priorPayments: [{ id: "old", amount: 5000 }],
        capitalValueDocuments: [{ id: "psd", amount: 1000 }],
      })
    );
    expect(withPsd.psdDeductibleAfterFault).toBe(1000);
    expect(withPsd.totalAfterCapitalValue).toBe(
      roundMoney((withPsd.totalAfterMarriageProbability ?? 0) - 1000)
    );
    expect(withPsd.finalCompensation).toBe(roundMoney(plain.finalCompensation - 1000));
    expect(withPsd.finalCompensation).not.toBe(roundMoney(plain.finalCompensation - 6000));
    expect(withPsd.totalSupportLoss).toBe(plain.totalSupportLoss);
    expect(hashCalculationInput(baseDraft({ capitalValueDocuments: [{ id: "psd", amount: 1000 }] }))).not.toBe(
      hashCalculationInput(baseDraft())
    );
  });

  it("applies deceased fault to the PSD deductible only once", () => {
    const faulted = calculateTrafficDeath(
      baseDraft({
        deceasedFaultRate: 35,
        capitalValueDocuments: [{ id: "psd", amount: 1000 }],
      })
    );
    expect(faulted.psdDeductibleAfterFault).toBe(650);
    const afterMarriage = faulted.totalAfterMarriageProbability ?? 0;
    expect(faulted.finalCompensation).toBe(
      roundMoney(Math.max(0, afterMarriage + faulted.deathExpenses.total - 650))
    );
  });

  it("floors PSD against support, then still adds death expenses", () => {
    const result = calculateTrafficDeath(
      baseDraft({
        deceasedFaultRate: 0,
        deathExpenses: { funeralCost: 20, otherExpenses: [] },
        priorPayments: [{ id: "old", amount: 10000 }],
        capitalValueDocuments: [{ id: "psd", amount: 50_000_000 }],
      })
    );
    expect(result.totalAfterCapitalValue).toBe(0);
    expect(result.finalCompensation).toBe(20);
  });

  it("deducts linked ZMTS principal plus legal interest once and ignores priorPayments", () => {
    const plain = calculateTrafficDeath(baseDraft());
    const withZmts = calculateTrafficDeath(
      baseDraft({
        priorPayments: [{ id: "old", amount: 4000 }],
        zmtsPayments: [
          {
            id: "z",
            paymentDate: "2023-01-01",
            paymentAmount: 1000,
            liabilityLimit: 0,
            claimantId: "sp",
          },
        ],
      })
    );
    const updated = accrueClaimantLegalPayment(1000, "2023-01-01", "2024-01-15");
    const spouse = withZmts.claimantLosses.find((c) => c.claimantId === "sp");
    expect(updated.legalInterestAmount).toBeGreaterThan(0);
    expect(spouse?.updatedZmtsPaymentAmount).toBe(updated.updatedAmount);
    expect(withZmts.updatedZmtsPaymentTotal).toBe(updated.updatedAmount);
    expect(withZmts.insuranceDeductions).toBeUndefined();
    expect(withZmts.finalCompensation).toBe(roundMoney(plain.finalCompensation - updated.updatedAmount));
    expect(withZmts.finalCompensation).toBeGreaterThan(plain.finalCompensation - updated.updatedAmount - 4000);
  });

  it("keeps the claimant link without changing the aggregate ZMTS deduction", () => {
    const payment = {
      id: "z",
      paymentDate: "2023-01-01",
      paymentAmount: 1000,
      liabilityLimit: 0,
    };
    const unlinked = calculateTrafficDeath(baseDraft({ zmtsPayments: [payment] }));
    const linked = calculateTrafficDeath(
      baseDraft({
        zmtsPayments: [
          { ...payment, claimantId: "sp", claimantName: "Ayşe", claimantRelation: "spouse" },
        ],
      })
    );
    const updated = accrueClaimantLegalPayment(1000, "2023-01-01", "2024-01-15");
    expect(linked.finalCompensation).toBe(roundMoney(unlinked.finalCompensation - updated.updatedAmount));
    expect(linked.claimantLosses.find((c) => c.claimantId === "sp")?.updatedZmtsPaymentAmount).toBe(
      updated.updatedAmount
    );
    expect(unlinked.claimantLosses.every((c) => (c.updatedZmtsPaymentAmount ?? 0) === 0)).toBe(true);

    const stale = calculateTrafficDeath(
      baseDraft({
        zmtsPayments: [
          { ...payment, claimantId: "silinen", claimantName: "Ebru", claimantRelation: "spouse" },
        ],
      })
    );
    expect(stale.finalCompensation).toBe(unlinked.finalCompensation);
    expect(stale.claimantLosses.some((c) => c.claimantId === "silinen")).toBe(false);
    expect(stale.claimantLosses.every((c) => (c.updatedZmtsPaymentAmount ?? 0) === 0)).toBe(true);

    expect(
      hashCalculationInput(
        baseDraft({
          zmtsPayments: [{ ...payment, claimantId: "ali-1", claimantName: "Ali", claimantRelation: "child" }],
        })
      )
    ).not.toBe(
      hashCalculationInput(
        baseDraft({
          zmtsPayments: [{ ...payment, claimantId: "ali-2", claimantName: "Ali", claimantRelation: "child" }],
        })
      )
    );
  });

  it("requires a current plaintiff on a ZMTS row and does not reassign it", () => {
    const missing = validateTrafficDeathDraft(
      baseDraft({
        zmtsPayments: [{ id: "z", paymentDate: "2023-01-01", paymentAmount: 1000, liabilityLimit: 0 }],
      })
    );
    expect(
      missing.errors.some(
        (e) => e.field === "zmtsPayments[0].claimantId" && e.message === "Ödemenin yapıldığı hak sahibini seçin."
      )
    ).toBe(true);

    const blank = validateTrafficDeathDraft(
      baseDraft({
        zmtsPayments: [{ id: "z", paymentDate: "", paymentAmount: 0, liabilityLimit: 0 }],
      })
    );
    expect(blank.errors.some((e) => e.field.startsWith("zmtsPayments"))).toBe(false);

    const draft = baseDraft({
      beneficiaries: [
        {
          id: "ebru",
          fullName: "Ebru Aydın",
          relation: "spouse",
          birthDate: "1975-01-01",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "ahmet",
          fullName: "Ahmet Aydın",
          relation: "child",
          birthDate: "2010-01-01",
          gender: "male",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "mehmet",
          fullName: "Mehmet",
          relation: "father",
          birthDate: "1950-01-01",
          gender: "male",
          claimantStatus: "OUT_OF_CASE",
        },
      ],
      zmtsPayments: [
        {
          id: "z",
          paymentDate: "2023-01-01",
          paymentAmount: 250000,
          liabilityLimit: 0,
          claimantId: "mehmet",
          claimantName: "Mehmet",
          claimantRelation: "father",
        },
      ],
    });
    const stale = validateTrafficDeathDraft(draft);
    expect(stale.errors.some((e) => e.message.includes("artık davacı değil"))).toBe(true);
    expect(draft.zmtsPayments?.[0]?.claimantId).toBe("mehmet");

    const ok = validateTrafficDeathDraft(
      baseDraft({
        zmtsPayments: [
          {
            id: "z",
            paymentDate: "2023-01-01",
            paymentAmount: 1000,
            liabilityLimit: 0,
            claimantId: "sp",
            claimantName: "Ayşe",
            claimantRelation: "spouse",
          },
        ],
      })
    );
    expect(ok.errors.filter((e) => e.field.startsWith("zmtsPayments"))).toEqual([]);
  });

  it("keeps person garame amounts out of the ZMTS deduction", () => {
    const payment = {
      id: "z",
      paymentDate: "2023-01-01",
      paymentAmount: 1000,
      liabilityLimit: 0,
      claimantId: "sp",
    };
    const plain = calculateTrafficDeath(baseDraft({ zmtsPayments: [payment] }));
    const garame = calculateTrafficDeath(
      baseDraft({
        zmtsPayments: [
          {
            ...payment,
            garameEnabled: true,
            deathGarameRows: [
              {
                claimantId: "sp",
                claimantStatus: "PLAINTIFF",
                claimantRelation: "spouse",
                paymentDate: "2023-06-01",
                paymentAmount: 5000,
                liabilityLimit: 100,
                accidentLimit: 200,
              },
            ],
          },
        ],
      })
    );
    const person = accrueClaimantLegalPayment(5000, "2023-06-01", "2024-01-15");
    const none = calculateTrafficDeath(baseDraft());
    expect(garame.finalCompensation).toBe(roundMoney(none.finalCompensation - person.updatedAmount));
    expect(garame.finalCompensation).not.toBe(plain.finalCompensation);
    expect(garame.claimantLosses.find((c) => c.claimantId === "sp")?.updatedZmtsPaymentAmount).toBe(
      person.updatedAmount
    );
    expect(garame.claimantLosses.find((c) => c.claimantId === "sp")?.zmtsPaymentDetails?.[0]?.principal).toBe(5000);
  });

  it("keeps person garame amounts out of the Kasko deduction", () => {
    const payment = {
      id: "k",
      paymentDate: "2023-01-01",
      paymentAmount: 1000,
      liabilityLimit: 0,
    };
    const plain = calculateTrafficDeath(baseDraft({ cascoPayments: [payment] }));
    const garame = calculateTrafficDeath(
      baseDraft({
        cascoPayments: [
          {
            ...payment,
            garameEnabled: true,
            deathGarameRows: [
              {
                claimantId: "sp",
                claimantStatus: "PLAINTIFF",
                claimantRelation: "spouse",
                paymentDate: "2023-06-01",
                paymentAmount: 5000,
                liabilityLimit: 100,
                accidentLimit: 200,
              },
            ],
          },
        ],
      })
    );
    const person = accrueClaimantLegalPayment(5000, "2023-06-01", "2024-01-15");
    const none = calculateTrafficDeath(baseDraft());
    expect(garame.finalCompensation).toBe(roundMoney(none.finalCompensation - person.updatedAmount));
    expect(garame.finalCompensation).not.toBe(plain.finalCompensation);
    expect(garame.claimantLosses.find((c) => c.claimantId === "sp")?.updatedCascoPaymentAmount).toBe(
      person.updatedAmount
    );
    expect(
      hashCalculationInput(
        baseDraft({
          cascoPayments: [{ ...payment, garameEnabled: true, deathGarameRows: [{ claimantId: "sp", paymentAmount: 10 }] }],
        })
      )
    ).not.toBe(
      hashCalculationInput(
        baseDraft({
          cascoPayments: [{ ...payment, garameEnabled: true, deathGarameRows: [{ claimantId: "ayse", paymentAmount: 10 }] }],
        })
      )
    );

    const checked = validateTrafficDeathDraft(
      baseDraft({
        cascoPayments: [
          {
            id: "k",
            paymentDate: "",
            paymentAmount: 0,
            liabilityLimit: 0,
            garameEnabled: true,
            deathGarameRows: [
              { claimantId: "sp", paymentAmount: -20, paymentDate: "2023-01-01", liabilityLimit: 0, accidentLimit: 0 },
            ],
          },
        ],
      })
    );
    expect(checked.errors.some((e) => e.field === "cascoPayments[0].claimantId")).toBe(false);
    expect(checked.errors.some((e) => e.message === "Ödeme miktarı negatif olamaz.")).toBe(true);
  });

  it("requires a current plaintiff on a normal Kasko row and keeps the link off the deduction", () => {
    const missing = validateTrafficDeathDraft(
      baseDraft({
        cascoPayments: [{ id: "k", paymentDate: "2023-01-01", paymentAmount: 1000, liabilityLimit: 0 }],
      })
    );
    expect(
      missing.errors.some(
        (e) => e.field === "cascoPayments[0].claimantId" && e.message === "Ödemenin yapıldığı hak sahibini seçin."
      )
    ).toBe(true);

    const blank = validateTrafficDeathDraft(
      baseDraft({
        cascoPayments: [{ id: "k", paymentDate: "", paymentAmount: 0, liabilityLimit: 0 }],
      })
    );
    expect(blank.errors.some((e) => e.field.startsWith("cascoPayments"))).toBe(false);

    const draft = baseDraft({
      beneficiaries: [
        {
          id: "ebru",
          fullName: "Ebru",
          relation: "spouse",
          birthDate: "1975-01-01",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "ayse",
          fullName: "Ayşe",
          relation: "mother",
          birthDate: "1955-01-01",
          gender: "female",
          claimantStatus: "OUT_OF_CASE",
        },
      ],
      cascoPayments: [
        {
          id: "k",
          paymentDate: "2023-01-01",
          paymentAmount: 250000,
          liabilityLimit: 0,
          claimantId: "ayse",
          claimantName: "Ayşe",
          claimantRelation: "mother",
        },
      ],
    });
    const stale = validateTrafficDeathDraft(draft);
    expect(stale.errors.some((e) => e.field === "cascoPayments[0].claimantId" && e.message.includes("artık davacı değil"))).toBe(true);
    expect(draft.cascoPayments?.[0]?.claimantId).toBe("ayse");

    const payment = { id: "k", paymentDate: "2023-01-01", paymentAmount: 1000, liabilityLimit: 0 };
    const unlinked = calculateTrafficDeath(baseDraft({ cascoPayments: [payment] }));
    const linked = calculateTrafficDeath(
      baseDraft({
        cascoPayments: [{ ...payment, claimantId: "sp", claimantName: "Ayşe", claimantRelation: "spouse" }],
      })
    );
    const updated = accrueClaimantLegalPayment(1000, "2023-01-01", "2024-01-15");
    expect(linked.finalCompensation).toBe(roundMoney(unlinked.finalCompensation - updated.updatedAmount));
    expect(linked.claimantLosses.find((c) => c.claimantId === "sp")?.updatedCascoPaymentAmount).toBe(
      updated.updatedAmount
    );
    expect(unlinked.claimantLosses.every((c) => (c.updatedCascoPaymentAmount ?? 0) === 0)).toBe(true);
  });

  it("validates garame person rows and does not require the parent claimant", () => {
    const beneficiaries = [
      {
        id: "ebru",
        fullName: "Ebru",
        relation: "spouse" as const,
        birthDate: "1975-01-01",
        gender: "female" as const,
        claimantStatus: "PLAINTIFF" as const,
      },
      {
        id: "ali",
        fullName: "Ali",
        relation: "child" as const,
        birthDate: "2010-01-01",
        gender: "male" as const,
        claimantStatus: "PLAINTIFF" as const,
      },
      {
        id: "ayse",
        fullName: "Ayşe",
        relation: "mother" as const,
        birthDate: "1955-01-01",
        gender: "female" as const,
        claimantStatus: "OUT_OF_CASE" as const,
      },
      {
        id: "mehmet",
        fullName: "Mehmet",
        relation: "father" as const,
        birthDate: "1950-01-01",
        gender: "male" as const,
        claimantStatus: "OUT_OF_CASE" as const,
      },
    ];
    const checked = validateTrafficDeathDraft(
      baseDraft({
        beneficiaries,
        zmtsPayments: [
          {
            id: "z",
            paymentDate: "",
            paymentAmount: 0,
            liabilityLimit: 0,
            garameEnabled: true,
            deathGarameRows: [
              { claimantId: "ebru", paymentAmount: 0, liabilityLimit: 0, accidentLimit: 0, paymentDate: "" },
              { claimantId: "ali", paymentAmount: -1, paymentDate: "2023-01-01", liabilityLimit: 0, accidentLimit: 0 },
              { claimantId: "ayse", paymentAmount: 10, paymentDate: "", liabilityLimit: -5, accidentLimit: 0 },
              { claimantId: "yok", paymentAmount: 5, paymentDate: "2023-01-01", liabilityLimit: 0, accidentLimit: 0 },
            ],
          },
        ],
      })
    );
    expect(checked.errors.some((e) => e.field === "zmtsPayments[0].claimantId")).toBe(false);
    expect(checked.errors.some((e) => e.message === "Ödeme miktarı negatif olamaz.")).toBe(true);
    expect(checked.errors.some((e) => e.message === "Ödeme tarihi girilmelidir.")).toBe(true);
    expect(checked.errors.some((e) => e.message === "Kişi başı limit negatif olamaz.")).toBe(true);
    expect(checked.errors.some((e) => e.message === "Garame satırındaki hak sahibi artık listede yok.")).toBe(true);

    const closed = validateTrafficDeathDraft(
      baseDraft({
        beneficiaries,
        zmtsPayments: [
          { id: "z", paymentDate: "2023-01-01", paymentAmount: 1000, liabilityLimit: 0, garameEnabled: false },
        ],
      })
    );
    expect(closed.errors.some((e) => e.message === "Ödemenin yapıldığı hak sahibini seçin.")).toBe(true);
  });
});

describe("TRAFFIC_DEATH hak sahibi ZMTS ve Kasko mahsubu", () => {
  it("A) subtracts principal plus interest and keeps the 350000 + 25000 identity", () => {
    expect(roundMoney(350000 + 25000)).toBe(375000);
    expect(roundMoney(Math.max(0, 4223059.98 - 375000))).toBe(3848059.98);

    const updated = accrueClaimantLegalPayment(350000, "2024-01-01", "2024-04-10", [
      { startDate: "2020-01-01", endDate: null, annualRatePercent: 10 },
    ]);
    expect(updated.legalInterestAmount).toBe(roundMoney((350000 * 100 * 10) / 36000));
    expect(updated.updatedAmount).toBe(roundMoney(350000 + updated.legalInterestAmount));
    expect(updated.interestSegments).toHaveLength(1);
    expect(updated.interestSegments[0]?.calendarDayCount).toBe(100);
    expect(updated.interestSegments[0]?.interestAmount).toBe(updated.legalInterestAmount);

    const crossed = accrueClaimantLegalPayment(360000, "2024-05-01", "2024-06-15");
    const firstPeriod = roundMoney((360000 * 9 * 31) / 36000);
    const secondPeriod = roundMoney((360000 * 24 * 14) / 36000);
    expect(crossed.interestSegments).toHaveLength(2);
    expect(crossed.legalInterestAmount).toBe(roundMoney(firstPeriod + secondPeriod));
    expect(crossed.legalInterestAmount).not.toBe(roundMoney((360000 * 9 * 45) / 36000));
    expect(crossed.updatedAmount).toBe(roundMoney(360000 + crossed.legalInterestAmount));
  });

  it("B) accrues two ZMTS payments on their own dates", () => {
    const first = accrueClaimantLegalPayment(100000, "2023-01-01", "2024-01-15");
    const second = accrueClaimantLegalPayment(250000, "2023-06-01", "2024-01-15");
    const result = calculateTrafficDeath(
      baseDraft({
        zmtsPayments: [
          { id: "a", paymentDate: "2023-01-01", paymentAmount: 100000, liabilityLimit: 0, claimantId: "sp" },
          { id: "b", paymentDate: "2023-06-01", paymentAmount: 250000, liabilityLimit: 0, claimantId: "sp" },
        ],
      })
    );
    const spouse = result.claimantLosses.find((c) => c.claimantId === "sp");
    expect(spouse?.zmtsPaymentDetails).toHaveLength(2);
    expect(spouse?.updatedZmtsPaymentAmount).toBe(roundMoney(first.updatedAmount + second.updatedAmount));
    expect(spouse?.updatedZmtsPaymentAmount).not.toBe(
      accrueClaimantLegalPayment(350000, "2023-01-01", "2024-01-15").updatedAmount
    );
  });

  it("C) keeps ZMTS and Kasko in separate columns", () => {
    const zmts = accrueClaimantLegalPayment(1000, "2023-01-01", "2024-01-15");
    const casco = accrueClaimantLegalPayment(2000, "2023-03-01", "2024-01-15");
    const result = calculateTrafficDeath(
      baseDraft({
        zmtsPayments: [{ id: "z", paymentDate: "2023-01-01", paymentAmount: 1000, liabilityLimit: 0, claimantId: "sp" }],
        cascoPayments: [{ id: "k", paymentDate: "2023-03-01", paymentAmount: 2000, liabilityLimit: 0, claimantId: "sp" }],
      })
    );
    const spouse = result.claimantLosses.find((c) => c.claimantId === "sp");
    expect(spouse?.updatedZmtsPaymentAmount).toBe(zmts.updatedAmount);
    expect(spouse?.updatedCascoPaymentAmount).toBe(casco.updatedAmount);
    expect(spouse?.lossAfterInsurancePayments).toBe(
      roundMoney(Math.max(0, (spouse?.lossAfterMarriageProbability ?? 0) - zmts.updatedAmount - casco.updatedAmount))
    );
    const plain = calculateTrafficDeath(baseDraft());
    expect(result.finalCompensation).toBe(
      roundMoney(plain.finalCompensation - zmts.updatedAmount - casco.updatedAmount)
    );
  });

  it("D) does not move another claimant's payment onto the spouse", () => {
    const result = calculateTrafficDeath(
      baseDraft({
        beneficiaries: [
          {
            id: "sp",
            fullName: "Ayşe",
            relation: "spouse",
            birthDate: "1975-01-01",
            gender: "female",
            claimantStatus: "PLAINTIFF",
          },
          {
            id: "ali",
            fullName: "Ali",
            relation: "child",
            birthDate: "2010-01-01",
            gender: "male",
            claimantStatus: "PLAINTIFF",
          },
        ],
        zmtsPayments: [{ id: "z", paymentDate: "2023-01-01", paymentAmount: 1000, liabilityLimit: 0, claimantId: "ali" }],
      })
    );
    expect(result.claimantLosses.find((c) => c.claimantId === "sp")?.updatedZmtsPaymentAmount).toBe(0);
    expect(result.claimantLosses.find((c) => c.claimantId === "ali")?.updatedZmtsPaymentAmount).toBeGreaterThan(1000);
  });

  it("E) same payment and calculation date has zero interest", () => {
    const updated = accrueClaimantLegalPayment(350000, "2024-01-15", "2024-01-15");
    expect(updated.legalInterestAmount).toBe(0);
    expect(updated.updatedAmount).toBe(350000);
    const result = calculateTrafficDeath(
      baseDraft({
        zmtsPayments: [{ id: "z", paymentDate: "2024-01-15", paymentAmount: 350000, liabilityLimit: 0, claimantId: "sp" }],
      })
    );
    expect(result.claimantLosses.find((c) => c.claimantId === "sp")?.updatedZmtsPaymentAmount).toBe(350000);
  });

  it("F) rejects a payment date after the calculation date", () => {
    const checked = validateTrafficDeathDraft(
      baseDraft({
        zmtsPayments: [{ id: "z", paymentDate: "2024-02-01", paymentAmount: 1000, liabilityLimit: 0, claimantId: "sp" }],
      })
    );
    expect(checked.errors.some((e) => e.message === "Ödeme tarihi hesap tarihinden sonra olamaz.")).toBe(true);
    const garame = validateTrafficDeathDraft(
      baseDraft({
        beneficiaries: [
          {
            id: "sp",
            fullName: "Ayşe",
            relation: "spouse",
            birthDate: "1975-01-01",
            gender: "female",
            claimantStatus: "PLAINTIFF",
          },
        ],
        cascoPayments: [
          {
            id: "k",
            paymentDate: "2023-01-01",
            paymentAmount: 1,
            liabilityLimit: 0,
            garameEnabled: true,
            deathGarameRows: [
              { claimantId: "sp", paymentAmount: 1000, paymentDate: "2024-02-01", liabilityLimit: 0, accidentLimit: 0 },
            ],
          },
        ],
      })
    );
    expect(garame.errors.some((e) => e.message === "Ödeme tarihi hesap tarihinden sonra olamaz.")).toBe(true);
    const result = calculateTrafficDeath(
      baseDraft({
        zmtsPayments: [{ id: "z", paymentDate: "2024-02-01", paymentAmount: 1000, liabilityLimit: 0, claimantId: "sp" }],
      })
    );
    expect(result.claimantLosses.find((c) => c.claimantId === "sp")?.updatedZmtsPaymentAmount).toBe(0);
  });

  it("G) floors the remainder at zero and still shows the updated payment", () => {
    const result = calculateTrafficDeath(
      baseDraft({
        zmtsPayments: [
          { id: "z", paymentDate: "2023-01-01", paymentAmount: 50_000_000, liabilityLimit: 0, claimantId: "sp" },
        ],
      })
    );
    const spouse = result.claimantLosses.find((c) => c.claimantId === "sp");
    expect(spouse?.updatedZmtsPaymentAmount).toBeGreaterThan(spouse?.lossAfterMarriageProbability ?? 0);
    expect(spouse?.lossAfterInsurancePayments).toBe(0);
    expect(result.totalAfterClaimantInsurance).toBe(0);
    expect(result.finalCompensation).toBe(result.deathExpenses.total);
  });
});
