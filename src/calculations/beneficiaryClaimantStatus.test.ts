import { describe, it, expect } from "vitest";
import type { Beneficiary } from "./types.js";
import {
  countBeneficiariesByClaimantStatus,
  resolveBeneficiaryClaimantStatus,
} from "./beneficiaryClaimantStatus.js";

describe("beneficiaryClaimantStatus", () => {
  it("missing claimantStatus defaults to PLAINTIFF", () => {
    const b = { id: "1" } as Beneficiary;
    expect(resolveBeneficiaryClaimantStatus(b)).toBe("PLAINTIFF");
  });

  it("counts groups separately", () => {
    const rows: Beneficiary[] = [
      { id: "1", fullName: "A", relation: "spouse", birthDate: "", gender: "female" },
      { id: "2", fullName: "B", relation: "child", birthDate: "", gender: "male", claimantStatus: "OUT_OF_CASE" },
    ];
    expect(countBeneficiariesByClaimantStatus(rows)).toEqual({ plaintiff: 1, outOfCase: 1 });
  });
});
