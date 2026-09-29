import { addDaysIso, addYearsToIso, compareIso } from "../../trafficInjury/dateUtils.js";
import {
  DECEASED_KEY,
  PROBABLE_CHILD_1_KEY,
  PROBABLE_CHILD_2_KEY,
  PROBABLE_SPOUSE_KEY,
  SUPPORT_PERIOD_ASSUMPTIONS,
} from "./config.js";
import { childSupportExitDate } from "./childSupportDates.js";
import type { ParsedSupportContext, TimelineEvent } from "./types.js";

/** Pay timeline üst sınırı — TRAFFIC_DEATH: müteveffa muhtemel ömür sonu (mutlak) */
export function collectSupportEndCandidates(ctx: ParsedSupportContext): string[] {
  const dates: string[] = [ctx.deathDate];

  if (ctx.deceasedProbableLifeEndDate) {
    dates.push(ctx.deceasedProbableLifeEndDate);
  }

  if (ctx.isChildAtDeath && ctx.rearingEndAge != null) {
    const rearingEnd = addYearsToIso(ctx.deceasedBirthDate, ctx.rearingEndAge);
    if (rearingEnd && compareIso(rearingEnd, ctx.deathDate) > 0) {
      dates.push(rearingEnd);
    }
  }

  if (ctx.militaryStartDate && ctx.militaryDurationMonths) {
    dates.push(addDaysIso(ctx.militaryStartDate, ctx.militaryDurationMonths * 30));
  }

  // Hak sahibi çıkışları timeline boundary üretimi için event listesinde kalır;
  // üst sınır yalnızca müteveffa muhtemel ömür sonudur (timelineEndDate).

  if (ctx.generateProbableFamily) {
    dates.push(...collectProbableFamilyEndDates(ctx));
  }

  return dates;
}

/**
 * TRAFFIC_DEATH mutlak üst sınır: müteveffanın muhtemel ömür sonu.
 * Hak sahibi destek sonları bu tarihten sonra timeline’ı uzatamaz.
 * Bu tarih SON hesap günüdür (inclusive).
 */
export function timelineEndDate(ctx: ParsedSupportContext): string {
  if (ctx.deceasedProbableLifeEndDate) {
    return ctx.deceasedProbableLifeEndDate;
  }
  return ctx.deathDate;
}

/**
 * Inclusive last support/calculation day → timeline exit boundary (start of next day).
 * When exit coincides with deceased probable life end, shift to lifeEnd+1 so the life-end
 * day remains inside the prior period (no empty life-end marker row).
 */
function exclusiveExitBoundary(
  inclusiveLastDay: string,
  deceasedProbableLifeEndDate: string | null
): string {
  if (
    deceasedProbableLifeEndDate &&
    compareIso(inclusiveLastDay, deceasedProbableLifeEndDate) === 0
  ) {
    return addDaysIso(deceasedProbableLifeEndDate, 1);
  }
  return inclusiveLastDay;
}

function collectProbableFamilyEndDates(ctx: ParsedSupportContext): string[] {
  const dates: string[] = [];
  let marriageDate: string | null = null;
  const waitYears = SUPPORT_PERIOD_ASSUMPTIONS.postMilitaryWaitYears;

  let flowStart = ctx.deathDate;
  if (ctx.isChildAtDeath && ctx.rearingEndAge != null) {
    const rearingEnd = addYearsToIso(ctx.deceasedBirthDate, ctx.rearingEndAge);
    if (rearingEnd && compareIso(rearingEnd, ctx.deathDate) > 0) {
      flowStart = rearingEnd;
      dates.push(rearingEnd);
    }
  }

  if (
    ctx.deceasedGender === "male" &&
    ctx.militaryStartDate &&
    ctx.militaryDurationMonths &&
    compareIso(ctx.militaryStartDate, flowStart) >= 0
  ) {
    const milEnd = addDaysIso(ctx.militaryStartDate, ctx.militaryDurationMonths * 30);
    dates.push(milEnd);
    marriageDate = addYearsToIso(milEnd, waitYears);
  } else {
    marriageDate = addYearsToIso(flowStart, waitYears);
  }

  if (!marriageDate) return dates;
  dates.push(marriageDate);

  const child1Birth = addYearsToIso(
    marriageDate,
    SUPPORT_PERIOD_ASSUMPTIONS.firstProbableChildAfterMarriageYears
  );
  if (child1Birth) {
    dates.push(child1Birth);
    const exit1 = childSupportExitDate(child1Birth, "female", true);
    if (exit1) dates.push(exit1);

    const child2Birth = addYearsToIso(
      child1Birth,
      SUPPORT_PERIOD_ASSUMPTIONS.secondProbableChildAfterFirstYears
    );
    if (child2Birth) {
      dates.push(child2Birth);
      const exit2 = childSupportExitDate(child2Birth, "male", true);
      if (exit2) dates.push(exit2);
    }
  }

  return dates;
}

