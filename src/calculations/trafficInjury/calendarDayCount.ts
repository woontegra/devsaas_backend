import { parseIsoDateParts } from "./dateUtils.js";

/**
 * Gerçek takvim gün farkı — yasal faiz için.
 * paymentDate = calculationDate → 0
 * paymentDate < calculationDate → UTC takvim günü farkı
 * 30/360 KULLANILMAZ.
 */
export function calendarDaysBetween(startIso: string, endIso: string): number {
  const s = parseIsoDateParts(startIso);
  const e = parseIsoDateParts(endIso);
  if (!s || !e) return 0;
  if (startIso >= endIso) return 0;

  const start = Date.UTC(s.y, s.m - 1, s.d);
  const end = Date.UTC(e.y, e.m - 1, e.d);
  return Math.round((end - start) / 86_400_000);
}
