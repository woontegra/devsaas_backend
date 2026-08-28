import type { CalculationDraft } from "../types.js";
import { normalizeTrafficInjuryInput } from "./normalizeTrafficInjuryInput.js";

export class UnsupportedHashCalculationTypeError extends Error {
  constructor(calculationType: string) {
    super(`Hash normalizer henüz tanımlı değil: ${calculationType}`);
    this.name = "UnsupportedHashCalculationTypeError";
  }
}

/** Hesap motorunu etkileyen alanların canonical temsili — tek kaynak backend */
export function normalizeCalculationInput(draft: CalculationDraft): Record<string, unknown> {
  switch (draft.calculationType) {
    case "TRAFFIC_INJURY":
      return normalizeTrafficInjuryInput(draft);
    default:
      throw new UnsupportedHashCalculationTypeError(draft.calculationType);
  }
}
