/** Kuruş hassasiyetinde yuvarlama — floating point sapmasını önler */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function dailyFromMonthly(monthlyNet: number): number {
  return roundMoney(monthlyNet / 30);
}
