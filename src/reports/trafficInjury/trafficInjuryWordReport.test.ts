import { describe, it, expect } from "vitest";
import { calculateTrafficInjury } from "../../calculations/trafficInjury/calculateTrafficInjury.js";
import { CALCULATION_SCHEMA_VERSION } from "../../calculations/types.js";
import type { TrafficInjuryDraft } from "../../calculations/types.js";
import {
  generateTrafficInjuryWordReport,
  buildTrafficInjuryWordDocument,
  trafficInjuryReportFilename,
} from "./trafficInjuryWordReport.js";
import { formatMoney } from "./reportFormat.js";

function sampleDraft(): TrafficInjuryDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_INJURY",
    common: {
      internalFileName: "Test Dosya",
      eventDate: "2020-06-01",
      calculationDate: "2024-01-15",
    },
    parties: {
      plaintiff: { firstName: "Ali", lastName: "Veli", birthDate: "1985-03-10", gender: "MALE" },
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
      parties: [{ id: "d1", partyType: "defendant", name: "Mehmet Kaya", faultRatio: 80 }],
    },
    disability: { permanentDisabilityRate: 35, disabilityStartDate: "2020-09-01" },
    temporaryIncapacityPeriods: [
      { id: "t1", startDate: "2020-06-01", endDate: "2020-08-31" },
    ],
    accidentIncome: { incomeMode: "fixed", fixedAmount: 25000, averageSources: [] },
    hospitalExpenses: [],
    travelExpenses: [],
    caregiverExpenses: [],
    capitalValueDocuments: [],
    zmtsPayments: [],
    cascoPayments: [],
    passivePhaseAge: 60,
  };
}

describe("trafficInjuryWordReport", () => {
  it("generates a non-empty .docx buffer (ZIP magic)", async () => {
    const draft = sampleDraft();
    const result = calculateTrafficInjury(draft);
    const buffer = await generateTrafficInjuryWordReport(draft, result);
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
  });

  it("builds document from motor result without recalculating", () => {
    const draft = sampleDraft();
    const result = calculateTrafficInjury(draft);
    const doc = buildTrafficInjuryWordDocument(draft, result);
    expect(doc).toBeTruthy();
    expect(formatMoney(result.totalDamageBeforeFault)).toMatch(/TL$/);
    expect(result.totalDamageBeforeFault).toBe(
      result.temporaryIncapacityTotal + result.processedPermanentTotal + result.futurePermanentTotal
    );
  });

  it("builds a safe filename", () => {
    const draft = sampleDraft();
    expect(trafficInjuryReportFilename(draft)).toContain("Test-Dosya");
    expect(trafficInjuryReportFilename(draft)).toMatch(/\.docx$/);
  });
});
