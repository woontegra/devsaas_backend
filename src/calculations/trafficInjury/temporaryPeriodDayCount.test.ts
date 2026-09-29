import { describe, expect, it } from "vitest";
import { actuarialDays360Inclusive } from "./dayCount360.js";
import { deriveTemporaryPeriodDayCount } from "./temporaryPeriodDayCount.js";

describe("geçici İG — dahil takvim günü", () => {
  it("01.09.2022–12.12.2022 = 103", () => {
    expect(deriveTemporaryPeriodDayCount("2022-09-01", "2022-12-12")).toBe(103);
  });

  it("01.09.2022–31.12.2022 = 122", () => {
    expect(deriveTemporaryPeriodDayCount("2022-09-01", "2022-12-31")).toBe(122);
  });

  it("01.01.2023–19.01.2023 = 19", () => {
    expect(deriveTemporaryPeriodDayCount("2023-01-01", "2023-01-19")).toBe(19);
  });

  it("20.01.2023–30.06.2023 = 162", () => {
    expect(deriveTemporaryPeriodDayCount("2023-01-20", "2023-06-30")).toBe(162);
  });

  it("01.07.2023–31.12.2023 = 180", () => {
    expect(deriveTemporaryPeriodDayCount("2023-07-01", "2023-12-31")).toBe(180);
  });

  it("01.01.2024–31.08.2024 = 244", () => {
    expect(deriveTemporaryPeriodDayCount("2024-01-01", "2024-08-31")).toBe(244);
  });
});

describe("geçici İG — yarıyıl ve 360 sınırı", () => {
  it("01.01–30.06 = 180", () => {
    expect(deriveTemporaryPeriodDayCount("2022-01-01", "2022-06-30")).toBe(180);
  });

  it("01.07–31.12 = 180", () => {
    expect(deriveTemporaryPeriodDayCount("2022-07-01", "2022-12-31")).toBe(180);
  });

  it("tam yıl ve daha uzun dönem 360 ile sınırlı", () => {
    expect(deriveTemporaryPeriodDayCount("2025-01-01", "2025-12-31")).toBe(360);
    expect(deriveTemporaryPeriodDayCount("2020-01-01", "2022-12-31")).toBe(360);
  });
});

describe("30/360 işlemiş-işleyecek kuralı ayrı kalır", () => {
  it("kısmi aralık 30/360 ile takvim gününden farklıdır", () => {
    expect(actuarialDays360Inclusive("2022-09-01", "2022-12-12")).toBe(102);
    expect(deriveTemporaryPeriodDayCount("2022-09-01", "2022-12-12")).toBe(103);
  });
});
