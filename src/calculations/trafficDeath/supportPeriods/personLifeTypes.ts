export type PersonLifeRole =
  | "DECEASED"
  | "SPOUSE"
  | "MOTHER"
  | "FATHER"
  | "CHILD"
  | "OTHER_ADULT";

export interface PersonLifeProfile {
  personId: string;
  role: PersonLifeRole;
  birthDate: string;
  /** Olay (kaza) tarihindeki gerçek takvim yaşı. Destek süresini etkilemez. */
  ageAtAccident?: { years: number; months: number; days: number } | null;
  gender: "male" | "female";
  remainingLifetime: {
    years: number;
    months: number;
    days: number;
    decimalYears: number | null;
  };
  probableLifeEndDate: string | null;
  /** Çocuklarda destek yaşı sınırı (18/22/20) */
  supportEndDate?: string | null;
  /** Pay motorunda kullanılan çıkış tarihi */
  effectiveSupportEndDate?: string | null;
  /** Ölüm/olay tarihinde destek payına dahil mi (çocuklar için) */
  supportActiveAtAnchor?: boolean;
}
