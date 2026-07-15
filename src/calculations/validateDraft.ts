import { CALCULATION_SCHEMA_VERSION, type CalculationValidateResponse } from "./types.js";
import { isObject } from "./validationHelpers.js";
import { validateTrafficInjuryDraft } from "./validateTrafficInjury.js";
import { validateTrafficDeathDraft } from "./validateTrafficDeath.js";
import { validateWorkInjuryDraft } from "./validateWorkInjury.js";
import { validateWorkDeathDraft } from "./validateWorkDeath.js";

/**
 * Tür bazlı doğrulama dispatcher — aktüeryal hesap / mortalite / parasal sonuç yok.
 */
export function validateCalculationDraft(input: unknown): CalculationValidateResponse {
  if (!isObject(input)) {
    return {
      valid: false,
      schemaVersion: CALCULATION_SCHEMA_VERSION,
      errors: [{ field: "", code: "INVALID_BODY", message: "İstek gövdesi bir nesne olmalıdır." }],
      warnings: [],
      completedSections: [],
      missingSections: [],
      message: "Veri doğrulaması başarısız.",
    };
  }

  switch (input.calculationType) {
    case "TRAFFIC_INJURY":
      return validateTrafficInjuryDraft(input);
    case "TRAFFIC_DEATH":
      return validateTrafficDeathDraft(input);
    case "WORK_INJURY":
      return validateWorkInjuryDraft(input);
    case "WORK_DEATH":
      return validateWorkDeathDraft(input);
    default:
      return {
        valid: false,
        schemaVersion: CALCULATION_SCHEMA_VERSION,
        errors: [{ field: "calculationType", code: "INVALID_TYPE", message: "Geçersiz hesap türü." }],
        warnings: [],
        completedSections: [],
        missingSections: [],
        message: "Geçersiz hesap türü.",
      };
  }
}
