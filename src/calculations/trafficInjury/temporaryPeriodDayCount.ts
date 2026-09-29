/**
 * Geçici iş göremezlik gün sayısı.
 * Kısmi aralık: dahil takvim günü.
 * 01.01–30.06 ve 01.07–31.12: 180.
 * 360 günü aşan dönem: 360.
 * İşlemiş / işleyecek dönem 30/360 kuralı burada kullanılmaz.
 */
export function deriveTemporaryPeriodDayCount(startDate: string, endDate: string): number {
  if (!startDate || !endDate || startDate > endDate) return 0;
  if (isActuarialHalfYear(startDate, endDate)) return 180;
  const days = inclusiveCalendarDays(startDate, endDate);
  if (days <= 0) return 0;
  return Math.min(days, 360);
}

function isActuarialHalfYear(startDate: string, endDate: string): boolean {
  const start = parseIso(startDate);
  const end = parseIso(endDate);
  if (!start || !end || start.y !== end.y) return false;
  const firstHalf = start.m === 1 && start.d === 1 && end.m === 6 && end.d === 30;
  const secondHalf = start.m === 7 && start.d === 1 && end.m === 12 && end.d === 31;
  return firstHalf || secondHalf;
}

function inclusiveCalendarDays(startDate: string, endDate: string): number {
  const start = parseIso(startDate);
  const end = parseIso(endDate);
  if (!start || !end) return 0;
  const startUtc = Date.UTC(start.y, start.m - 1, start.d);
  const endUtc = Date.UTC(end.y, end.m - 1, end.d);
  return Math.round((endUtc - startUtc) / 86_400_000) + 1;
}

function parseIso(iso: string): { y: number; m: number; d: number } | null {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}
