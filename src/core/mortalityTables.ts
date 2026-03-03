/**
 * TRH2010-style mortality table (simplified).
 * Pure lookup: age -> annual mortality rate qx.
 * No mutation, no side effects.
 */
const TRH2010_MALE: readonly number[] = (() => {
  const table: number[] = [];
  for (let x = 0; x <= 120; x++) {
    if (x < 20) table.push(0.0002 + x * 0.00001);
    else if (x < 60) table.push(0.0004 + (x - 20) * 0.0001);
    else if (x < 80) table.push(0.004 + (x - 60) * 0.02);
    else table.push(0.44 + (x - 80) * 0.05);
    if (table[table.length - 1] > 1) table[table.length - 1] = 1;
  }
  return table;
})();

const TRH2010_FEMALE: readonly number[] = (() => {
  const table: number[] = [];
  for (let x = 0; x <= 120; x++) {
    const base = TRH2010_MALE[x] ?? 1;
    table.push(Math.max(0.0001, base * 0.85));
  }
  return table;
})();

function clampAge(age: number): number {
  if (age < 0) return 0;
  if (age > 120) return 120;
  return Math.floor(age);
}

export function getMortalityRate(age: number, gender: "male" | "female"): number {
  const a = clampAge(age);
  const table = gender === "male" ? TRH2010_MALE : TRH2010_FEMALE;
  return table[a] ?? 1;
}

export function getSurvivalProbability(age: number, gender: "male" | "female", years: number): number {
  let p = 1;
  for (let t = 0; t < years; t++) {
    const q = getMortalityRate(age + t, gender);
    p = p * (1 - q);
  }
  return p;
}
