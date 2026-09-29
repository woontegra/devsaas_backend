import type { DeceasedChildEducationLevel, TrafficDeathDraft } from "../../types.js";
import { isValidIsoDateOnly } from "../../validationHelpers.js";
import { resolveBeneficiaryClaimantStatus } from "../../beneficiaryClaimantStatus.js";
import { completedAgeYears } from "../../trafficInjury/dateUtils.js";
import {
  DECEASED_KEY,
  PROBABLE_CHILD_1_KEY,
  PROBABLE_CHILD_2_KEY,
  PROBABLE_SPOUSE_KEY,
} from "./config.js";
import type { ParsedSupportContext } from "./types.js";
import type { PersonLifeProfile } from "./personLifeTypes.js";
import { resolveTrafficDeathPersonLives } from "./resolvePersonLives.js";

export { childSupportExitDate } from "./childSupportDates.js";

export function resolveRearingEndAge(
  education: DeceasedChildEducationLevel | null | undefined
): number | null {
  if (!education) return null;
  if (education === "not_in_education" || education === "graduate") return 18;
  if (education === "other") return null;
  return 25;
}

function hasRealChildrenInDraft(draft: TrafficDeathDraft): boolean {
  const family = draft.deceasedFamilyInfo;
  if (family?.hasChildren === true) {
    if ((family.children?.length ?? 0) > 0) return true;
    if (draft.beneficiaries.some((b) => b.relation === "child")) return true;
  }
  return draft.beneficiaries.some((b) => b.relation === "child");
}

function hasRealSpouseInDraft(draft: TrafficDeathDraft): boolean {
  return draft.beneficiaries.some((b) => b.relation === "spouse");
}

function findProfile(profiles: PersonLifeProfile[], personId: string): PersonLifeProfile | undefined {
  return profiles.find((p) => p.personId === personId);
}

