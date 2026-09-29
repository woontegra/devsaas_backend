import type { Beneficiary, BeneficiaryClaimantStatus } from "./types.js";

export function resolveBeneficiaryClaimantStatus(
  beneficiary: Pick<Beneficiary, "claimantStatus">
): BeneficiaryClaimantStatus {
  return beneficiary.claimantStatus === "OUT_OF_CASE" ? "OUT_OF_CASE" : "PLAINTIFF";
}

export function countBeneficiariesByClaimantStatus(beneficiaries: Beneficiary[]): {
  plaintiff: number;
  outOfCase: number;
} {
  let plaintiff = 0;
  let outOfCase = 0;
  for (const b of beneficiaries) {
    if (resolveBeneficiaryClaimantStatus(b) === "OUT_OF_CASE") outOfCase++;
    else plaintiff++;
  }
  return { plaintiff, outOfCase };
}
