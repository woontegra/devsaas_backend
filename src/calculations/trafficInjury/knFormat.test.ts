import { describe, it, expect } from "vitest";
import {
  discountRawForKn,
  formatKn8Display,
  knRawForPeriod,
} from "./knFormat.js";

describe("knFormat — referans 8 ondalık", () => {
  it("KN(n) = 1,10^n tam hassasiyet", () => {
    expect(formatKn8Display(knRawForPeriod(1))).toBe("1,10000000");
    expect(formatKn8Display(knRawForPeriod(2))).toBe("1,21000000");
    expect(formatKn8Display(knRawForPeriod(3))).toBe("1,33100000");
    expect(formatKn8Display(knRawForPeriod(8))).toBe("2,14358881");
  });

  it("iskonto = 1/KN 8 ondalık gösterim", () => {
    expect(formatKn8Display(discountRawForKn(knRawForPeriod(1)))).toBe("0,90909090");
    expect(formatKn8Display(discountRawForKn(knRawForPeriod(2)))).toBe("0,82644628");
    expect(formatKn8Display(discountRawForKn(knRawForPeriod(3)))).toBe("0,75131480");
  });

  it("hesap tam hassasiyetle devam eder, gösterim 8 ondalık kesilir", () => {
    const kn8 = knRawForPeriod(8);
    expect(formatKn8Display(kn8)).toBe("2,14358881");
    expect(kn8).toBeCloseTo(Math.pow(1.1, 8), 10);
  });
});
