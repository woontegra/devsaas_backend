import { describe, it, expect } from "vitest";
import { CALCULATION_SCHEMA_VERSION } from "../../types.js";
import type { TrafficDeathDraft } from "../../types.js";
import { calculateTrafficDeathSupportPeriods } from "./calculateSupportPeriods.js";
import { buildShareEntries } from "./shareCalculator.js";
import { buildTimelineEvents, timelineEndDate } from "./timeline.js";
import { parseSupportContext } from "./parseContext.js";
import type { SupportFactor } from "./types.js";

function draft(over: Partial<TrafficDeathDraft> & { beneficiaries?: TrafficDeathDraft["beneficiaries"] } = {}): TrafficDeathDraft {
  return {
    schemaVersion: CALCULATION_SCHEMA_VERSION,
    calculationType: "TRAFFIC_DEATH",
    common: { eventDate: "2020-06-01", calculationDate: "2024-01-15" },
    deceased: {
      birthDate: "1970-01-01",
      deathDate: "2020-06-01",
      gender: "male",
      fullName: "Ahmet",
    },
    employmentStatus: "WORKING",
    deceasedFamilyInfo: {
      maritalStatus: "MARRIED",
      militaryStatus: "COMPLETED",
      militaryServiceStartDate: "1990-01-01",
      militaryServiceDurationMonths: 12,
      educationStatus: "graduate",
      educationOtherDescription: "",
      hasChildren: false,
      childrenCount: 0,
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

function activeSupportPeriods(result: ReturnType<typeof calculateTrafficDeathSupportPeriods>) {
  return result.periods.filter((p) => p.supportActive);
}

function sharesOf(result: ReturnType<typeof calculateTrafficDeathSupportPeriods>) {
  const p = activeSupportPeriods(result)[0];
  return p?.shares ?? {};
}

describe("TRAFFIC_DEATH support periods motor", () => {
  it("A) müteveffa + eş + anne + baba => 2/6 paylar", () => {
    const d = draft({
      beneficiaries: [
        { id: "sp", fullName: "Ayşe", relation: "spouse", birthDate: "1975-01-01", gender: "female", claimantStatus: "PLAINTIFF" },
        { id: "mo", fullName: "Fatma", relation: "mother", birthDate: "1945-01-01", gender: "female", claimantStatus: "PLAINTIFF" },
        { id: "fa", fullName: "Mehmet", relation: "father", birthDate: "1940-01-01", gender: "male", claimantStatus: "PLAINTIFF" },
      ],
    });
    const res = calculateTrafficDeathSupportPeriods(d);
    expect(res.errors).toEqual([]);
    const s = sharesOf(res);
    expect(s.deceased?.display).toBe("2");
    expect(s.sp?.display).toBe("2");
    expect(s.mo?.display).toBe("1");
    expect(s.fa?.display).toBe("1");
  });

  it("B) müteveffa + eş + 2 çocuk + anne + baba => 8 pay", () => {
    const d = draft({
      deceasedFamilyInfo: {
        maritalStatus: "MARRIED",
        militaryStatus: "COMPLETED",
        militaryServiceStartDate: "1990-01-01",
        militaryServiceDurationMonths: 12,
        educationStatus: "graduate",
        hasChildren: true,
        childrenCount: 2,
        children: [],
      },
      beneficiaries: [
        { id: "sp", fullName: "Ayşe", relation: "spouse", birthDate: "1975-01-01", gender: "female", claimantStatus: "PLAINTIFF" },
        { id: "c1", fullName: "Ali", relation: "child", birthDate: "2010-01-01", gender: "male", claimantStatus: "PLAINTIFF" },
        { id: "c2", fullName: "Zeynep", relation: "child", birthDate: "2012-01-01", gender: "female", claimantStatus: "PLAINTIFF" },
        { id: "mo", fullName: "Fatma", relation: "mother", birthDate: "1945-01-01", gender: "female", claimantStatus: "PLAINTIFF" },
        { id: "fa", fullName: "Mehmet", relation: "father", birthDate: "1940-01-01", gender: "male", claimantStatus: "PLAINTIFF" },
      ],
    });
    const res = calculateTrafficDeathSupportPeriods(d);
    const s = sharesOf(res);
    expect(s.deceased?.display).toBe("2");
    expect(s.sp?.display).toBe("2");
    expect(s.c1?.display).toBe("1");
    expect(s.c2?.display).toBe("1");
    expect(s.mo?.display).toBe("1");
    expect(s.fa?.display).toBe("1");
  });

  it("C) çocuk çıkınca anne/baba pay almaz (yüzde artışı)", () => {
    const factorsBefore: SupportFactor[] = [
      { key: "deceased", kind: "DECEASED", label: "M", units: 2 },
      { key: "sp", kind: "REAL_SPOUSE", label: "E", units: 2 },
      { key: "c1", kind: "REAL_CHILD", label: "C1", units: 1 },
      { key: "c2", kind: "REAL_CHILD", label: "C2", units: 1 },
      { key: "mo", kind: "REAL_MOTHER", label: "AN", units: 1 },
    ];
    const factorsAfter: SupportFactor[] = [
      { key: "deceased", kind: "DECEASED", label: "M", units: 2 },
      { key: "sp", kind: "REAL_SPOUSE", label: "E", units: 2 },
      { key: "c2", kind: "REAL_CHILD", label: "C2", units: 1 },
      { key: "mo", kind: "REAL_MOTHER", label: "AN", units: 1 },
    ];
    const before = buildShareEntries(factorsBefore, { father: 1 });
    const after = buildShareEntries(factorsAfter, { father: 1 });
    expect(before.mo?.display).toBe("1+1");
    expect(after.mo?.display).toBe("1+1");
    expect(after.mo?.percentage).toBe(before.mo?.percentage);
    expect(after.c1).toBeUndefined();
  });

  it("D) tek kalan ebeveyn %25 tavanı", () => {
    const factors: SupportFactor[] = [
      { key: "deceased", kind: "DECEASED", label: "M", units: 2 },
      { key: "fa", kind: "REAL_FATHER", label: "B", units: 1 },
    ];
    const shares = buildShareEntries(factors);
    expect(shares.fa?.percentage).toBeLessThanOrEqual(25);
    expect(shares.fa?.display).toBe("1");
  });

  it("E) eş yeniden evlenince destekten çıkar", () => {
    const d = draft({
      beneficiaries: [
        {
          id: "sp",
          fullName: "Ayşe",
          relation: "spouse",
          birthDate: "1975-01-01",
          gender: "female",
          claimantStatus: "PLAINTIFF",
          remarried: true,
          remarriageDate: "2021-01-01",
        },
        { id: "mo", fullName: "Fatma", relation: "mother", birthDate: "1945-01-01", gender: "female", claimantStatus: "PLAINTIFF" },
      ],
    });
    const res = calculateTrafficDeathSupportPeriods(d);
    const afterRemarriage = activeSupportPeriods(res).find((p) => p.startDate >= "2021-01-01");
    expect(afterRemarriage?.shares.sp).toBeUndefined();
  });

  it("F) çocuk müteveffa => yetiştirme dönemi destek yok", () => {
    const d = draft({
      deceased: { birthDate: "2010-01-01", deathDate: "2020-06-01", gender: "male", fullName: "Can" },
      deceasedFamilyInfo: {
        maritalStatus: null,
        militaryStatus: null,
        educationStatus: "primary",
        hasChildren: false,
        childrenCount: 0,
        children: [],
      },
    });
    const res = calculateTrafficDeathSupportPeriods(d);
    const rearing = res.periods.find((p) => p.label === "Yetiştirme Dönemi");
    expect(rearing?.supportActive).toBe(false);
    expect(Object.keys(rearing?.shares ?? {}).length).toBe(0);
  });

  it("G) erkek müteveffa askerlik dönemi destek yok", () => {
    const d = draft({
      deceasedFamilyInfo: {
        maritalStatus: null,
        militaryStatus: "NOT_COMPLETED",
        militaryServiceStartDate: "2020-06-01",
        militaryServiceDurationMonths: 6,
        educationStatus: "graduate",
        hasChildren: false,
        childrenCount: 0,
        children: [],
      },
    });
    const res = calculateTrafficDeathSupportPeriods(d);
    const mil = res.periods.find((p) => p.label === "Askerlik Dönemi");
    expect(mil?.supportActive).toBe(false);
  });

  it("H) farazi 2 çocuk 20 yaşında çıkar", () => {
    const d = draft({
      deceased: { birthDate: "1990-01-01", deathDate: "2020-06-01", gender: "male", fullName: "Ahmet" },
      common: { eventDate: "2020-06-01", calculationDate: "2050-01-15" },
      deceasedFamilyInfo: {
        maritalStatus: "SINGLE",
        militaryStatus: "COMPLETED",
        militaryServiceStartDate: "2010-01-01",
        militaryServiceDurationMonths: 12,
        educationStatus: "graduate",
        hasChildren: false,
        childrenCount: 0,
        children: [],
      },
    });
    const res = calculateTrafficDeathSupportPeriods(d);
    expect(res.errors).toEqual([]);
    const last = activeSupportPeriods(res).at(-1);
    expect(last?.shares.PROBABLE_CHILD_1).toBeUndefined();
    expect(last?.shares.PROBABLE_CHILD_2).toBeUndefined();
  });

  it("I) gerçek çocuk varsa farazi aile üretilmez", () => {
    const d = draft({
      deceasedFamilyInfo: {
        maritalStatus: "MARRIED",
        militaryStatus: "COMPLETED",
        militaryServiceStartDate: "1990-01-01",
        militaryServiceDurationMonths: 12,
        educationStatus: "graduate",
        hasChildren: true,
        childrenCount: 1,
        children: [],
      },
      beneficiaries: [
        { id: "c1", fullName: "Ali", relation: "child", birthDate: "2000-01-01", gender: "male", claimantStatus: "PLAINTIFF" },
      ],
    });
    const res = calculateTrafficDeathSupportPeriods(d);
    expect(res.columnKeys.some((c) => c.key === "PROBABLE_SPOUSE")).toBe(false);
  });

  it("J) aynı gün olaylarında 0 günlük dönem oluşmaz", () => {
    const d = draft({
      beneficiaries: [
        { id: "sp", fullName: "Ayşe", relation: "spouse", birthDate: "1975-01-01", gender: "female", claimantStatus: "PLAINTIFF" },
      ],
    });
    const res = calculateTrafficDeathSupportPeriods(d);
    for (const p of res.periods) {
      expect(p.startDate <= p.endDate).toBe(true);
    }
  });

  it("K) timeline hesap tarihinde kesilmez; işleyecek dönem deceased life end'e kadar devam eder", () => {
    const d = draft({
      deceased: {
        birthDate: "1946-02-20",
        deathDate: "2024-04-15",
        gender: "male",
        fullName: "Ahmet",
      },
      common: { eventDate: "2024-04-15", calculationDate: "2026-09-02" },
      deceasedFamilyInfo: {
        maritalStatus: "MARRIED",
        militaryStatus: "COMPLETED",
        militaryServiceStartDate: "1966-01-01",
        militaryServiceDurationMonths: 12,
        educationStatus: "graduate",
        hasChildren: false,
        childrenCount: 0,
        children: [],
      },
      beneficiaries: [
        {
          id: "sp",
          fullName: "Ayşe",
          relation: "spouse",
          birthDate: "1950-05-15",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "mo",
          fullName: "Fatma",
          relation: "mother",
          birthDate: "1925-04-15",
          gender: "female",
          claimantStatus: "PLAINTIFF",
        },
        {
          id: "fa",
          fullName: "Mehmet",
          relation: "father",
          birthDate: "1922-07-01",
          gender: "male",
          claimantStatus: "PLAINTIFF",
        },
      ],
    });

    const res = calculateTrafficDeathSupportPeriods(d);
    expect(res.errors).toEqual([]);

    const deceasedEnd = res.personLives.find((p) => p.role === "DECEASED")?.probableLifeEndDate;
    expect(deceasedEnd).toBeTruthy();

    const lastPeriod = res.periods.at(-1);
    expect(lastPeriod?.endDate).toBe(deceasedEnd);
    expect(lastPeriod!.endDate > "2026-09-02").toBe(true);

    const futurePeriods = res.periods.filter((p) => p.periodType === "FUTURE");
    expect(futurePeriods[0]!.startDate).toBe("2026-09-03");

    const calcDayOnlyRow = res.periods.find(
      (p) => p.startDate === "2026-09-02" && p.endDate === "2026-09-02"
    );
    expect(calcDayOnlyRow).toBeUndefined();

    for (const p of res.periods) {
      expect(p.endDate <= deceasedEnd!).toBe(true);
    }

    const spouse = res.personLives.find((p) => p.personId === "sp");
    expect(spouse?.effectiveSupportEndDate).toBe(deceasedEnd);
  });

  it("L) kız çocuk kendi destek sonu müteveffa life end sonrasında olsa bile timeline deceased’de biter", () => {
    const d = draft({
      deceased: {
        birthDate: "1946-02-20",
        deathDate: "2024-04-15",
        gender: "male",
        fullName: "Müteveffa",
      },
      common: { eventDate: "2024-04-15", calculationDate: "2026-09-02" },
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
          id: "ebru",
          fullName: "Ebru Aydın",
          relation: "child",
          birthDate: "2011-05-20",
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

    const res = calculateTrafficDeathSupportPeriods(d);
    expect(res.errors).toEqual([]);

    const deceasedEnd = res.personLives.find((p) => p.role === "DECEASED")?.probableLifeEndDate;
    const ebruProfile = res.personLives.find((p) => p.personId === "ebru");
    const spouseProfile = res.personLives.find((p) => p.personId === "sp");
    expect(deceasedEnd).toBe("2031-02-07");
    expect(ebruProfile?.supportEndDate).toBe("2033-05-20");
    expect(ebruProfile?.effectiveSupportEndDate).toBe("2031-02-07");
    expect(spouseProfile?.effectiveSupportEndDate).toBe("2031-02-07");

    const lastPeriod = res.periods.at(-1);
    expect(lastPeriod?.endDate).toBe(deceasedEnd);

    for (const p of res.periods) {
      expect(p.endDate <= deceasedEnd!).toBe(true);
    }

    const afterDeceased = res.periods.find((p) => p.startDate > deceasedEnd!);
    expect(afterDeceased).toBeUndefined();

    const shareAfter = res.shareRatioPeriods.find((p) => p.startDate > deceasedEnd!);
    expect(shareAfter).toBeUndefined();

    const { context } = parseSupportContext(d);
    const events = buildTimelineEvents(context!);
    expect(
      events.some(
        (e) =>
          e.kind === "CHILD_SUPPORT_END" &&
          e.date === "2031-02-08" &&
          e.factorKey === "ebru"
      )
    ).toBe(true);
    expect(
      events.some(
        (e) => e.kind === "DECEASED_PROBABLE_LIFE_END" && e.date === "2031-02-08"
      )
    ).toBe(true);
    expect(
      events.some((e) => e.kind === "CHILD_SUPPORT_END" && e.date === "2033-05-20")
    ).toBe(false);

    // Inclusive life end: last pay period ends on 07.02.2031, no empty marker row that day
    expect(lastPeriod?.endDate).toBe("2031-02-07");
    expect(lastPeriod?.supportActive).toBe(true);
    expect(Object.keys(lastPeriod?.shares ?? {}).length).toBeGreaterThan(0);
    expect(
      res.shareRatioPeriods.some(
        (p) => p.startDate === "2031-02-07" && Object.keys(p.shares).length === 0
      )
    ).toBe(false);
    expect(res.periods.some((p) => p.startDate === "2031-02-07" && p.endDate === "2031-02-07")).toBe(
      false
    );
  });
});
