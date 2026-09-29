import { addDaysIso, compareIso } from "../../trafficInjury/dateUtils.js";
import type { TrafficDeathDraft } from "../../types.js";
import { buildFactorRegistry, parseSupportContext } from "./parseContext.js";
import { buildShareEntries, formatPercentageTr } from "./shareCalculator.js";
import {
  buildTimelineEvents,
  computeParentTransfer,
  isInactiveSegment,
  resolvePeriodType,
  sortedBoundaries,
  stateAtDate,
  stateToFactors,
  timelineEndDate,
} from "./timeline.js";
import type { SupportPeriod, SupportPeriodMotorResult } from "./types.js";

export function calculateTrafficDeathSupportPeriods(
  draft: TrafficDeathDraft
): SupportPeriodMotorResult {
  const { context, personLives, errors: parseErrors } = parseSupportContext(draft);
  if (!context || parseErrors.length) {
    return {
      periods: [],
      shareRatioPeriods: [],
      columnKeys: [],
      personLives,
      warnings: [],
      errors: parseErrors,
    };
  }

  const events = buildTimelineEvents(context);
  const boundaries = sortedBoundaries(context, events);
  const end = timelineEndDate(context);
  const periods: SupportPeriod[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const startDate = boundaries[i]!;
    const nextBoundary = boundaries[i + 1]!;
    const endDate = addDaysIso(nextBoundary, -1);
    if (compareIso(startDate, endDate) > 0) continue;
    if (compareIso(endDate, context.deathDate) < 0) continue;
    if (compareIso(startDate, end) > 0) continue;

    const segStart = compareIso(startDate, context.deathDate) < 0 ? context.deathDate : startDate;
    const segEnd = compareIso(endDate, end) > 0 ? end : endDate;
    if (compareIso(segStart, segEnd) > 0) continue;

    const periodType = resolvePeriodType(segStart, segEnd, context.calculationDate);
    const inactive = isInactiveSegment(segStart, segEnd, context, events);
    if (inactive.inactive) {
      periods.push({
        startDate: segStart,
        endDate: segEnd,
        periodType,
        label: inactive.label,
        supportActive: false,
        activeFactors: [],
        shares: {},
      });
      continue;
    }

    const before = stateAtDate(context, events, addDaysIso(segStart, -1));
    const after = stateAtDate(context, events, segStart);
    const transfer = computeParentTransfer(before, after, context);
    const activeFactors = stateToFactors(after, context);
    const shares = buildShareEntries(activeFactors, transfer);

    periods.push({
      startDate: segStart,
      endDate: segEnd,
      periodType,
      supportActive: true,
      activeFactors,
      shares,
    });
  }

  const registry = buildFactorRegistry(context);
  const columnKeys = [
    { key: "deceased", header: "MÜTEVEFFA" },
    ...[...registry.entries()]
      .filter(([k]) => k !== "deceased")
      .map(([key, meta]) => ({
        key,
        header: meta.label,
        synthetic: meta.kind.startsWith("PROBABLE"),
      })),
  ];

  const shareRatioPeriods = periods.map((p) => ({
    startDate: p.startDate,
    endDate: p.endDate,
    label: p.label,
    periodType: p.periodType,
    shares: p.supportActive
      ? Object.fromEntries(Object.entries(p.shares).map(([k, v]) => [k, v.fraction]))
      : {},
    percentages: p.supportActive
      ? Object.fromEntries(
          Object.entries(p.shares).map(([k, v]) => [k, formatPercentageTr(v.percentage)])
        )
      : {},
  }));

  return {
    periods,
    shareRatioPeriods,
    columnKeys,
    personLives: context.personLives,
    warnings: [],
    errors: [],
  };
}
