import { parseIsoDateParts, type IsoDateParts } from "./dateUtils.js";

/**
 * 30/360 aktüeryal gün sayısı (dahil).
 * - Tam yıl 01.01–31.12 → 360
 * - Yarım yıl 01.01–30.06 → 180
 * - Tek dönem en fazla 360 gün
 */
export function actuarialDays360Inclusive(startDate: string, endDate: string): number {
  if (!startDate || !endDate || startDate > endDate) return 0;

  const s = parseIsoDateParts(startDate);
  const e = parseIsoDateParts(endDate);
  if (!s || !e) return 0;

  const d1 = normalizeDay360(s);
  const d2 = normalizeDay360(e);

  const raw = (e.y - s.y) * 360 + (e.m - s.m) * 30 + (d2 - d1) + 1;
  return Math.min(Math.max(0, raw), 360);
}

function normalizeDay360(p: IsoDateParts): number {
  if (p.d === 31) return 30;
  return p.d;
}
