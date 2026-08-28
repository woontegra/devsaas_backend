import { describe, it, expect } from "vitest";
import { LEGAL_INTEREST_RATE_PERIODS } from "../../data/legalInterestRates.js";
import { resolveLegalInterestRate } from "./resolveLegalInterestRate.js";

describe("resolveLegalInterestRate — sınır testleri (kanuni faiz)", () => {
  const cases: Array<[string, number]> = [
    ["1997-12-31", 30],
    ["1998-01-01", 50],
    ["1999-12-31", 50],
    ["2000-01-01", 60],
    ["2002-06-30", 60],
    ["2002-07-01", 55],
    ["2003-06-30", 55],
    ["2003-07-01", 50],
    ["2003-12-31", 50],
    ["2004-01-01", 43],
    ["2004-06-30", 43],
    ["2004-07-01", 38],
    ["2005-04-30", 38],
    ["2005-05-01", 12],
    ["2005-12-31", 12],
    ["2006-01-01", 9],
    ["2024-05-31", 9],
    ["2024-06-01", 24],
    ["2026-07-30", 24],
    ["2026-07-31", 31],
  ];

  it.each(cases)("tarih %s → %%%i", (date, expectedRate) => {
    expect(resolveLegalInterestRate(date, LEGAL_INTEREST_RATE_PERIODS).rate).toBe(expectedRate);
  });

  it("tablo dışı tarih → null", () => {
    expect(resolveLegalInterestRate("1980-01-01", LEGAL_INTEREST_RATE_PERIODS).rate).toBeNull();
  });

  it("açık uçlu son dönemde ileri tarihler %31", () => {
    expect(resolveLegalInterestRate("2030-01-01", LEGAL_INTEREST_RATE_PERIODS).rate).toBe(31);
  });
});
