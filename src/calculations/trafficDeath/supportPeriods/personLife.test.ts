import { describe, it, expect } from "vitest";
import { resolvePersonLifeExpectancy } from "../../shared/resolvePersonLifeExpectancy.js";
import { resolveTrafficDeathPersonLives } from "./resolvePersonLives.js";
import { parseSupportContext } from "./parseContext.js";
import { buildTimelineEvents } from "./timeline.js";
import { calculateTrafficDeathSupportPeriods } from "./calculateSupportPeriods.js";
import { childSupportExitDate } from "./childSupportDates.js";
import { CALCULATION_SCHEMA_VERSION } from "../../types.js";
import type { TrafficDeathDraft } from "../../types.js";

function baseDraft(over: Partial<TrafficDeathDraft> = {}): TrafficDeathDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_DEATH",
    common: { eventDate: "2024-04-15", calculationDate: "2030-01-01" },
    deceased: {
      birthDate: "1946-02-20",
      deathDate: "2024-04-15",
      gender: "male",
      fullName: "Müteveffa",
    },
    employmentStatus: "WORKING",
    deceasedFamilyInfo: {
      maritalStatus: "MARRIED",
      militaryStatus: "COMPLETED",
      militaryServiceStartDate: "1966-01-01",
      militaryServiceDurationMonths: 12,
      educationStatus: "graduate",
      hasChildren: true,
      childrenCount: 1,
      children: [],
    },
    accidentIncome: { incomeMode: "fixed", fixedAmount: 10000, averageSources: [] },
    nonWorkingSelectedIncome: null,
    incomePeriods: [],
    beneficiaries: [],
    supportRelations: [],
    liability: { injuredFaultRatio: 0, parties: [] },
    deathExpenses: { otherExpenses: [] },
    priorPayments: [],
    insurance: {},
    ...over,
  };
}

