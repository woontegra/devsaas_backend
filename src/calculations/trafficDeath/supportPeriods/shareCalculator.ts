import { SUPPORT_PERIOD_ASSUMPTIONS } from "./config.js";
import type { ShareEntry, SupportFactor, SupportFactorKind } from "./types.js";

export function formatFraction(units: number, total: number): string {
  if (total <= 0 || units <= 0) return "0";
  return `${units}/${total}`;
}

export function formatPayDisplay(
  kind: SupportFactorKind,
  baseUnits: number,
  transferredUnits: number
): string {
  if ((kind === "REAL_MOTHER" || kind === "REAL_FATHER") && transferredUnits > 0) {
    return `${baseUnits}+${transferredUnits}`;
  }
  return String(baseUnits);
}

/** Pay Dağılımı tablosu — pay / dönem toplamı; ebeveyn devri 2/n olarak birleştirilmez */
export function formatShareFraction(
  kind: SupportFactorKind,
  baseUnits: number,
  transferredUnits: number,
  total: number
): string {
  if (total <= 0) return "0";
  if ((kind === "REAL_MOTHER" || kind === "REAL_FATHER") && transferredUnits > 0) {
    return `(${baseUnits}+${transferredUnits})/${total}`;
  }
  return formatFraction(baseUnits, total);
}

/** Bilirkişi raporu yüzde gösterimi — %29, %12,5 */
export function formatPercentageTr(percentage: number): string {
  if (Number.isInteger(percentage)) {
    return `%${percentage}`;
  }
  const oneDecimal = Math.round(percentage * 10) / 10;
  const str = oneDecimal.toString().replace(".", ",");
  return `%${str}`;
}

function isHalfStepPercent(value: number): boolean {
  const doubled = value * 2;
  return (
    Math.abs(doubled - Math.round(doubled)) < 1e-6 &&
    Math.abs(value - Math.round(value)) > 1e-6
  );
}

/** Pay birimlerinden bilirkişi raporu yüzdeleri — toplam budget (varsayılan 100) */
export function normalizeReportPercentagesFromUnits(
  items: Array<{ key: string; units: number }>,
  budget = 100
): Record<string, number> {
  if (items.length === 0 || budget <= 0) return {};

  const totalUnits = items.reduce((sum, item) => sum + item.units, 0);
  if (totalUnits <= 0) return {};

  const exact = items.map((item) => ({
    key: item.key,
    exact: (item.units / totalUnits) * budget,
  }));

  const result: Record<string, number> = {};
  let fixedSum = 0;
  const integerItems: typeof exact = [];

  for (const entry of exact) {
    if (isHalfStepPercent(entry.exact)) {
      result[entry.key] = Math.round(entry.exact * 10) / 10;
      fixedSum += result[entry.key]!;
    } else {
      integerItems.push(entry);
    }
  }

  const integerBudget = budget - fixedSum;
  if (integerItems.length === 0) {
    return result;
  }

  const integerTotal = integerItems.reduce((sum, entry) => sum + entry.exact, 0);
  const floors = integerItems.map((entry) => {
    const scaled = integerTotal > 0 ? (entry.exact / integerTotal) * integerBudget : 0;
    return {
      key: entry.key,
      floor: Math.floor(scaled),
      frac: scaled - Math.floor(scaled),
    };
  });

  let remainder = integerBudget - floors.reduce((sum, entry) => sum + entry.floor, 0);
  floors.sort((a, b) => b.frac - a.frac || a.key.localeCompare(b.key));
  for (let i = 0; i < remainder; i++) {
    floors[i % floors.length]!.floor += 1;
  }

  for (const entry of floors) {
    result[entry.key] = entry.floor;
  }

  return result;
}

function isRedistributionPoolMember(kind: SupportFactorKind): boolean {
  return (
    kind === "DECEASED" ||
    kind === "REAL_SPOUSE" ||
    kind === "REAL_CHILD" ||
    kind === "PROBABLE_SPOUSE" ||
    kind === "PROBABLE_CHILD"
  );
}

function calculatePercentageDistribution(
  factors: SupportFactor[],
  transferredByKey: Map<string, number>
): Record<string, number> {
  if (factors.length === 0) return {};

  const mothers = factors.filter((f) => f.kind === "REAL_MOTHER");
  const fathers = factors.filter((f) => f.kind === "REAL_FATHER");
  const singleParent =
    mothers.length === 1 && fathers.length === 0
      ? mothers[0]!
      : fathers.length === 1 && mothers.length === 0
        ? fathers[0]!
        : null;

  if (singleParent) {
    const parentKey = singleParent.key;
    const transferred = transferredByKey.get(parentKey) ?? 0;
    const parentEffective = singleParent.units + transferred;
    const pool = factors.filter((f) => isRedistributionPoolMember(f.kind));
    const poolWeight = pool.reduce((sum, f) => sum + f.units, 0);
    const totalWeight = parentEffective + poolWeight;

    const rawParentPct =
      totalWeight > 0 ? (parentEffective / totalWeight) * 100 : 0;
    const capPct = SUPPORT_PERIOD_ASSUMPTIONS.singleParentMaxRate * 100;
    const parentPct = Math.min(Math.round(rawParentPct), capPct);
    const poolBudget = 100 - parentPct;

    const poolPercents =
      poolWeight > 0
        ? normalizeReportPercentagesFromUnits(
            pool.map((f) => ({ key: f.key, units: f.units })),
            poolBudget
          )
        : {};

    return { [parentKey]: parentPct, ...poolPercents };
  }

  return normalizeReportPercentagesFromUnits(
    factors.map((f) => ({ key: f.key, units: f.units }))
  );
}

export function buildShareEntries(
  factors: SupportFactor[],
  transferredParentUnits: { mother?: number; father?: number } = {}
): Record<string, ShareEntry> {
  if (factors.length === 0) return {};

  const transferredByKey = new Map<string, number>();
  const mother = factors.find((f) => f.kind === "REAL_MOTHER");
  const father = factors.find((f) => f.kind === "REAL_FATHER");

  if (mother && transferredParentUnits.father) {
    transferredByKey.set(mother.key, transferredParentUnits.father);
  }
  if (father && transferredParentUnits.mother) {
    transferredByKey.set(father.key, transferredParentUnits.mother);
  }

  const percentages = calculatePercentageDistribution(factors, transferredByKey);
  const totalUnits = factors.reduce((sum, f) => {
    return sum + f.units + (transferredByKey.get(f.key) ?? 0);
  }, 0);
  const entries: Record<string, ShareEntry> = {};

  for (const f of factors) {
    const transferredUnits = transferredByKey.get(f.key) ?? 0;
    const baseUnits = f.units;
    const display = formatPayDisplay(f.kind, baseUnits, transferredUnits);
    const percentage = percentages[f.key] ?? 0;

    entries[f.key] = {
      baseUnits,
      transferredUnits,
      display,
      fraction: formatShareFraction(f.kind, baseUnits, transferredUnits, totalUnits),
      rate: percentage / 100,
      percentage,
    };
  }

  return entries;
}

export function activeFactorsToShareMap(factors: SupportFactor[]): Record<string, string> {
  const entries = buildShareEntries(factors);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(entries)) {
    out[k] = v.display;
  }
  return out;
}

export function sumPercentages(shares: Record<string, ShareEntry>): number {
  return Object.values(shares).reduce((sum, entry) => sum + entry.percentage, 0);
}

export function formatAllPercentages(shares: Record<string, ShareEntry>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(shares).map(([key, entry]) => [key, formatPercentageTr(entry.percentage)])
  );
}