export function buildTimelineEvents(ctx: ParsedSupportContext): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  events.push({ date: ctx.deathDate, kind: "DEATH", label: "Ölüm" });

  if (ctx.isChildAtDeath && ctx.rearingEndAge != null) {
    const rearingEnd = addYearsToIso(ctx.deceasedBirthDate, ctx.rearingEndAge);
    if (rearingEnd && compareIso(rearingEnd, ctx.deathDate) > 0) {
      events.push({ date: ctx.deathDate, kind: "REARING_START" });
      events.push({
        date: rearingEnd,
        kind: "REARING_END",
        label: "Yetiştirme Dönemi",
      });
    }
  }

  if (
    ctx.deceasedGender === "male" &&
    ctx.militaryStartDate &&
    ctx.militaryDurationMonths
  ) {
    const milEnd = addDaysIso(ctx.militaryStartDate, ctx.militaryDurationMonths * 30);
    events.push({ date: ctx.militaryStartDate, kind: "MILITARY_START" });
    events.push({ date: milEnd, kind: "MILITARY_END", label: "Askerlik Dönemi" });
  }

  if (ctx.generateProbableFamily) {
    let marriageDate: string | null = null;
    const waitYears = SUPPORT_PERIOD_ASSUMPTIONS.postMilitaryWaitYears;

    let flowStart = ctx.deathDate;
    if (ctx.isChildAtDeath && ctx.rearingEndAge != null) {
      const rearingEnd = addYearsToIso(ctx.deceasedBirthDate, ctx.rearingEndAge);
      if (rearingEnd && compareIso(rearingEnd, ctx.deathDate) > 0) {
        flowStart = rearingEnd;
      }
    }

    if (
      ctx.deceasedGender === "male" &&
      ctx.militaryStartDate &&
      ctx.militaryDurationMonths &&
      compareIso(ctx.militaryStartDate, flowStart) >= 0
    ) {
      const milEnd = addDaysIso(ctx.militaryStartDate, ctx.militaryDurationMonths * 30);
      marriageDate = addYearsToIso(milEnd, waitYears);
    } else {
      marriageDate = addYearsToIso(flowStart, waitYears);
    }

    if (marriageDate && compareIso(marriageDate, ctx.deathDate) > 0) {
      events.push({
        date: marriageDate,
        kind: "PROBABLE_MARRIAGE",
        factorKey: PROBABLE_SPOUSE_KEY,
      });

      const child1Birth = addYearsToIso(
        marriageDate,
        SUPPORT_PERIOD_ASSUMPTIONS.firstProbableChildAfterMarriageYears
      );
      if (child1Birth && compareIso(child1Birth, ctx.deathDate) > 0) {
        events.push({
          date: child1Birth,
          kind: "PROBABLE_CHILD_BIRTH",
          factorKey: PROBABLE_CHILD_1_KEY,
        });
        const exit1 = childSupportExitDate(child1Birth, "female", true);
        if (exit1 && compareIso(exit1, ctx.deathDate) > 0) {
          events.push({
            date: exclusiveExitBoundary(exit1, ctx.deceasedProbableLifeEndDate),
            kind: "PROBABLE_CHILD_EXIT",
            factorKey: PROBABLE_CHILD_1_KEY,
          });
        }

        const child2Birth = addYearsToIso(
          child1Birth,
          SUPPORT_PERIOD_ASSUMPTIONS.secondProbableChildAfterFirstYears
        );
        if (child2Birth && compareIso(child2Birth, ctx.deathDate) > 0) {
          events.push({
            date: child2Birth,
            kind: "PROBABLE_CHILD_BIRTH",
            factorKey: PROBABLE_CHILD_2_KEY,
          });
          const exit2 = childSupportExitDate(child2Birth, "male", true);
          if (exit2 && compareIso(exit2, ctx.deathDate) > 0) {
            events.push({
              date: exclusiveExitBoundary(exit2, ctx.deceasedProbableLifeEndDate),
              kind: "PROBABLE_CHILD_EXIT",
              factorKey: PROBABLE_CHILD_2_KEY,
            });
          }
        }
      }
    }
  }

  for (const child of ctx.realChildren) {
    if (!child.supportActiveAtDeath || !child.effectiveSupportEndDate) continue;
    const exit = child.effectiveSupportEndDate;
    if (compareIso(exit, ctx.deathDate) > 0) {
      events.push({
        date: exclusiveExitBoundary(exit, ctx.deceasedProbableLifeEndDate),
        kind: "CHILD_SUPPORT_END",
        factorKey: child.key,
      });
    }
  }

  if (ctx.realSpouse?.effectiveSupportEndDate) {
    const exit = ctx.realSpouse.effectiveSupportEndDate;
    if (compareIso(exit, ctx.deathDate) > 0) {
      events.push({
        date: exclusiveExitBoundary(exit, ctx.deceasedProbableLifeEndDate),
        kind: "SPOUSE_SUPPORT_END",
        factorKey: ctx.realSpouse.beneficiaryId,
      });
    }
  }

  if (ctx.realMother && compareIso(ctx.realMother.supportEndDate, ctx.deathDate) > 0) {
    events.push({
      date: exclusiveExitBoundary(
        ctx.realMother.supportEndDate,
        ctx.deceasedProbableLifeEndDate
      ),
      kind: "MOTHER_SUPPORT_END",
      factorKey: ctx.realMother.key,
    });
  }
  if (ctx.realFather && compareIso(ctx.realFather.supportEndDate, ctx.deathDate) > 0) {
    events.push({
      date: exclusiveExitBoundary(
        ctx.realFather.supportEndDate,
        ctx.deceasedProbableLifeEndDate
      ),
      kind: "FATHER_SUPPORT_END",
      factorKey: ctx.realFather.key,
    });
  }

  if (ctx.deceasedProbableLifeEndDate) {
    // Inclusive last calculation day = probableLifeEndDate; exit applies the next morning.
    events.push({
      date: addDaysIso(ctx.deceasedProbableLifeEndDate, 1),
      kind: "DECEASED_PROBABLE_LIFE_END",
    });
  }

  return mergeSameDateEvents(events);
}

