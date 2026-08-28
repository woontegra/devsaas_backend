import { createHash } from "node:crypto";
import type { CalculationDraft } from "../types.js";
import { canonicalJsonStringify } from "./canonicalJson.js";
import { normalizeCalculationInput } from "./calculationInputNormalizer.js";
import { CALCULATION_HASH_VERSION } from "./calculationHashVersion.js";

export { CALCULATION_HASH_VERSION };

export function hashCalculationInput(draft: CalculationDraft): string {
  const normalized = normalizeCalculationInput(draft);
  const json = canonicalJsonStringify(normalized);
  return createHash("sha256").update(json, "utf8").digest("hex");
}
