/** KN / iskonto çarpanı — tam hassasiyet hesap, 8 ondalık gösterim (referans cetvel) */

export const WAGE_INCREASE_RATE = 1.1;

export function knRawForPeriod(periodIndex: number): number {
  return Math.pow(WAGE_INCREASE_RATE, periodIndex);
}

export function discountRawForKn(knRaw: number): number {
  return 1 / knRaw;
}

/** Gösterim: 8 ondalık, kesme (yuvarlama değil) */
export function truncateToDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.trunc(value * factor) / factor;
}

export function formatKn8Display(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const t = truncateToDecimals(value, 8);
  return t.toLocaleString("tr-TR", { minimumFractionDigits: 8, maximumFractionDigits: 8 });
}
