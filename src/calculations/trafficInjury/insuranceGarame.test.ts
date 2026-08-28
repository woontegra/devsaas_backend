import { describe, it, expect } from "vitest";
import { isGarameEnabled, paymentsForGarameMotor } from "./insuranceGarame.js";
import type { InsurancePaymentRecord } from "../types.js";

function payment(overrides: Partial<InsurancePaymentRecord> = {}): InsurancePaymentRecord {
  return {
    id: "p1",
    paymentDate: "2025-01-01",
    paymentAmount: 1000,
    liabilityLimit: 5000,
    accidentLimit: 10000,
    garameEntries: [{ id: "g1", subjectRef: "plaintiff" }],
    ...overrides,
  };
}

describe("insuranceGarame", () => {
  it("garameEnabled yoksa kapalı kabul eder (eski taslak)", () => {
    expect(isGarameEnabled(payment())).toBe(false);
    expect(isGarameEnabled(payment({ garameEnabled: undefined }))).toBe(false);
  });

  it("garameEnabled=true olan kayıtları motor filtresine alır", () => {
    const rows = [
      payment({ id: "z1", garameEnabled: true }),
      payment({ id: "z2", garameEnabled: false }),
      payment({ id: "c1", garameEnabled: true }),
    ];
    expect(paymentsForGarameMotor(rows).map((r) => r.id)).toEqual(["z1", "c1"]);
  });

  it("ZMTS ve Kasko bağımsız — yalnızca açık olanlar filtrelenir", () => {
    const zmts = [payment({ id: "z-open", garameEnabled: true })];
    const casco = [payment({ id: "c-closed", garameEnabled: false })];
    expect(paymentsForGarameMotor(zmts).length).toBe(1);
    expect(paymentsForGarameMotor(casco).length).toBe(0);
  });
});
