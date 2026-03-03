import { describe, it, expect, beforeEach } from "vitest";
import { calculateActuarial } from "./actuarialEngine.js";
import type { ActuarialInput } from "./types.js";

describe("actuarialEngine", () => {
  const baseInput: ActuarialInput = {
    birthDate: "1980-01-15",
    accidentDate: "2020-06-01",
    gender: "male",
    monthlyIncome: 10000,
    disabilityRate: 50,
    interestRate: 0.05,
    wageIncreaseRate: 0.03,
  };

  it("returns age at accident from birth and accident dates", () => {
    const result = calculateActuarial(baseInput);
    expect(result.ageAtAccident).toBe(40.37);
  });

  it("computes active period years until retirement at 65", () => {
    const result = calculateActuarial(baseInput);
    expect(result.activePeriodYears).toBe(25);
  });

  it("computes passive period years from retirement to max age 100", () => {
    const result = calculateActuarial(baseInput);
    expect(result.passivePeriodYears).toBe(35);
  });

  it("monthly pension equals monthlyIncome * disabilityRate / 100", () => {
    const result = calculateActuarial(baseInput);
    expect(result.monthlyPension).toBe(5000);
  });

  it("present capital value is sum of active and passive PV", () => {
    const result = calculateActuarial(baseInput);
    expect(result.presentCapitalValue).toBe(
      result.breakdown.activePeriodPV + result.breakdown.passivePeriodPV
    );
  });

  it("metadata contains input rates and calculatedAt ISO string", () => {
    const result = calculateActuarial(baseInput);
    expect(result.metadata.interestRate).toBe(0.05);
    expect(result.metadata.wageIncreaseRate).toBe(0.03);
    expect(result.metadata.disabilityRate).toBe(50);
    expect(result.metadata.calculatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("female gives different PV than male due to mortality", () => {
    const male = calculateActuarial({ ...baseInput, gender: "male" });
    const female = calculateActuarial({ ...baseInput, gender: "female" });
    expect(male.presentCapitalValue).not.toBe(female.presentCapitalValue);
  });

  it("higher interest rate reduces present capital value", () => {
    const low = calculateActuarial({ ...baseInput, interestRate: 0.03 });
    const high = calculateActuarial({ ...baseInput, interestRate: 0.08 });
    expect(high.presentCapitalValue).toBeLessThan(low.presentCapitalValue);
  });

  it("higher disability rate increases monthly pension and total PV", () => {
    const low = calculateActuarial({ ...baseInput, disabilityRate: 30 });
    const high = calculateActuarial({ ...baseInput, disabilityRate: 70 });
    expect(high.monthlyPension).toBe(7000);
    expect(low.monthlyPension).toBe(3000);
    expect(high.presentCapitalValue).toBeGreaterThan(low.presentCapitalValue);
  });

  it("age at accident 64 yields active period 1 year", () => {
    const result = calculateActuarial({
      ...baseInput,
      birthDate: "1956-01-01",
      accidentDate: "2020-01-01",
    });
    expect(result.ageAtAccident).toBe(64);
    expect(result.activePeriodYears).toBe(1);
  });

  it("age at accident 65 or over yields active period 0", () => {
    const result = calculateActuarial({
      ...baseInput,
      birthDate: "1955-01-01",
      accidentDate: "2020-06-01",
    });
    expect(result.activePeriodYears).toBe(0);
  });

  it("discount factor is between 0 and 1 for positive effective years", () => {
    const result = calculateActuarial(baseInput);
    expect(result.discountFactor).toBeGreaterThan(0);
    expect(result.discountFactor).toBeLessThanOrEqual(1);
  });

  it("result is deterministic for same input", () => {
    const a = calculateActuarial(baseInput);
    const b = calculateActuarial(baseInput);
    expect(a.presentCapitalValue).toBe(b.presentCapitalValue);
    expect(a.ageAtAccident).toBe(b.ageAtAccident);
  });

  it("zero wage increase still produces positive active PV", () => {
    const result = calculateActuarial({ ...baseInput, wageIncreaseRate: 0 });
    expect(result.breakdown.activePeriodPV).toBeGreaterThan(0);
  });

  it("fixed expected present capital value for known input", () => {
    const input: ActuarialInput = {
      birthDate: "1990-05-10",
      accidentDate: "2025-05-10",
      gender: "female",
      monthlyIncome: 8000,
      disabilityRate: 60,
      interestRate: 0.06,
      wageIncreaseRate: 0.02,
    };
    const result = calculateActuarial(input);
    expect(result.ageAtAccident).toBe(35);
    expect(result.monthlyPension).toBe(4800);
    expect(result.activePeriodYears).toBe(30);
    expect(result.passivePeriodYears).toBe(35);
    expect(result.presentCapitalValue).toBeGreaterThan(500000);
    expect(result.presentCapitalValue).toBeLessThan(3000000);
  });
});
