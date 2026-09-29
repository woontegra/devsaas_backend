import { describe, it, expect } from "vitest";
import {
  buildShareEntries,
  formatAllPercentages,
  formatPercentageTr,
  normalizeReportPercentagesFromUnits,
  sumPercentages,
} from "./shareCalculator.js";
import type { SupportFactor } from "./types.js";

describe("TRAFFIC_DEATH pay display and percentage distribution", () => {
  it("A) anne+baba ikisi aktif: display=1", () => {
    const factors: SupportFactor[] = [
      { key: "deceased", kind: "DECEASED", label: "M", units: 2 },
      { key: "sp", kind: "REAL_SPOUSE", label: "E", units: 2 },
      { key: "mo", kind: "REAL_MOTHER", label: "AN", units: 1 },
      { key: "fa", kind: "REAL_FATHER", label: "B", units: 1 },
    ];
    const shares = buildShareEntries(factors);
    expect(shares.mo?.display).toBe("1");
    expect(shares.fa?.display).toBe("1");
    expect(shares.deceased?.display).toBe("2");
    expect(shares.mo?.display).not.toContain("/");
    expect(shares.fa?.display).not.toBe("2");
    expect(shares.deceased?.fraction).toBe("2/6");
    expect(shares.sp?.fraction).toBe("2/6");
    expect(shares.mo?.fraction).toBe("1/6");
    expect(shares.fa?.fraction).toBe("1/6");
  });

  it("B) baba çıkar: anne display=1+1, percentage<=25", () => {
    const factors: SupportFactor[] = [
      { key: "deceased", kind: "DECEASED", label: "M", units: 2 },
      { key: "sp", kind: "REAL_SPOUSE", label: "E", units: 2 },
      { key: "mo", kind: "REAL_MOTHER", label: "AN", units: 1 },
    ];
    const shares = buildShareEntries(factors, { father: 1 });
    expect(shares.mo?.display).toBe("1+1");
    expect(shares.mo?.fraction).toBe("(1+1)/6");
    expect(shares.deceased?.fraction).toBe("2/6");
    expect(shares.mo?.transferredUnits).toBe(1);
    expect(shares.mo?.baseUnits).toBe(1);
    expect(shares.fa).toBeUndefined();
    expect(shares.mo?.percentage).toBeLessThanOrEqual(25);
  });

  it("C) baba çıktıktan sonra çocuk da çıkar: anne 1+1 ve %25, çocuk payı anneye eklenmez", () => {
    const beforeFactors: SupportFactor[] = [
      { key: "deceased", kind: "DECEASED", label: "M", units: 2 },
      { key: "sp", kind: "REAL_SPOUSE", label: "E", units: 2 },
      { key: "c1", kind: "REAL_CHILD", label: "C1", units: 1 },
      { key: "c2", kind: "REAL_CHILD", label: "C2", units: 1 },
      { key: "mo", kind: "REAL_MOTHER", label: "AN", units: 1 },
    ];
    const afterFactors: SupportFactor[] = [
      { key: "deceased", kind: "DECEASED", label: "M", units: 2 },
      { key: "sp", kind: "REAL_SPOUSE", label: "E", units: 2 },
      { key: "c2", kind: "REAL_CHILD", label: "C2", units: 1 },
      { key: "mo", kind: "REAL_MOTHER", label: "AN", units: 1 },
    ];

    const before = buildShareEntries(beforeFactors, { father: 1 });
    const after = buildShareEntries(afterFactors, { father: 1 });

    expect(before.mo?.display).toBe("1+1");
    expect(after.mo?.display).toBe("1+1");
    expect(before.mo?.percentage).toBe(25);
    expect(after.mo?.percentage).toBe(25);
    expect(after.c1).toBeUndefined();
    expect(after.deceased?.percentage).toBeGreaterThan(before.deceased?.percentage ?? 0);
    expect(after.sp?.percentage).toBeGreaterThan(before.sp?.percentage ?? 0);
  });

  it("D) örnek dağılım: anne %25, müteveffa %30, eş %30, çocuk %15", () => {
    const factors: SupportFactor[] = [
      { key: "deceased", kind: "DECEASED", label: "M", units: 2 },
      { key: "sp", kind: "REAL_SPOUSE", label: "E", units: 2 },
      { key: "c1", kind: "REAL_CHILD", label: "C1", units: 1 },
      { key: "mo", kind: "REAL_MOTHER", label: "AN", units: 1 },
    ];
    const shares = buildShareEntries(factors, { father: 1 });

    expect(shares.mo?.display).toBe("1+1");
    expect(shares.mo?.fraction).toBe("(1+1)/7");
    expect(shares.deceased?.fraction).toBe("2/7");
    expect(shares.sp?.fraction).toBe("2/7");
    expect(shares.c1?.fraction).toBe("1/7");
    expect(shares.mo?.percentage).toBe(25);
    expect(shares.deceased?.percentage).toBe(30);
    expect(shares.sp?.percentage).toBe(30);
    expect(shares.c1?.percentage).toBe(15);
    expect(sumPercentages(shares)).toBe(100);
  });

  it("E) her period paydasında yüzdeler toplamı %100", () => {
    const scenarios: SupportFactor[][] = [
      [
        { key: "deceased", kind: "DECEASED", label: "M", units: 2 },
        { key: "sp", kind: "REAL_SPOUSE", label: "E", units: 2 },
        { key: "mo", kind: "REAL_MOTHER", label: "AN", units: 1 },
        { key: "fa", kind: "REAL_FATHER", label: "B", units: 1 },
      ],
      [
        { key: "deceased", kind: "DECEASED", label: "M", units: 2 },
        { key: "sp", kind: "REAL_SPOUSE", label: "E", units: 2 },
        { key: "c1", kind: "REAL_CHILD", label: "C1", units: 1 },
        { key: "mo", kind: "REAL_MOTHER", label: "AN", units: 1 },
      ],
    ];

    for (const factors of scenarios) {
      const shares = buildShareEntries(factors, { father: 1 });
      expect(sumPercentages(shares)).toBe(100);
    }
  });

  it("A) toplam 7 pay: 29,29,14,14,14 = 100", () => {
    const pct = normalizeReportPercentagesFromUnits([
      { key: "deceased", units: 2 },
      { key: "sp", units: 2 },
      { key: "mo", units: 1 },
      { key: "fa", units: 1 },
      { key: "c1", units: 1 },
    ]);
    expect(pct.deceased).toBe(29);
    expect(pct.sp).toBe(29);
    expect(pct.mo).toBe(14);
    expect(pct.fa).toBe(14);
    expect(pct.c1).toBe(14);
    expect(Object.values(pct).reduce((s, v) => s + v, 0)).toBe(100);
  });

  it("B) toplam 8 pay: 25,25,12.5 x4 = 100", () => {
    const pct = normalizeReportPercentagesFromUnits([
      { key: "deceased", units: 2 },
      { key: "sp", units: 2 },
      { key: "c1", units: 1 },
      { key: "c2", units: 1 },
      { key: "mo", units: 1 },
      { key: "fa", units: 1 },
    ]);
    expect(pct.deceased).toBe(25);
    expect(pct.sp).toBe(25);
    expect(pct.c1).toBe(12.5);
    expect(pct.c2).toBe(12.5);
    expect(pct.mo).toBe(12.5);
    expect(pct.fa).toBe(12.5);
    expect(Object.values(pct).reduce((s, v) => s + v, 0)).toBe(100);
  });

  it("C) parent transfer: 30,30,15,25 = 100", () => {
    const factors: SupportFactor[] = [
      { key: "deceased", kind: "DECEASED", label: "M", units: 2 },
      { key: "sp", kind: "REAL_SPOUSE", label: "E", units: 2 },
      { key: "c1", kind: "REAL_CHILD", label: "C1", units: 1 },
      { key: "mo", kind: "REAL_MOTHER", label: "AN", units: 1 },
    ];
    const shares = buildShareEntries(factors, { father: 1 });
    expect(shares.deceased?.percentage).toBe(30);
    expect(shares.sp?.percentage).toBe(30);
    expect(shares.c1?.percentage).toBe(15);
    expect(shares.mo?.percentage).toBe(25);
    expect(sumPercentages(shares)).toBe(100);
  });

  it("D) 7 pay örneğinde ham 28,57 / 14,29 gösterilmez", () => {
    const factors: SupportFactor[] = [
      { key: "deceased", kind: "DECEASED", label: "M", units: 2 },
      { key: "sp", kind: "REAL_SPOUSE", label: "E", units: 2 },
      { key: "mo", kind: "REAL_MOTHER", label: "AN", units: 1 },
      { key: "fa", kind: "REAL_FATHER", label: "B", units: 1 },
      { key: "c1", kind: "REAL_CHILD", label: "C1", units: 1 },
    ];
    const shares = buildShareEntries(factors);
    const formatted = Object.values(formatAllPercentages(shares)).join(" ");
    expect(formatted).not.toMatch(/28,57|14,29/);
    expect(formatted).toContain("%29");
    expect(formatted).toContain("%14");
  });

  it("formatPercentageTr Türkçe biçim", () => {
    expect(formatPercentageTr(25)).toBe("%25");
    expect(formatPercentageTr(12.5)).toBe("%12,5");
    expect(formatPercentageTr(29)).toBe("%29");
  });
});
