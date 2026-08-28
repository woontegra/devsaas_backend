import type { TrafficInjuryDraft } from "../types.js";
import type { DateRange } from "./dateUtils.js";
import { maxIso, minIso } from "./dateUtils.js";

export interface ProcessedWindow {
  startDate: string;
  endDate: string;
}

/** İşlemiş dönem penceresi — kullanıcı tarihleri veya varsayılan kaza/hesap tarihi */
export function buildProcessedWindow(draft: TrafficInjuryDraft): ProcessedWindow {
  const startDate = draft.processedPeriodStartDate ?? draft.common.eventDate;
  const endDate = draft.processedPeriodEndDate ?? draft.common.calculationDate;
  return {
    startDate: minIso(startDate, endDate),
    endDate: maxIso(startDate, endDate),
  };
}

/** Maluliyet sonrası işlemiş dönem aralığı */
export function buildPermanentProcessedRange(
  draft: TrafficInjuryDraft,
  window: ProcessedWindow
): DateRange | null {
  const disabilityStart = draft.disability.disabilityStartDate;
  if (!disabilityStart) return null;

  const startDate = maxIso(disabilityStart, window.startDate);
  const endDate = window.endDate;
  if (startDate > endDate) return null;
  return { startDate, endDate };
}