function mergeSameDateEvents(events: TimelineEvent[]): TimelineEvent[] {
  const byDate = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  const dates = [...byDate.keys()].sort();
  const merged: TimelineEvent[] = [];
  for (const d of dates) {
    for (const e of byDate.get(d)!) {
      merged.push(e);
    }
  }
  return merged;
}

export function sortedBoundaries(ctx: ParsedSupportContext, events: TimelineEvent[]): string[] {
  const end = timelineEndDate(ctx);
  const set = new Set<string>();
  set.add(ctx.deathDate);

  const futureSplit = addDaysIso(ctx.calculationDate, 1);
  if (
    compareIso(ctx.calculationDate, ctx.deathDate) >= 0 &&
    compareIso(futureSplit, end) <= 0
  ) {
    set.add(futureSplit);
  }

  for (const e of events) {
    if (compareIso(e.date, ctx.deathDate) >= 0 && compareIso(e.date, end) <= 0) {
      set.add(e.date);
    }
  }

  const terminalBoundary = addDaysIso(end, 1);
  if (!set.has(terminalBoundary)) {
    set.add(terminalBoundary);
  }

  return [...set].sort();
}

export function resolvePeriodType(
  _segStart: string,
  segEnd: string,
  calculationDate: string
): "PAST" | "FUTURE" {
  if (compareIso(segEnd, calculationDate) <= 0) return "PAST";
  return "FUTURE";
}

export function isInactiveSegment(
  start: string,
  end: string,
  ctx: ParsedSupportContext,
  _events: TimelineEvent[]
): { inactive: boolean; label?: string } {
  if (ctx.isChildAtDeath && ctx.rearingEndAge != null) {
    const rearingEnd = addYearsToIso(ctx.deceasedBirthDate, ctx.rearingEndAge);
    if (rearingEnd && compareIso(start, ctx.deathDate) >= 0 && compareIso(end, rearingEnd) <= 0) {
      return { inactive: true, label: "Yetiştirme Dönemi" };
    }
  }

  if (ctx.militaryStartDate && ctx.militaryDurationMonths) {
    const milEnd = addDaysIso(ctx.militaryStartDate, ctx.militaryDurationMonths * 30);
    if (compareIso(end, ctx.militaryStartDate) >= 0 && compareIso(start, milEnd) <= 0) {
      return { inactive: true, label: "Askerlik Dönemi" };
    }
  }

  return { inactive: false };
}

interface ActiveState {
  deceased: boolean;
  spouse: Set<string>;
  children: Set<string>;
  mother: Set<string>;
  father: Set<string>;
  probableSpouse: boolean;
  probableChildren: Set<string>;
}

