import { describe, it, expect } from "vitest";
import { CALCULATION_SCHEMA_VERSION } from "../calculations/types.js";
import type { TrafficDeathDraft } from "../calculations/types.js";
import { hashCalculationInput } from "../calculations/hash/calculationInputHash.js";
import {
  extractTrafficDeathMetadata,
  extractNamedFileMetadata,
  SavedCalculationError,
  resolveTrafficDeathResultSnapshot,
} from "./savedCalculationService.js";
import { calculateTrafficDeathSupportPeriods } from "../calculations/trafficDeath/supportPeriods/calculateSupportPeriods.js";
import type { TrafficInjuryDraft } from "../calculations/types.js";

function sampleDeathDraft(over: Partial<TrafficDeathDraft> = {}): TrafficDeathDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_DEATH",
    common: { eventDate: "2024-04-15", calculationDate: "2024-06-01" },
    deceased: {
      birthDate: "1946-02-20",
      deathDate: "2024-04-15",
      gender: "male",
      fullName: "Ahmet Yılmaz",
    },
    employmentStatus: "WORKING",
    deceasedFamilyInfo: {
      maritalStatus: "MARRIED",
      militaryStatus: "COMPLETED",
      militaryServiceStartDate: "1966-01-01",
      militaryServiceDurationMonths: 12,
      educationStatus: "graduate",
      hasChildren: false,
      childrenCount: 0,
      children: [],
    },
    accidentIncome: { incomeMode: "fixed", fixedAmount: 10000, averageSources: [] },
    nonWorkingSelectedIncome: null,
    incomePeriods: [],
    beneficiaries: [
      {
        id: "sp",
        fullName: "Ayşe",
        relation: "spouse",
        birthDate: "1950-05-15",
        gender: "female",
        claimantStatus: "PLAINTIFF",
        remarried: true,
        remarriageDate: "2025-01-01",
      },
    ],
    supportRelations: [],
    liability: { injuredFaultRatio: 0, parties: [] },
    deathExpenses: { otherExpenses: [] },
    priorPayments: [],
    insurance: {},
    ...over,
  };
}

describe("TRAFFIC_DEATH saved calculation helpers", () => {
  it("extractTrafficDeathMetadata uses displayName and death date", () => {
    const draft = sampleDeathDraft();
    const meta = extractTrafficDeathMetadata(draft, "2024/125 Mehmet Demir");
    expect(meta.displayName).toBe("2024/125 Mehmet Demir");
    expect(meta.title).toBe("2024/125 Mehmet Demir");
    expect(meta.eventDate).toBe("2024-04-15");
  });

  it("draft without motor errors can produce result snapshot", () => {
    const draft = sampleDeathDraft({
      beneficiaries: [
        {
          id: "sp",
          fullName: "Ayşe",
          relation: "spouse",
          birthDate: "1950-05-15",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "mo",
          fullName: "Fatma",
          relation: "mother",
          birthDate: "1925-04-15",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
      ],
    });
    const motor = calculateTrafficDeathSupportPeriods(draft);
    expect(motor.errors).toEqual([]);
    expect(motor.shareRatioPeriods.length).toBeGreaterThan(0);
  });

  it("result snapshot includes share periods, person lives and column keys", () => {
    const draft = sampleDeathDraft({
      beneficiaries: [
        {
          id: "sp",
          fullName: "Ayşe",
          relation: "spouse",
          birthDate: "1950-05-15",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
      ],
    });
    const snapshot = resolveTrafficDeathResultSnapshot(draft, null) as {
      shareRatioPeriods: unknown[];
      personLives: unknown[];
      periods?: unknown[];
      supportPeriods?: unknown[];
      columnKeys: unknown[];
      calculationType?: string;
    };
    expect(snapshot).not.toBeNull();
    expect(snapshot.shareRatioPeriods.length).toBeGreaterThan(0);
    expect(Array.isArray(snapshot.personLives)).toBe(true);
    expect(
      Array.isArray(snapshot.periods) || Array.isArray(snapshot.supportPeriods)
    ).toBe(true);
    expect(Array.isArray(snapshot.columnKeys)).toBe(true);
  });

  it("old record without resultSnapshotJson can recompute pay periods from input", () => {
    const draft = sampleDeathDraft({
      claimantFaultRates: {},
      externalFaultRate: 0,
      beneficiaries: [
        {
          id: "sp",
          fullName: "Ayşe",
          relation: "spouse",
          birthDate: "1950-05-15",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "mo",
          fullName: "Fatma",
          relation: "mother",
          birthDate: "1925-04-15",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
      ],
    });
    const motor = calculateTrafficDeathSupportPeriods(draft);
    expect(motor.errors).toEqual([]);
    expect(motor.shareRatioPeriods.length).toBeGreaterThan(0);
  });

  it("incomplete draft may save without motor result", () => {
    const draft = sampleDeathDraft({
      deceased: { birthDate: "", deathDate: "", gender: "male", fullName: "" },
    });
    const motor = calculateTrafficDeathSupportPeriods(draft);
    expect(motor.periods).toEqual([]);
    expect(motor.errors.length).toBeGreaterThan(0);
  });

  it("SavedCalculationError carries code", () => {
    const err = new SavedCalculationError("Dosya adı zorunludur.", 400, "DISPLAY_NAME_REQUIRED");
    expect(err.code).toBe("DISPLAY_NAME_REQUIRED");
    expect(err.status).toBe(400);
  });

  it("input hash is stable for identical TRAFFIC_DEATH draft", () => {
    const draft = sampleDeathDraft();
    expect(hashCalculationInput(draft)).toBe(hashCalculationInput(draft));
  });

  it("input hash changes when deceased name changes", () => {
    const a = sampleDeathDraft();
    const b = sampleDeathDraft({
      deceased: {
        birthDate: "1946-02-20",
        deathDate: "2024-04-15",
        gender: "male",
        fullName: "Mehmet Demir",
      },
    });
    expect(hashCalculationInput(a)).not.toBe(hashCalculationInput(b));
  });
});

describe("extractNamedFileMetadata", () => {
  it("uses displayName for TRAFFIC_INJURY named file", () => {
    const draft: TrafficInjuryDraft = {
      schemaVersion: CALCULATION_SCHEMA_VERSION,
      calculationType: "TRAFFIC_INJURY",
      common: { eventDate: "2022-01-01", calculationDate: "2026-08-28", internalFileName: "Dosya-1" },
      parties: {
        plaintiff: { firstName: "Ali", lastName: "Veli", birthDate: "1990-01-01", gender: "MALE" },
        defendants: [],
      },
      liability: { injuredFaultRatio: 0, parties: [] },
      disability: { permanentDisabilityRate: 10, disabilityStartDate: "2022-07-01" },
      temporaryIncapacityPeriods: [],
      accidentIncome: { incomeMode: "fixed", fixedAmount: 30000, averageSources: [] },
      hospitalExpenses: [],
      travelExpenses: [],
      caregiverExpenses: [],
      capitalValueDocuments: [],
      zmtsPayments: [],
      cascoPayments: [],
    };
    const meta = extractNamedFileMetadata(draft, "  Dava 2024/12  ");
    expect(meta.displayName).toBe("Dava 2024/12");
    expect(meta.title).toBe("Dava 2024/12");
    expect(meta.eventDate).toBe("2022-01-01");
  });
});
