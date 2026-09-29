/** Varsayımsal aile olayları — tek merkezden yönetilir */
export const SUPPORT_PERIOD_ASSUMPTIONS = {
  /** Askerlik sonrası evlilik öncesi bekleme (yıl) */
  postMilitaryWaitYears: 2,
  /** Muhtemel evlilikten 1. farazi çocuğa (yıl) */
  firstProbableChildAfterMarriageYears: 2,
  /** 1. farazi çocuktan 2. farazi çocuğa (yıl) */
  secondProbableChildAfterFirstYears: 2,
  /** Farazi çocuk destek çıkış yaşı */
  probableChildSupportExitAge: 20,
  /** Gerçek erkek çocuk destek çıkış yaşı */
  realMaleChildSupportExitAge: 18,
  /** Gerçek kız çocuk destek çıkış yaşı */
  realFemaleChildSupportExitAge: 22,
  /** Tek kalan ebeveyn destek oranı tavanı */
  singleParentMaxRate: 0.25,
  /** Pay birimleri */
  units: {
    deceased: 2,
    spouse: 2,
    child: 1,
    parent: 1,
  },
} as const;

export const PROBABLE_SPOUSE_KEY = "PROBABLE_SPOUSE";
export const PROBABLE_CHILD_1_KEY = "PROBABLE_CHILD_1";
export const PROBABLE_CHILD_2_KEY = "PROBABLE_CHILD_2";
export const DECEASED_KEY = "deceased";
