import { calculateActuarial } from "../core/actuarialEngine.js";
import { validateActuarialInput } from "../core/validation.js";
import type { ActuarialInput, ActuarialResult } from "../core/types.js";

export type CalculateOutcome =
  | { success: true; result: ActuarialResult }
  | { success: false; errors: string[] };

export function runCalculation(input: unknown): CalculateOutcome {
  const validated = validateActuarialInput(input);
  if (!validated.valid) {
    return { success: false, errors: validated.errors };
  }
  const result = calculateActuarial(validated.data as ActuarialInput);
  return { success: true, result };
}