export function createInitialState(ctx: ParsedSupportContext): ActiveState {
  return {
    deceased: true,
    spouse: ctx.realSpouse ? new Set([ctx.realSpouse.beneficiaryId]) : new Set(),
    children: new Set(
      ctx.realChildren.filter((c) => c.supportActiveAtDeath).map((c) => c.key)
    ),
    mother: ctx.realMother ? new Set([ctx.realMother.key]) : new Set(),
    father: ctx.realFather ? new Set([ctx.realFather.key]) : new Set(),
    probableSpouse: false,
    probableChildren: new Set(),
  };
}

export function applyEvent(state: ActiveState, event: TimelineEvent): ActiveState {
  const next: ActiveState = {
    deceased: state.deceased,
    spouse: new Set(state.spouse),
    children: new Set(state.children),
    mother: new Set(state.mother),
    father: new Set(state.father),
    probableSpouse: state.probableSpouse,
    probableChildren: new Set(state.probableChildren),
  };

  switch (event.kind) {
    case "PROBABLE_MARRIAGE":
      next.probableSpouse = true;
      break;
    case "PROBABLE_CHILD_BIRTH":
      if (event.factorKey) next.probableChildren.add(event.factorKey);
      break;
    case "PROBABLE_CHILD_EXIT":
    case "CHILD_SUPPORT_END":
      if (event.factorKey) {
        next.children.delete(event.factorKey);
        next.probableChildren.delete(event.factorKey);
      }
      break;
    case "SPOUSE_SUPPORT_END":
      if (event.factorKey) next.spouse.delete(event.factorKey);
      break;
    case "MOTHER_SUPPORT_END":
      if (event.factorKey) next.mother.delete(event.factorKey);
      break;
    case "FATHER_SUPPORT_END":
      if (event.factorKey) next.father.delete(event.factorKey);
      break;
    case "DECEASED_PROBABLE_LIFE_END":
      next.deceased = false;
      break;
    default:
      break;
  }
  return next;
}

export function stateAtDate(
  ctx: ParsedSupportContext,
  events: TimelineEvent[],
  date: string
): ActiveState {
  let state = createInitialState(ctx);
  for (const e of events) {
    if (compareIso(e.date, date) <= 0) {
      state = applyEvent(state, e);
    }
  }
  return state;
}

export function stateToFactors(state: ActiveState, _ctx: ParsedSupportContext) {
  const { units } = SUPPORT_PERIOD_ASSUMPTIONS;
  const factors = [];
  if (state.deceased) {
    factors.push({
      key: DECEASED_KEY,
      kind: "DECEASED" as const,
      label: "MÜTEVEFFA",
      units: units.deceased,
    });
  }
  for (const id of state.spouse) {
    factors.push({
      key: id,
      kind: "REAL_SPOUSE" as const,
      label: "EŞ",
      units: units.spouse,
      beneficiaryId: id,
    });
  }
  if (state.probableSpouse) {
    factors.push({
      key: PROBABLE_SPOUSE_KEY,
      kind: "PROBABLE_SPOUSE" as const,
      label: "MUHTEMEL EŞ",
      units: units.spouse,
    });
  }
  for (const id of state.children) {
    factors.push({
      key: id,
      kind: "REAL_CHILD" as const,
      label: "ÇOCUK",
      units: units.child,
      beneficiaryId: id,
    });
  }
  for (const id of state.probableChildren) {
    factors.push({
      key: id,
      kind: "PROBABLE_CHILD" as const,
      label: id === PROBABLE_CHILD_1_KEY ? "FARAZİ ÇOCUK 1" : "FARAZİ ÇOCUK 2",
      units: units.child,
    });
  }
  for (const id of state.mother) {
    factors.push({
      key: id,
      kind: "REAL_MOTHER" as const,
      label: "ANNE",
      units: units.parent,
      beneficiaryId: id,
    });
  }
  for (const id of state.father) {
    factors.push({
      key: id,
      kind: "REAL_FATHER" as const,
      label: "BABA",
      units: units.parent,
      beneficiaryId: id,
    });
  }
  return factors;
}

export function computeParentTransfer(
  before: ActiveState,
  after: ActiveState,
  ctx: ParsedSupportContext
): { mother?: number; father?: number } {
  const transfer: { mother?: number; father?: number } = {};
  const { units } = SUPPORT_PERIOD_ASSUMPTIONS;

  for (const id of before.mother) {
    if (!after.mother.has(id) && after.father.size > 0 && ctx.realFather) {
      transfer.mother = (transfer.mother ?? 0) + units.parent;
    }
  }
  for (const id of before.father) {
    if (!after.father.has(id) && after.mother.size > 0 && ctx.realMother) {
      transfer.father = (transfer.father ?? 0) + units.parent;
    }
  }
  return transfer;
}
