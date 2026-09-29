/**
 * Abonelik / erişim profili — frontend plan kararı vermez; backend esas alınır.
 */

import { prisma } from "../prisma/index.js";

/** Kalıcı hesap kaydı yapabilen planlar (aylık/yıllık abonelik ve admin) */
export const SAVE_ENABLED_PLANS = new Set(["pro", "monthly", "yearly", "admin"]);

/** Tek hesap / taslak-only planlar */
export const SINGLE_ACCOUNT_PLANS = new Set(["starter", "single", "free"]);

export interface UserAccessProfile {
  userId: string;
  email: string | null;
  plan: string | null;
  subscriptionActive: boolean;
  subscriptionExpiresAt: string | null;
  canSaveCalculation: boolean;
  isDevelopmentAccess: boolean;
  isAdmin: boolean;
}

function parseAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_USER_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isDevelopmentSaveEnabled(): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.ENABLE_CALCULATION_SAVE === "true";
}

export function resolveCanSaveCalculation(params: {
  plan: string | null;
  subscriptionActive: boolean;
  isAdmin: boolean;
  isDevelopmentAccess: boolean;
}): boolean {
  if (params.isDevelopmentAccess || params.isAdmin) return true;
  if (!params.subscriptionActive || !params.plan) return false;
  if (SINGLE_ACCOUNT_PLANS.has(params.plan)) return false;
  return SAVE_ENABLED_PLANS.has(params.plan);
}

export async function getUserAccessProfile(
  userId: string,
  email?: string | null
): Promise<UserAccessProfile> {
  const user =
    email != null
      ? { email }
      : await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });

  const resolvedEmail = user?.email ?? null;
  const adminEmails = parseAdminEmails();
  const isAdmin = resolvedEmail != null && adminEmails.has(resolvedEmail.toLowerCase());
  const isDevelopmentAccess = isDevelopmentSaveEnabled();

  const sub = await prisma.subscription.findFirst({
    where: { userId },
    orderBy: { expiresAt: "desc" },
  });

  const subscriptionActive = sub != null && new Date(sub.expiresAt) >= new Date();
  const plan = sub?.plan ?? null;

  const canSaveCalculation = resolveCanSaveCalculation({
    plan: isAdmin ? "admin" : plan,
    subscriptionActive: isAdmin || subscriptionActive,
    isAdmin,
    isDevelopmentAccess,
  });

  return {
    userId,
    email: resolvedEmail,
    plan: isAdmin ? "admin" : plan,
    subscriptionActive: isAdmin || subscriptionActive,
    subscriptionExpiresAt: sub?.expiresAt.toISOString() ?? null,
    canSaveCalculation,
    isDevelopmentAccess,
    isAdmin,
  };
}
