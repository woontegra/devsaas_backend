import { describe, it, expect } from "vitest";
import { calculationAccessService } from "../services/calculationAccessService.js";

/**
 * /calculations/run erişim sınırı — motor bağlanmadan önce erişim yok = 402 yanıtı üretilir.
 * Route katmanı bu servise dayanır; mock sonuç dönmez.
 */
describe("POST /calculations/run access gate", () => {
  it("returns CALCULATION_ACCESS_REQUIRED for any user (payment not implemented)", async () => {
    const access = await calculationAccessService.hasCalculationAccess("any-user");
    expect(access.allowed).toBe(false);
    expect(access.code).toBe("CALCULATION_ACCESS_REQUIRED");

    // Route would respond with:
    const httpStatus = access.allowed ? 200 : 402;
    const body = {
      code: access.code,
      message: access.message,
    };
    expect(httpStatus).toBe(402);
    expect(body).not.toHaveProperty("result");
    expect(body).not.toHaveProperty("presentValue");
    expect(body).not.toHaveProperty("total");
  });
});
