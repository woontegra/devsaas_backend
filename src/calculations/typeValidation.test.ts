import { describe, it, expect } from "vitest";
import { validateCalculationDraft } from "./validateDraft.js";
import { CALCULATION_SCHEMA_VERSION } from "./types.js";
import type {
  TrafficInjuryDraft,
  TrafficDeathDraft,
  WorkInjuryDraft,
  WorkDeathDraft,
} from "./types.js";

const common = {
  eventDate: "2020-06-01",
  calculationDate: "2024-01-15",
};

function trafficInjury(over: Partial<TrafficInjuryDraft> = {}): TrafficInjuryDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_INJURY",
    common: { ...common },
    parties: {
      plaintiff: {
        firstName: "Ali",
        lastName: "Veli",
        birthDate: "1985-03-10",
        gender: "MALE",
      },
      defendants: [
        {
          id: "d1",
          type: "INDIVIDUAL_DRIVER",
          firstName: "Mehmet",
          lastName: "Kaya",
        },
      ],
    },
    liability: {
      injuredFaultRatio: 20,
      parties: [{ id: "p1", partyType: "defendant", name: "Gerçek Kişi Şoför", faultRatio: 80 }],
    },
    disability: { permanentDisabilityRate: 40, disabilityStartDate: "2020-09-01" },
    temporaryIncapacityPeriods: [],
    accidentIncome: { incomeMode: "fixed", fixedAmount: 12000, averageSources: [] },
    hospitalExpenses: [],
    travelExpenses: [],
    caregiverExpenses: [],
    capitalValueDocuments: [],
    zmtsPayments: [],
    cascoPayments: [],
    ...over,
  };
}

function trafficDeath(over: Partial<TrafficDeathDraft> = {}): TrafficDeathDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_DEATH",
    common: { ...common },
    deceased: {
      birthDate: "1970-01-01",
      deathDate: "2020-06-01",
      gender: "male",
      fullName: "Ahmet",
    },
    employmentStatus: "WORKING",
    accidentIncome: { incomeMode: "fixed", fixedAmount: 10000, averageSources: [] },
    nonWorkingSelectedIncome: null,
    incomePeriods: [],
    beneficiaries: [
      {
        id: "b1",
        fullName: "Ayşe",
        relation: "spouse",
        birthDate: "1975-01-01",
        gender: "female",
        claimantStatus: "PLAINTIFF",
      },
    ],
    supportRelations: [],
    liability: {
      injuredFaultRatio: 0,
      parties: [],
    },
    claimantFaultRates: { b1: 100 },
    deceasedFaultRate: 100,
    responsibleParties: [],
    externalFaultRate: 0,
    deathExpenses: { otherExpenses: [] },
    priorPayments: [],
    insurance: {},
    ...over,
  };
}

function workInjury(over: Partial<WorkInjuryDraft> = {}): WorkInjuryDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "WORK_INJURY",
    common: { ...common },
    employee: { birthDate: "1988-05-05", gender: "male", fullName: "Mehmet" },
    employment: { employerName: "ABC Ltd" },
    incomePeriods: [
      { id: "1", startDate: "2020-01-01", amount: 15000, amountKind: "gross", sourceType: "wage" },
    ],
    liability: {
      injuredFaultRatio: 10,
      inevitabilityRatio: 20,
      parties: [{ id: "p1", partyType: "employer", name: "ABC Ltd", faultRatio: 70 }],
    },
    disability: { permanentDisabilityRate: 25 },
    temporaryIncapacityPeriods: [],
    sgkIncome: [],
    capitalValueDocuments: [],
    careAndExpenses: { otherExpenses: [] },
    priorPayments: [],
    ...over,
  };
}

function workDeath(over: Partial<WorkDeathDraft> = {}): WorkDeathDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "WORK_DEATH",
    common: { ...common },
    deceasedEmployee: {
      birthDate: "1975-02-02",
      deathDate: "2020-06-01",
      gender: "male",
      fullName: "Can",
    },
    employment: { employerName: "XYZ AŞ" },
    incomePeriods: [
      { id: "1", startDate: "2018-01-01", amount: 14000, amountKind: "net", sourceType: "wage" },
    ],
    beneficiaries: [
      {
        id: "b1",
        fullName: "Zeynep",
        relation: "spouse",
        birthDate: "1980-01-01",
        gender: "female",
      },
    ],
    supportRelations: [],
    liability: {
      injuredFaultRatio: 0,
      inevitabilityRatio: 10,
      parties: [{ id: "p1", partyType: "employer", name: "XYZ", faultRatio: 90 }],
    },
    sgkDeathIncomes: [],
    capitalValueDocuments: [],
    expenses: [],
    priorPayments: [],
    ...over,
  };
}

