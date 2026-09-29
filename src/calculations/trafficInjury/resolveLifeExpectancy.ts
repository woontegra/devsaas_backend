import type { TrafficInjuryDraft } from "../types.js";
import { addYearsToIso } from "./dateUtils.js";
import { resolvePersonLifeExpectancy } from "../shared/resolvePersonLifeExpectancy.js";
import type { LifeExpectancyInfo } from "./types.js";

const DEFAULT_PASSIVE_PHASE_AGE = 60;

function plaintiffGenderToTrh(gender: TrafficInjuryDraft["parties"]["plaintiff"]["gender"]): "male" | "female" {
  return gender === "FEMALE" ? "female" : "male";
}

export function resolveLifeExpectancy(draft: TrafficInjuryDraft): LifeExpectancyInfo {
  const birthDate = draft.parties.plaintiff.birthDate;
  const eventDate = draft.common.eventDate;
  const passiveAge = draft.passivePhaseAge ?? DEFAULT_PASSIVE_PHASE_AGE;
  const gender = plaintiffGenderToTrh(draft.parties.plaintiff.gender);

  const resolved = resolvePersonLifeExpectancy(birthDate, eventDate, gender);
  const ageYears = resolved?.completedAgeYears ?? null;
  const passivePhaseStartDate = addYearsToIso(birthDate, passiveAge);

  return {
    completedAgeYears: ageYears,
    ageAtAccident: resolved?.ageAtAnchor ?? null,
    decimalLifeExpectancy: resolved?.remainingLifetime.decimalYears ?? null,
    lifeExpectancyYmd: resolved?.lifeExpectancyYmd ?? { year: 0, month: 0, day: 0 },
    probableLifeEndDate: resolved?.probableLifeEndDate ?? null,
    passivePhaseStartDate,
  };
}
