import { addYearsToIso } from "../../trafficInjury/dateUtils.js";
import { SUPPORT_PERIOD_ASSUMPTIONS } from "./config.js";

export function childSupportExitDate(
  birthDate: string,
  gender: "male" | "female",
  probable: boolean
): string | null {
  const age = probable
    ? SUPPORT_PERIOD_ASSUMPTIONS.probableChildSupportExitAge
    : gender === "male"
      ? SUPPORT_PERIOD_ASSUMPTIONS.realMaleChildSupportExitAge
      : SUPPORT_PERIOD_ASSUMPTIONS.realFemaleChildSupportExitAge;
  return addYearsToIso(birthDate, age);
}

export function isChildSupportActiveAtAnchor(
  birthDate: string,
  gender: "male" | "female",
  anchorDate: string,
  probable: boolean
): boolean {
  const exit = childSupportExitDate(birthDate, gender, probable);
  return exit != null && exit > anchorDate;
}
