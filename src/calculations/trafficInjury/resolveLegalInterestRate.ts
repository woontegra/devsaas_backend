import {
  LEGAL_INTEREST_RATE_PERIODS,
  type LegalInterestRatePeriod,
} from "../../data/legalInterestRates.js";

export interface ResolvedLegalInterestRate {
  rate: number | null;
  period: LegalInterestRatePeriod | null;
}

function periodContainsDate(period: LegalInterestRatePeriod, date: string): boolean {
  if (date < period.startDate) return false;
  if (period.endDate == null) return true;
  return date <= period.endDate;
}

export function resolveLegalInterestRate(
  date: string,
  periods: LegalInterestRatePeriod[] = LEGAL_INTEREST_RATE_PERIODS
): ResolvedLegalInterestRate {
  if (!date) return { rate: null, period: null };
  for (const p of periods) {
    if (periodContainsDate(p, date)) {
      return { rate: p.annualRatePercent, period: p };
    }
  }
  return { rate: null, period: null };
}

/** Eksik dönem aralıkları — raporlama / veri girişi planlaması */
export function describeMissingLegalInterestCoverage(
  startDate: string,
  endDate: string,
  periods: LegalInterestRatePeriod[] = LEGAL_INTEREST_RATE_PERIODS
): string[] {
  if (!startDate || !endDate || startDate >= endDate) return [];
  if (periods.length === 0) {
    return [`${startDate} – ${endDate} (tablo boş)`];
  }
  const gaps: string[] = [];
  let cursor = startDate;
  while (cursor < endDate) {
    const resolved = resolveLegalInterestRate(cursor, periods);
    if (resolved.rate == null || !resolved.period) {
      gaps.push(`${cursor} – ${endDate} (oran tanımsız)`);
      break;
    }
    const periodEnd = resolved.period.endDate ?? endDate;
    const segEnd = periodEnd < endDate ? periodEnd : endDate;
    cursor = segEnd;
    if (cursor < endDate) {
      const next = addOneDay(cursor);
      if (next > endDate) break;
      cursor = next;
    } else {
      break;
    }
  }
  return gaps;
}

function addOneDay(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m?.[1] || !m[2] || !m[3]) return iso;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}
