/**
 * CalculationAccessService — ödeme/erişim kararı (provider-independent).
 * Frontend paid/credit bayraklarına güvenilmez; karar yalnızca backend'de verilir.
 */

import type { CalculationDraft } from "../calculations/types.js";
import {
  hashCalculationInput,
  CALCULATION_HASH_VERSION,
} from "../calculations/hash/calculationInputHash.js";
import { UnsupportedHashCalculationTypeError } from "../calculations/hash/calculationInputNormalizer.js";
import { getUserAccessProfile } from "./subscriptionAccessService.js";

export type CalculationAccessAction = "RUN" | "REPORT" | "SAVE";

export type AccessCode =
  | "ACCESS_GRANTED_DEVELOPMENT"
  | "ACCESS_GRANTED_ADMIN"
  | "ACCESS_GRANTED_SUBSCRIPTION"
  | "ACCESS_GRANTED_PAID_INPUT"
  | "SAVE_NOT_PERMITTED"
  | "PAYMENT_REQUIRED_SINGLE"
  | "SUBSCRIPTION_EXPIRED"
  | "PAYMENT_PENDING"
  | "PAYMENT_FAILED";

export interface AccessDecision {
  allowed: boolean;
  code: AccessCode;
  message: string;
  inputHash: string | null;
  calculationHashVersion: number;
  action: CalculationAccessAction;
}

export interface AssertCalculationAccessParams {
  userId: string;
  email?: string | null;
  draft: CalculationDraft;
  action: CalculationAccessAction;
}

const PAYMENT_BLOCKED_CODES: AccessCode[] = [
  "PAYMENT_REQUIRED_SINGLE",
  "SUBSCRIPTION_EXPIRED",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
];

export function isPaymentBlockedAccess(code: AccessCode): boolean {
  return PAYMENT_BLOCKED_CODES.includes(code);
}

export class CalculationAccessService {
  async assertCalculationAccess(params: AssertCalculationAccessParams): Promise<AccessDecision> {
    let inputHash: string | null = null;
    try {
      inputHash = hashCalculationInput(params.draft);
    } catch (err) {
      if (!(err instanceof UnsupportedHashCalculationTypeError)) {
        throw err;
      }
    }

    const profile = await getUserAccessProfile(params.userId, params.email ?? null);

    if (params.action === "SAVE") {
      if (!profile.canSaveCalculation) {
        return {
          allowed: false,
          code: "SAVE_NOT_PERMITTED",
          message:
            "Kalıcı hesap kaydı yalnızca aylık veya yıllık abonelik kullanıcıları içindir. Taslak kaydetmeye devam edebilirsiniz.",
          inputHash,
          calculationHashVersion: CALCULATION_HASH_VERSION,
          action: params.action,
        };
      }

      const saveCode: AccessCode = profile.isAdmin
        ? "ACCESS_GRANTED_ADMIN"
        : profile.isDevelopmentAccess
          ? "ACCESS_GRANTED_DEVELOPMENT"
          : "ACCESS_GRANTED_SUBSCRIPTION";

      return {
        allowed: true,
        code: saveCode,
        message: "Kalıcı hesap kaydı izni verildi.",
        inputHash,
        calculationHashVersion: CALCULATION_HASH_VERSION,
        action: params.action,
      };
    }

    /* RUN / REPORT — geliştirme ortamında açık; ileride ödeme/abonelik buraya eklenir */
    const runCode: AccessCode = profile.isAdmin
      ? "ACCESS_GRANTED_ADMIN"
      : profile.isDevelopmentAccess
        ? "ACCESS_GRANTED_DEVELOPMENT"
        : profile.subscriptionActive
          ? "ACCESS_GRANTED_SUBSCRIPTION"
          : "ACCESS_GRANTED_DEVELOPMENT";

    return {
      allowed: true,
      code: runCode,
      message: "Hesaplama erişimi verildi.",
      inputHash,
      calculationHashVersion: CALCULATION_HASH_VERSION,
      action: params.action,
    };
  }

  /** @deprecated assertCalculationAccess kullanın */
  async hasCalculationAccess(userId: string): Promise<{
    allowed: boolean;
    code: "CALCULATION_ACCESS_REQUIRED" | "ACCESS_GRANTED" | AccessCode;
    message: string;
  }> {
    const decision = await this.assertCalculationAccess({
      userId,
      draft: {
        schemaVersion: 2,
        calculationType: "TRAFFIC_INJURY",
        common: { eventDate: "2000-01-01", calculationDate: "2000-01-01" },
        parties: {
          plaintiff: { firstName: "", lastName: "", birthDate: "2000-01-01", gender: "MALE" },
          defendants: [],
        },
        liability: { injuredFaultRatio: 0, parties: [] },
        disability: {},
        temporaryIncapacityPeriods: [],
        accidentIncome: { incomeMode: "fixed", fixedAmount: null, averageSources: [] },
        hospitalExpenses: [],
        travelExpenses: [],
        caregiverExpenses: [],
        capitalValueDocuments: [],
        zmtsPayments: [],
        cascoPayments: [],
      },
      action: "RUN",
    });
    return {
      allowed: decision.allowed,
      code: decision.code,
      message: decision.message,
    };
  }
}

export const calculationAccessService = new CalculationAccessService();
