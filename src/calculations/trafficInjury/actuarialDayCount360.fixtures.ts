/** backend + frontend testlerinde paylaşılan 30/360 gün sayısı referansları */
export const ACTUARIAL_DAY_COUNT_FIXTURES = [
  { start: "2020-06-01", end: "2020-08-31", days: 90, label: "01.06–31.08.2020" },
  { start: "2022-01-01", end: "2022-06-30", days: 180, label: "01.01–30.06" },
  { start: "2022-07-01", end: "2022-12-31", days: 180, label: "01.07–31.12" },
  { start: "2022-07-15", end: "2022-12-31", days: 166, label: "15.07–31.12" },
  { start: "2022-01-01", end: "2022-12-31", days: 360, label: "tam yıl" },
  { start: "2020-01-01", end: "2022-12-31", days: 360, label: "360 cap" },
] as const;

export const CALENDAR_AGE_FIXTURES = [
  { birth: "1990-10-20", event: "2025-10-19", age: 34 },
  { birth: "1990-10-20", event: "2025-10-20", age: 35 },
] as const;