describe("TRAFFIC_DEATH person life expectancy", () => {
  it("A) anne ve baba farklı doğum tarihleri => farklı probableLifeEndDate", () => {
    const anchor = "2024-04-15";
    const mother = resolvePersonLifeExpectancy("1945-04-15", anchor, "female", {
      dateAddMode: "actuarial30",
    });
    const father = resolvePersonLifeExpectancy("1940-07-01", anchor, "male", {
      dateAddMode: "actuarial30",
    });
    expect(mother?.probableLifeEndDate).toBeTruthy();
    expect(father?.probableLifeEndDate).toBeTruthy();
    expect(mother!.probableLifeEndDate).not.toBe(father!.probableLifeEndDate);
  });

  it("B) olay tarihinde destek yaşını geçmiş gerçek kız çocuk aktif değil", () => {
    const d = baseDraft({
      beneficiaries: [
        {
          id: "daughter",
          fullName: "Kız",
          relation: "child",
          birthDate: "1975-05-20",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
      ],
    });
    const { profiles } = resolveTrafficDeathPersonLives(d, d.deceased.deathDate);
    const child = profiles.find((p) => p.personId === "daughter");
    expect(child?.supportActiveAtAnchor).toBe(false);
    expect(child?.effectiveSupportEndDate).toBeNull();

    const { context } = parseSupportContext(d);
    expect(context?.realChildren[0]?.supportActiveAtDeath).toBe(false);
    const first = calculateTrafficDeathSupportPeriods(d).periods.find((p) => p.supportActive);
    expect(first?.shares.daughter).toBeUndefined();
  });

  it("C) eş remarriageDate probableLifeEndDate'den erken => remarriageDate'de çıkar", () => {
    const d = baseDraft({
      beneficiaries: [
        {
          id: "sp",
          fullName: "Eş",
          relation: "spouse",
          birthDate: "1950-05-15",
          gender: "female",
          claimantStatus: "PLAINTIFF",
          remarried: true,
          remarriageDate: "2025-01-01",
        },
      ],
    });
    const { profiles } = resolveTrafficDeathPersonLives(d, d.deceased.deathDate);
    const spouse = profiles.find((p) => p.personId === "sp");
    expect(spouse?.effectiveSupportEndDate).toBe("2025-01-01");
  });

  it("D) eş yaşam sonu remarriageDate'den erken => deceased life end ile CAP edilir", () => {
    const d = baseDraft({
      beneficiaries: [
        {
          id: "sp",
          fullName: "Eş",
          relation: "spouse",
          birthDate: "1950-05-15",
          gender: "female",
          claimantStatus: "PLAINTIFF",
          remarried: true,
          remarriageDate: "2099-01-01",
        },
      ],
    });
    const { profiles } = resolveTrafficDeathPersonLives(d, d.deceased.deathDate);
    const spouse = profiles.find((p) => p.personId === "sp");
    const deceased = profiles.find((p) => p.role === "DECEASED");
    expect(spouse?.probableLifeEndDate).toBeTruthy();
    expect(deceased?.probableLifeEndDate).toBeTruthy();
    // Kendi ömür sonu korunur; effective müteveffa ömür sonu ile sınırlanır
    expect(spouse!.probableLifeEndDate! > deceased!.probableLifeEndDate!).toBe(true);
    expect(spouse?.effectiveSupportEndDate).toBe(deceased?.probableLifeEndDate);
    expect(spouse!.effectiveSupportEndDate! < "2099-01-01").toBe(true);
  });

  it("E) timeline üst sınırı müteveffa muhtemel ömür sonudur (hak sahibi uzatamaz)", () => {
    const d = baseDraft({
      common: { eventDate: "2024-04-15", calculationDate: "2099-01-01" },
    });
    const res = calculateTrafficDeathSupportPeriods(d);
    const deceasedEnd = res.personLives.find((p) => p.role === "DECEASED")?.probableLifeEndDate;
    expect(deceasedEnd).toBeTruthy();
    const timelineEnd = res.periods.at(-1)?.endDate;
    expect(timelineEnd).toBe(deceasedEnd);
    for (const p of res.periods) {
      expect(p.endDate <= deceasedEnd!).toBe(true);
    }
  });

  it("F) farazi çocuk 20 yaşında çıkar", () => {
    const birth = "2026-01-01";
    expect(childSupportExitDate(birth, "female", true)).toBe("2046-01-01");
  });

  it("G) gerçek erkek çocuk 18 yaşında çıkar", () => {
    const birth = "2010-06-01";
    expect(childSupportExitDate(birth, "male", false)).toBe("2028-06-01");
  });

  it("H) gerçek kız çocuk 22 yaşında çıkar", () => {
    const birth = "2010-06-01";
    expect(childSupportExitDate(birth, "female", false)).toBe("2032-06-01");
  });

  it("örnek senaryo: 1975 doğumlu kız çocuk paya dahil değil, anne/baba ayrı çıkış", () => {
    const d = baseDraft({
      beneficiaries: [
        {
          id: "sp",
          fullName: "Eş",
          relation: "spouse",
          birthDate: "1950-05-15",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "daughter",
          fullName: "Kız",
          relation: "child",
          birthDate: "1975-05-20",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "mo",
          fullName: "Anne",
          relation: "mother",
          birthDate: "1925-04-15",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "fa",
          fullName: "Baba",
          relation: "father",
          birthDate: "1922-07-01",
          gender: "male",
          claimantStatus: "PLAINTIFF",
        },
      ],
    });

    const { context } = parseSupportContext(d);
    expect(context?.realMother?.probableLifeEndDate).toBeTruthy();
    expect(context?.realFather?.probableLifeEndDate).toBeTruthy();

    const events = buildTimelineEvents(context!);
    const motherExit = events.find((e) => e.kind === "MOTHER_SUPPORT_END");
    const fatherExit = events.find((e) => e.kind === "FATHER_SUPPORT_END");
    expect(motherExit?.factorKey).toBe("mo");
    expect(fatherExit?.factorKey).toBe("fa");

    const res = calculateTrafficDeathSupportPeriods(d);
    const first = res.periods.find((p) => p.supportActive && p.startDate === "2024-04-15");
    expect(first?.shares.deceased?.display).toBe("2");
    expect(first?.shares.sp?.display).toBe("2");
    expect(first?.shares.mo?.display).toBe("1");
    expect(first?.shares.fa?.display).toBe("1");
    expect(first?.shares.daughter).toBeUndefined();
  });

  it("eksik doğum tarihi validation üretir", () => {
    const d = baseDraft({
      beneficiaries: [
        {
          id: "mo",
          fullName: "Anne",
          relation: "mother",
          birthDate: "",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
      ],
    });
    const { errors } = parseSupportContext(d);
    expect(errors.some((e) => e.includes("Anne") && e.includes("doğum"))).toBe(true);
  });

  it("kaza tarihindeki yaş yıl, ay ve gündür; destek tarihlerini değiştirmez", () => {
    const beneficiaries = [
      {
        id: "sp",
        fullName: "Ayşe",
        relation: "spouse" as const,
        birthDate: "1990-06-10",
        gender: "female" as const,
        claimantStatus: "PLAINTIFF" as const,
      },
      {
        id: "ch",
        fullName: "Ali",
        relation: "child" as const,
        birthDate: "2010-06-01",
        gender: "male" as const,
        claimantStatus: "PLAINTIFF" as const,
      },
      {
        id: "mo",
        fullName: "Fatma",
        relation: "mother" as const,
        birthDate: "1955-06-10",
        gender: "female" as const,
        claimantStatus: "PLAINTIFF" as const,
      },
      {
        id: "fa",
        fullName: "Mehmet",
        relation: "father" as const,
        birthDate: "1950-06-09",
        gender: "male" as const,
        claimantStatus: "PLAINTIFF" as const,
      },
    ];
    const at = (eventDate: string) =>
      resolveTrafficDeathPersonLives(
        baseDraft({
          common: { eventDate, calculationDate: "2030-01-01" },
          beneficiaries,
        }),
        "2024-04-15"
      ).profiles;

    const dayBefore = at("2024-06-09");
    const onBirthday = at("2024-06-10");
    const dayAfter = at("2024-06-11");
    const age = (rows: ReturnType<typeof at>, id: string) => rows.find((p) => p.personId === id)?.ageAtAccident;

    expect(age(dayBefore, "sp")).toEqual({ years: 33, months: 11, days: 30 });
    expect(age(onBirthday, "sp")).toEqual({ years: 34, months: 0, days: 0 });
    expect(age(dayAfter, "sp")).toEqual({ years: 34, months: 0, days: 1 });
    expect(age(dayBefore, "ch")).toEqual({ years: 14, months: 0, days: 8 });
    expect(age(dayBefore, "mo")).toEqual({ years: 68, months: 11, days: 30 });
    expect(age(onBirthday, "mo")).toEqual({ years: 69, months: 0, days: 0 });
    expect(age(dayBefore, "fa")).toEqual({ years: 74, months: 0, days: 0 });
    expect(age(onBirthday, "fa")).toEqual({ years: 74, months: 0, days: 1 });

    for (const id of ["sp", "ch", "mo", "fa"]) {
      const before = dayBefore.find((p) => p.personId === id);
      const sameDay = onBirthday.find((p) => p.personId === id);
      expect(sameDay?.probableLifeEndDate).toBe(before?.probableLifeEndDate);
      expect(sameDay?.supportEndDate).toBe(before?.supportEndDate);
      expect(sameDay?.effectiveSupportEndDate).toBe(before?.effectiveSupportEndDate);
    }
  });
});