export function parseSupportContext(draft: TrafficDeathDraft): {
  context: ParsedSupportContext | null;
  personLives: PersonLifeProfile[];
  errors: string[];
} {
  const errors: string[] = [];
  const deathDate = draft.deceased.deathDate?.trim();
  const calculationDate = draft.common.calculationDate?.trim();
  const birthDate = draft.deceased.birthDate?.trim();

  if (!isValidIsoDateOnly(deathDate)) errors.push("Müteveffa ölüm tarihi geçersiz.");
  if (!isValidIsoDateOnly(calculationDate)) errors.push("Hesap tarihi geçersiz.");
  if (!isValidIsoDateOnly(birthDate)) errors.push("Müteveffa doğum tarihi geçersiz.");
  if (errors.length) return { context: null, personLives: [], errors };

  const family = draft.deceasedFamilyInfo;
  const education = family?.educationStatus ?? null;
  const rearingEndAge = resolveRearingEndAge(education);
  const ageAtDeath = completedAgeYears(birthDate!, deathDate!);
  const isChildAtDeath = ageAtDeath != null && rearingEndAge != null && ageAtDeath < rearingEndAge;

  if (isChildAtDeath && rearingEndAge == null) {
    errors.push("Yetiştirme dönemi için müteveffa öğrenim durumu belirlenemedi.");
  }

  const hasRealChildren = hasRealChildrenInDraft(draft);
  const hasRealSpouse = hasRealSpouseInDraft(draft);
  const generateProbableFamily = !hasRealChildren && !hasRealSpouse;

  let militaryStartDate: string | null = null;
  let militaryDurationMonths: 6 | 12 | null = null;
  if (draft.deceased.gender === "male") {
    militaryStartDate = family?.militaryServiceStartDate?.trim() || null;
    const dur = family?.militaryServiceDurationMonths;
    if (dur === 6 || dur === 12) militaryDurationMonths = dur;
    if (family?.militaryStatus && !militaryStartDate) {
      errors.push("Erkek müteveffa için askerlik başlangıç tarihi girilmelidir.");
    }
    if (militaryStartDate && !militaryDurationMonths) {
      errors.push("Askerlik süresi seçilmelidir (6 ay veya 1 yıl).");
    }
  }

  const spouse = draft.beneficiaries.find(
    (b) => b.relation === "spouse" && resolveBeneficiaryClaimantStatus(b) === "PLAINTIFF"
  );
  if (spouse?.remarried === true && !isValidIsoDateOnly(spouse.remarriageDate)) {
    errors.push("Eş için yeniden evlenme tarihi zorunludur.");
  }

  const { profiles: personLives, errors: lifeErrors } = resolveTrafficDeathPersonLives(
    draft,
    deathDate!
  );
  errors.push(...lifeErrors);

  const deceasedProfile = findProfile(personLives, "deceased");
  const deceasedProbableLifeEndDate = deceasedProfile?.probableLifeEndDate ?? null;

  let realSpouse: ParsedSupportContext["realSpouse"] = null;
  if (spouse) {
    const profile = findProfile(personLives, spouse.id);
    if (profile) {
      realSpouse = {
        beneficiaryId: spouse.id,
        remarried: spouse.remarried === true,
        remarriageDate: spouse.remarriageDate?.trim() || null,
        probableLifeEndDate: profile.probableLifeEndDate,
        effectiveSupportEndDate: profile.effectiveSupportEndDate ?? null,
      };
    }
  }

  const realChildren = draft.beneficiaries
    .filter((b) => b.relation === "child")
    .map((b) => {
      const profile = findProfile(personLives, b.id);
      return {
        key: b.id,
        beneficiaryId: b.id,
        birthDate: b.birthDate,
        gender: b.gender as "male" | "female",
        supportEndDate: profile?.supportEndDate ?? null,
        effectiveSupportEndDate: profile?.effectiveSupportEndDate ?? null,
        supportActiveAtDeath: profile?.supportActiveAtAnchor ?? false,
      };
    });

  const mother = draft.beneficiaries.find((b) => b.relation === "mother");
  const father = draft.beneficiaries.find((b) => b.relation === "father");

  let realMother: ParsedSupportContext["realMother"] = null;
  if (mother) {
    const profile = findProfile(personLives, mother.id);
    if (profile?.probableLifeEndDate) {
      realMother = {
        key: mother.id,
        beneficiaryId: mother.id,
        birthDate: mother.birthDate,
        probableLifeEndDate: profile.probableLifeEndDate,
        supportEndDate: profile.effectiveSupportEndDate ?? profile.probableLifeEndDate,
      };
    }
  }

  let realFather: ParsedSupportContext["realFather"] = null;
  if (father) {
    const profile = findProfile(personLives, father.id);
    if (profile?.probableLifeEndDate) {
      realFather = {
        key: father.id,
        beneficiaryId: father.id,
        birthDate: father.birthDate,
        probableLifeEndDate: profile.probableLifeEndDate,
        supportEndDate: profile.effectiveSupportEndDate ?? profile.probableLifeEndDate,
      };
    }
  }

  if (errors.length) return { context: null, personLives, errors };

  if (!deceasedProbableLifeEndDate) {
    errors.push("Müteveffa muhtemel yaşam sonu hesaplanamadı.");
    return { context: null, personLives, errors };
  }

  return {
    context: {
      deathDate: deathDate!,
      calculationDate: calculationDate!,
      deceasedBirthDate: birthDate!,
      deceasedGender: draft.deceased.gender,
      deceasedEducation: education,
      deceasedProbableLifeEndDate,
      hasRealChildren,
      hasRealSpouse,
      generateProbableFamily,
      militaryStartDate,
      militaryDurationMonths,
      rearingEndAge,
      isChildAtDeath,
      realSpouse,
      realChildren,
      realMother,
      realFather,
      personLives,
    },
    personLives,
    errors: [],
  };
}

export function buildFactorRegistry(ctx: ParsedSupportContext): Map<string, { kind: string; label: string }> {
  const map = new Map<string, { kind: string; label: string }>();
  map.set(DECEASED_KEY, { kind: "DECEASED", label: "MÜTEVEFFA" });
  if (ctx.realSpouse) {
    map.set(ctx.realSpouse.beneficiaryId, { kind: "REAL_SPOUSE", label: "EŞ" });
  }
  for (const c of ctx.realChildren) {
    map.set(c.key, { kind: "REAL_CHILD", label: "ÇOCUK" });
  }
  if (ctx.realMother) map.set(ctx.realMother.key, { kind: "REAL_MOTHER", label: "ANNE" });
  if (ctx.realFather) map.set(ctx.realFather.key, { kind: "REAL_FATHER", label: "BABA" });
  if (ctx.generateProbableFamily) {
    map.set(PROBABLE_SPOUSE_KEY, { kind: "PROBABLE_SPOUSE", label: "MUHTEMEL EŞ" });
    map.set(PROBABLE_CHILD_1_KEY, { kind: "PROBABLE_CHILD", label: "FARAZİ ÇOCUK 1" });
    map.set(PROBABLE_CHILD_2_KEY, { kind: "PROBABLE_CHILD", label: "FARAZİ ÇOCUK 2" });
  }
  return map;
}