const MONETARY = ["total", "presentValue", "compensation", "yearlyTable", "estimatedAmount"];

describe("type-specific validation", () => {
  it("traffic injury does not require beneficiaries", () => {
    const res = validateCalculationDraft(trafficInjury());
    expect(res.valid).toBe(true);
    expect(res.errors.some((e) => e.field.includes("beneficiar"))).toBe(false);
    expect(res.missingSections).not.toContain("beneficiaries");
  });

  it("traffic death requires at least one plaintiff beneficiary", () => {
    const res = validateCalculationDraft(trafficDeath({ beneficiaries: [] }));
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field === "beneficiaries")).toBe(true);

    const onlyOutOfCase = validateCalculationDraft(
      trafficDeath({
        beneficiaries: [
          {
            id: "b1",
            fullName: "Ali",
            relation: "child",
            birthDate: "2000-01-01",
            gender: "male",
            claimantStatus: "OUT_OF_CASE",
          },
        ],
      })
    );
    expect(onlyOutOfCase.valid).toBe(false);
    expect(onlyOutOfCase.errors.some((e) => e.message.includes("davacı"))).toBe(true);
  });

  it("traffic death does not require disability", () => {
    const res = validateCalculationDraft(trafficDeath());
    expect(res.errors.some((e) => e.field.includes("disability"))).toBe(false);
    expect(res.missingSections).not.toContain("disability");
  });

  it("traffic death merges common dates and income into deceased section", () => {
    const res = validateCalculationDraft(trafficDeath());
    expect(res.completedSections).toContain("deceased");
    expect(res.completedSections).not.toContain("caseEvent");
    expect(res.completedSections).not.toContain("income");

    const incomplete = validateCalculationDraft(
      trafficDeath({ common: { eventDate: "", calculationDate: "2024-01-15" } })
    );
    expect(incomplete.missingSections).toContain("deceased");
    expect(incomplete.missingSections).not.toContain("caseEvent");
    expect(incomplete.missingSections).not.toContain("income");

    const noEmployment = validateCalculationDraft(
      trafficDeath({ employmentStatus: null, accidentIncome: { incomeMode: "minWage", fixedAmount: null, averageSources: [] } })
    );
    expect(noEmployment.missingSections).toContain("deceased");
    expect(noEmployment.errors.some((e) => e.field === "employmentStatus")).toBe(true);

    const notWorkingMissingIncome = validateCalculationDraft(
      trafficDeath({ employmentStatus: "NOT_WORKING", nonWorkingSelectedIncome: null })
    );
    expect(notWorkingMissingIncome.valid).toBe(false);
    expect(notWorkingMissingIncome.errors.some((e) => e.field === "nonWorkingSelectedIncome")).toBe(true);

    const notWorkingOk = validateCalculationDraft(
      trafficDeath({ employmentStatus: "NOT_WORKING", nonWorkingSelectedIncome: 8500 })
    );
    expect(notWorkingOk.completedSections).toContain("deceased");
  });

  it("work injury checks employer and does not require beneficiaries", () => {
    const bad = validateCalculationDraft(workInjury({ employment: { employerName: "" } }));
    expect(bad.valid).toBe(false);
    expect(bad.errors.some((e) => e.field === "employment.employerName")).toBe(true);

    const ok = validateCalculationDraft(workInjury());
    expect(ok.errors.some((e) => e.field.includes("beneficiar"))).toBe(false);
  });

  it("work death requires beneficiaries", () => {
    const res = validateCalculationDraft(workDeath({ beneficiaries: [] }));
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field === "beneficiaries")).toBe(true);
  });

  it("work death warns when SGK death incomes missing", () => {
    const res = validateCalculationDraft(workDeath({ sgkDeathIncomes: [] }));
    expect(res.warnings.some((w) => w.code === "SGK_DEATH_MISSING")).toBe(true);
  });

  it("work injury warns when SGK incomes missing", () => {
    const res = validateCalculationDraft(workInjury({ sgkIncome: [] }));
    expect(res.warnings.some((w) => w.code === "SGK_MISSING")).toBe(true);
  });

  it("wrong-type fields do not confuse traffic injury sections", () => {
    const res = validateCalculationDraft(trafficInjury());
    expect(res.completedSections).not.toContain("beneficiaries");
    expect(res.completedSections).not.toContain("deceased");
    expect(res.completedSections).toEqual(expect.arrayContaining(["calculationInfo", "parties"]));
  });

  it("response never contains monetary keys", () => {
    for (const draft of [trafficInjury(), trafficDeath(), workInjury(), workDeath()]) {
      const res = validateCalculationDraft(draft);
      const json = JSON.stringify(res);
      for (const k of MONETARY) {
        expect(json).not.toContain(`"${k}"`);
      }
    }
  });

  it("legacy flat draft shape is rejected or fails validation cleanly", () => {
    const legacy = {
      schemaVersion: 1,
      calculationType: "TRAFFIC_INJURY",
      incident: { eventDate: "2020-01-01", calculationDate: "2021-01-01" },
      primaryPerson: { birthDate: "1990-01-01", gender: "male" },
    };
    const res = validateCalculationDraft(legacy);
    expect(res.valid).toBe(false);
  });
});

