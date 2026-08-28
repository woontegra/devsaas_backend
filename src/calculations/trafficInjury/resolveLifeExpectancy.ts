import { getTrh2010LifeExpectancy } from "../../data/trh2010.js";
import { getTrh2010DecimalLifeExpectancy } from "../../data/trh2010Decimal.js";
import type { Gender, TrafficInjuryDraft } from "../types.js";
import {
  addLifeExpectancyToDate,
  addYearsToIso,
  calendarAgeAtEvent,
  completedAgeYears,
} from "./dateUtils.js";
import type { LifeExpectancyInfo } from "./types.js";

const DEFAULT_PASSIVE_PHASE_AGE = 60;

function plaintiffGenderToTrh(gender: TrafficInjuryDraft["parties"]["plaintiff"]["gender"]): Gender {
  return gender === "FEMALE" ? "female" : "male";
}

export function resolveLifeExpectancy(draft: TrafficInjuryDraft): LifeExpectancyInfo {
  const birthDate = draft.parties.plaintiff.birthDate;
  const eventDate = draft.common.eventDate;
  const passiveAge = draft.passivePhaseAge ?? DEFAULT_PASSIVE_PHASE_AGE;
  const gender = plaintiffGenderToTrh(draft.parties.plaintiff.gender);

  const ageYears = completedAgeYears(birthDate, eventDate);
  const ageKey = ageYears ?? 0;
  const ageAtAccident = calendarAgeAtEvent(birthDate, eventDate);

  const decimalLifeExpectancy =
    ageYears != null ? getTrh2010DecimalLifeExpectancy(ageKey, gender) : null;

  const lifeExpectancyYmd = getTrh2010LifeExpectancy(ageKey, gender);
  const probableLifeEndDate = addLifeExpectancyToDate(eventDate, lifeExpectancyYmd);
  const passivePhaseStartDate = addYearsToIso(birthDate, passiveAge);

  return {
    completedAgeYears: ageYears,
    ageAtAccident,
    decimalLifeExpectancy,
    lifeExpectancyYmd,
    probableLifeEndDate,
    passivePhaseStartDate,
  };
}
