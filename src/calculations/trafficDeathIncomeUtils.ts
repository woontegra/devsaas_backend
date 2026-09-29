import type { AccidentIncomeBlock, TrafficDeathDraft } from "./types.js";
import { getNetMinWageForDate } from "../data/netMinWage.js";
import { resolveIncomeMode } from "./validateAccidentIncome.js";

export function resolveTrafficDeathEffectiveNetIncome(draft: TrafficDeathDraft): number | null {
  const eventDate = draft.common?.eventDate;
  if (draft.employmentStatus === "NOT_WORKING") {
    const v = draft.nonWorkingSelectedIncome;
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  }
  if (draft.employmentStatus !== "WORKING") return null;
  return resolveWorkingAccidentIncomeAmount(draft.accidentIncome, eventDate);
}

export function resolveWorkingAccidentIncomeAmount(
  income: AccidentIncomeBlock | undefined,
  eventDate: string | undefined
): number | null {
  const mode = resolveIncomeMode(income);
  if (mode === "minWage") {
    if (!eventDate) return null;
    return getNetMinWageForDate(eventDate);
  }
  if (mode === "fixed") {
    const v = income?.fixedAmount;
    return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
  }
  const avg = income?.averageNetResult;
  return typeof avg === "number" && Number.isFinite(avg) && avg > 0 ? avg : null;
}

export function isTrafficDeathIncomeSectionComplete(draft: TrafficDeathDraft): boolean {
  if (draft.employmentStatus !== "WORKING" && draft.employmentStatus !== "NOT_WORKING") {
    return false;
  }
  if (draft.employmentStatus === "NOT_WORKING") {
    return resolveTrafficDeathEffectiveNetIncome(draft) != null;
  }
  return resolveWorkingAccidentIncomeAmount(draft.accidentIncome, draft.common?.eventDate) != null;
}