describe("traffic injury parties validation", () => {
  it("errors when plaintiff firstName missing", () => {
    const res = validateCalculationDraft(
      trafficInjury({
        parties: {
          plaintiff: { firstName: "", lastName: "Veli", birthDate: "1985-03-10", gender: "MALE" },
          defendants: [{ id: "d1", type: "INDIVIDUAL_DRIVER", firstName: "A", lastName: "B" }],
        },
      })
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field === "parties.plaintiff.firstName")).toBe(true);
  });

  it("errors when plaintiff lastName missing", () => {
    const res = validateCalculationDraft(
      trafficInjury({
        parties: {
          plaintiff: { firstName: "Ali", lastName: "", birthDate: "1985-03-10", gender: "MALE" },
          defendants: [{ id: "d1", type: "INDIVIDUAL_DRIVER", firstName: "A", lastName: "B" }],
        },
      })
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field === "parties.plaintiff.lastName")).toBe(true);
  });

  it("errors when plaintiff birthDate missing", () => {
    const res = validateCalculationDraft(
      trafficInjury({
        parties: {
          plaintiff: { firstName: "Ali", lastName: "Veli", birthDate: "", gender: "MALE" },
          defendants: [{ id: "d1", type: "INDIVIDUAL_DRIVER", firstName: "A", lastName: "B" }],
        },
      })
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field === "parties.plaintiff.birthDate")).toBe(true);
  });

  it("errors when gender missing", () => {
    const res = validateCalculationDraft(
      trafficInjury({
        parties: {
          plaintiff: { firstName: "Ali", lastName: "Veli", birthDate: "1985-03-10", gender: "" },
          defendants: [{ id: "d1", type: "INDIVIDUAL_DRIVER", firstName: "A", lastName: "B" }],
        },
      })
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field === "parties.plaintiff.gender")).toBe(true);
  });

  it("errors when no defendants", () => {
    const res = validateCalculationDraft(
      trafficInjury({
        parties: {
          plaintiff: { firstName: "Ali", lastName: "Veli", birthDate: "1985-03-10", gender: "MALE" },
          defendants: [],
        },
      })
    );
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field === "parties.defendants")).toBe(true);
  });

  it("does not require defendant detail names", () => {
    const res = validateCalculationDraft(
      trafficInjury({
        parties: {
          plaintiff: { firstName: "Ali", lastName: "Veli", birthDate: "1985-03-10", gender: "MALE" },
          defendants: [
            { id: "d1", type: "INDIVIDUAL_DRIVER" },
            { id: "d2", type: "COMPULSORY_TRAFFIC_INSURER" },
            { id: "d3", type: "CASCO_INSURER" },
          ],
        },
      })
    );
    expect(res.valid).toBe(true);
    expect(res.errors.some((e) => e.field.includes("firstName"))).toBe(false);
    expect(res.errors.some((e) => e.field.includes("organizationName"))).toBe(false);
  });

  it("accepts multiple defendants", () => {
    const res = validateCalculationDraft(
      trafficInjury({
        parties: {
          plaintiff: { firstName: "Ali", lastName: "Veli", birthDate: "1985-03-10", gender: "MALE" },
          defendants: [
            { id: "d1", type: "INDIVIDUAL_DRIVER", firstName: "A", lastName: "B" },
            { id: "d2", type: "COMPULSORY_TRAFFIC_INSURER", organizationName: "ABC Sigorta" },
            { id: "d3", type: "CASCO_INSURER", organizationName: "XYZ Kasko" },
          ],
        },
      })
    );
    expect(res.valid).toBe(true);
    expect(res.completedSections).toContain("parties");
  });

  it("parties section completed when plaintiff and defendants ok", () => {
    const res = validateCalculationDraft(trafficInjury());
    expect(res.completedSections).toContain("parties");
  });

  it("no monetary fields in parties validation response", () => {
    const res = validateCalculationDraft(trafficInjury());
    const json = JSON.stringify(res);
    for (const k of MONETARY) {
      expect(json).not.toContain(`"${k}"`);
    }
  });
});
