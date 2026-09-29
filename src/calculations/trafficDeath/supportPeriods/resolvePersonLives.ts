import type { Beneficiary, TrafficDeathDraft } from "../../types.js";
import { isValidIsoDateOnly } from "../../validationHelpers.js";
import { resolvePersonLifeExpectancy } from "../../shared/resolvePersonLifeExpectancy.js";
import { calendarSpanYmd, compareIso, minIso } from "../../trafficInjury/dateUtils.js";
import { childSupportExitDate } from "./childSupportDates.js";
import type { PersonLifeProfile, PersonLifeRole } from "./personLifeTypes.js";

function roleForBeneficiary(b: Beneficiary): PersonLifeRole {
  switch (b.relation) {
    case "spouse":
      return "SPOUSE";
    case "mother":
      return "MOTHER";
    case "father":
      return "FATHER";
    case "child":
      return "CHILD";
    default:
      return "OTHER_ADULT";
  }
}

function personLabel(b: Beneficiary | { fullName?: string; relation: string }): string {
  const name = "fullName" in b && b.fullName?.trim() ? b.fullName.trim() : b.relation;
  return name;
}

/** effectiveSupportEndDate = min(ownEnds..., deceasedProbableLifeEndDate) */
function capWithDeceasedLifeEnd(
  ownEffective: string | null | undefined,
  deceasedProbableLifeEndDate: string | null
): string | null {
  if (!ownEffective) return null;
  if (!deceasedProbableLifeEndDate) return ownEffective;
  return minIso(ownEffective, deceasedProbableLifeEndDate);
}

export function resolveTrafficDeathPersonLives(
  draft: TrafficDeathDraft,
  anchorDate: string
): { profiles: PersonLifeProfile[]; errors: string[] } {
  const errors: string[] = [];
  const profiles: PersonLifeProfile[] = [];

  const deceased = draft.deceased;
  const accidentDate = draft.common?.eventDate?.trim() ?? "";
  let deceasedProbableLifeEndDate: string | null = null;

  if (!isValidIsoDateOnly(deceased.birthDate)) {
    errors.push("Müteveffa doğum tarihi geçersiz veya eksik.");
  } else if (deceased.gender !== "male" && deceased.gender !== "female") {
    errors.push("Müteveffa cinsiyeti geçersiz veya eksik.");
  } else {
    const le = resolvePersonLifeExpectancy(deceased.birthDate, anchorDate, deceased.gender, {
      dateAddMode: "actuarial30",
    });
    if (!le) {
      errors.push("Müteveffa bakiye ömür hesaplanamadı.");
    } else {
      deceasedProbableLifeEndDate = le.probableLifeEndDate;
      profiles.push({
        personId: "deceased",
        role: "DECEASED",
        birthDate: deceased.birthDate,
        ageAtAccident: calendarSpanYmd(deceased.birthDate, accidentDate),
        gender: deceased.gender,
        remainingLifetime: le.remainingLifetime,
        probableLifeEndDate: le.probableLifeEndDate,
        effectiveSupportEndDate: le.probableLifeEndDate,
      });
    }
  }

  for (const b of draft.beneficiaries) {
    const label = personLabel(b);
    if (!isValidIsoDateOnly(b.birthDate)) {
      errors.push(`${label}: doğum tarihi geçersiz veya eksik.`);
      continue;
    }
    if (b.gender !== "male" && b.gender !== "female") {
      errors.push(`${label}: cinsiyet geçersiz veya eksik.`);
      continue;
    }

    const le = resolvePersonLifeExpectancy(b.birthDate, anchorDate, b.gender, {
      dateAddMode: "actuarial30",
    });
    if (!le) {
      errors.push(`${label}: bakiye ömür hesaplanamadı.`);
      continue;
    }

    const role = roleForBeneficiary(b);
    const profile: PersonLifeProfile = {
      personId: b.id,
      role,
      birthDate: b.birthDate,
      ageAtAccident: calendarSpanYmd(b.birthDate, accidentDate),
      gender: b.gender,
      remainingLifetime: le.remainingLifetime,
      probableLifeEndDate: le.probableLifeEndDate,
    };

    if (role === "CHILD") {
      const supportEnd = childSupportExitDate(b.birthDate, b.gender, false);
      profile.supportEndDate = supportEnd;
      const activeAtAnchor = supportEnd != null && compareIso(supportEnd, anchorDate) > 0;
      profile.supportActiveAtAnchor = activeAtAnchor;

      if (activeAtAnchor && supportEnd) {
        let effective = supportEnd;
        if (le.probableLifeEndDate && compareIso(le.probableLifeEndDate, supportEnd) < 0) {
          effective = le.probableLifeEndDate;
        }
        profile.effectiveSupportEndDate = capWithDeceasedLifeEnd(
          effective,
          deceasedProbableLifeEndDate
        );
      } else {
        profile.effectiveSupportEndDate = null;
      }
    } else if (role === "SPOUSE") {
      let effective = le.probableLifeEndDate;
      if (b.remarried === true && isValidIsoDateOnly(b.remarriageDate) && effective) {
        effective = minIso(effective, b.remarriageDate!.trim());
      } else if (b.remarried === true && isValidIsoDateOnly(b.remarriageDate)) {
        effective = b.remarriageDate!.trim();
      }
      profile.supportEndDate = le.probableLifeEndDate;
      profile.effectiveSupportEndDate = capWithDeceasedLifeEnd(
        effective,
        deceasedProbableLifeEndDate
      );
    } else {
      profile.supportEndDate = le.probableLifeEndDate;
      profile.effectiveSupportEndDate = capWithDeceasedLifeEnd(
        le.probableLifeEndDate,
        deceasedProbableLifeEndDate
      );
    }

    profiles.push(profile);
  }

  return { profiles, errors };
}
