import { NET_MIN_WAGE_PERIODS } from "../../data/netMinWage.js";
import type { Trh2010LifeEntry } from "../../data/trh2010.js";

export interface IsoDateParts {
  y: number;
  m: number;
  d: number;
}

export function parseIsoDateParts(iso: string): IsoDateParts | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m?.[1] || !m[2] || !m[3]) return null;
  return { y: parseInt(m[1], 10), m: parseInt(m[2], 10), d: parseInt(m[3], 10) };
}

export function compareIso(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function maxIso(a: string, b: string): string {
  return compareIso(a, b) >= 0 ? a : b;
}

export function minIso(a: string, b: string): string {
  return compareIso(a, b) <= 0 ? a : b;
}

export function addDaysIso(iso: string, days: number): string {
  const p = parseIsoDateParts(iso);
  if (!p) return iso;
  const dt = new Date(Date.UTC(p.y, p.m - 1, p.d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return formatIsoFromDate(dt);
}

export function addYearsToIso(birthDate: string, years: number): string | null {
  const p = parseIsoDateParts(birthDate);
  if (!p) return null;
  return `${p.y + years}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function addLifeExpectancyToDate(eventDate: string, le: Trh2010LifeEntry): string | null {
  const p = parseIsoDateParts(eventDate);
  if (!p) return null;
  const base = new Date(p.y, p.m - 1, p.d);
  base.setFullYear(base.getFullYear() + le.year);
  base.setMonth(base.getMonth() + le.month);
  base.setDate(base.getDate() + le.day);
  return formatIsoFromDate(base);
}

function formatIsoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function completedAgeYears(birthDate: string, eventDate: string): number | null {
  const b = parseIsoDateParts(birthDate);
  const e = parseIsoDateParts(eventDate);
  if (!b || !e) return null;

  let age = e.y - b.y;
  if (e.m < b.m || (e.m === b.m && e.d < b.d)) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

export interface CalendarAgeYmd {
  years: number;
  months: number;
  days: number;
}

/** Doğum + kaza tarihinden tam takvim yaşı (TRH lookup key ayrı: completedAgeYears) */
export function calendarAgeAtEvent(birthDate: string, eventDate: string): CalendarAgeYmd | null {
  const b = parseIsoDateParts(birthDate);
  const e = parseIsoDateParts(eventDate);
  if (!b || !e) return null;

  let years = e.y - b.y;
  let months = e.m - b.m;
  let days = e.d - b.d;

  if (days < 0) {
    months -= 1;
    days += new Date(e.y, e.m - 1, 0).getDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return null;
  return { years, months, days };
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

/** [start,end] aralığını min wage dönem sınırlarına göre böler */
export function splitRangeByBoundaries(range: DateRange, boundaries: string[]): DateRange[] {
  const { startDate, endDate } = range;
  if (startDate > endDate) return [];

  const cuts = new Set<string>();
  cuts.add(startDate);
  for (const b of boundaries) {
    if (b > startDate && b <= endDate) cuts.add(b);
  }
  cuts.add(addDaysIso(endDate, 1));

  const sorted = [...cuts].sort();
  const out: DateRange[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const segStart = sorted[i]!;
    const next = sorted[i + 1]!;
    const segEnd = addDaysIso(next, -1);
    if (segStart <= endDate && segEnd >= startDate) {
      out.push({
        startDate: maxIso(segStart, startDate),
        endDate: minIso(segEnd, endDate),
      });
    }
  }
  return out.filter((r) => r.startDate <= r.endDate);
}

/** min wage dönem bitiş+1 günleri dahil tüm sınır tarihleri */
export function minWageBoundaryDates(start: string, end: string): string[] {
  const dates: string[] = [];
  for (const p of NET_MIN_WAGE_PERIODS) {
    const next = addDaysIso(p.endDate, 1);
    if (next > start && next <= end) dates.push(next);
  }
  return dates;
}

/** Aralıktan çıkarılan dönemleri çıkarır */
export function subtractRanges(base: DateRange, exclusions: DateRange[]): DateRange[] {
  let segments: DateRange[] = [base];
  for (const ex of exclusions) {
    const next: DateRange[] = [];
    for (const seg of segments) {
      next.push(...subtractOneRange(seg, ex));
    }
    segments = next;
  }
  return segments.filter((r) => r.startDate <= r.endDate);
}

function subtractOneRange(base: DateRange, ex: DateRange): DateRange[] {
  if (ex.endDate < base.startDate || ex.startDate > base.endDate) return [base];
  const out: DateRange[] = [];
  if (base.startDate < ex.startDate) {
    out.push({
      startDate: base.startDate,
      endDate: minIso(addDaysIso(ex.startDate, -1), base.endDate),
    });
  }
  if (ex.endDate < base.endDate) {
    out.push({
      startDate: maxIso(addDaysIso(ex.endDate, 1), base.startDate),
      endDate: base.endDate,
    });
  }
  return out.filter((r) => r.startDate <= r.endDate);
}

/** İki aralığın kesişimi */
export function intersectRanges(a: DateRange, b: DateRange): DateRange | null {
  const startDate = maxIso(a.startDate, b.startDate);
  const endDate = minIso(a.endDate, b.endDate);
  if (startDate > endDate) return null;
  return { startDate, endDate };
}

/** Min wage dönem sınırlarına göre bölünmüş alt aralıklar */
export function splitByMinWagePeriods(range: DateRange): DateRange[] {
  return splitRangeByBoundaries(range, minWageBoundaryDates(range.startDate, range.endDate));
}
