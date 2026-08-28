/**
 * Kanuni / yasal faiz oranı dönem tablosu.
 * Oranlar yıllık yüzde (%) olarak girilir; formül: anaPara × oran × gün / 36500
 *
 * Kaynak: Kanuni Faiz, Temerrüt Faizi ve Ticari Temerrüt Faizi Oranları tablosu —
 * yalnızca KANUNİ / YASAL FAİZ ORANI sütunu.
 */
export interface LegalInterestRatePeriod {
  startDate: string;
  /** null = süresiz (açık uçlu dönem) */
  endDate: string | null;
  /** Yıllık kanuni faiz oranı (%) */
  annualRatePercent: number;
  label?: string;
}

export const LEGAL_INTEREST_RATE_PERIODS: LegalInterestRatePeriod[] = [
  { startDate: "1984-12-19", endDate: "1997-12-31", annualRatePercent: 30 },
  { startDate: "1998-01-01", endDate: "1999-12-31", annualRatePercent: 50 },
  { startDate: "2000-01-01", endDate: "2002-06-30", annualRatePercent: 60 },
  { startDate: "2002-07-01", endDate: "2003-06-30", annualRatePercent: 55 },
  { startDate: "2003-07-01", endDate: "2003-12-31", annualRatePercent: 50 },
  { startDate: "2004-01-01", endDate: "2004-06-30", annualRatePercent: 43 },
  { startDate: "2004-07-01", endDate: "2005-04-30", annualRatePercent: 38 },
  { startDate: "2005-05-01", endDate: "2005-12-31", annualRatePercent: 12 },
  { startDate: "2006-01-01", endDate: "2024-05-31", annualRatePercent: 9 },
  { startDate: "2024-06-01", endDate: "2026-07-30", annualRatePercent: 24 },
  { startDate: "2026-07-31", endDate: null, annualRatePercent: 31 },
];
