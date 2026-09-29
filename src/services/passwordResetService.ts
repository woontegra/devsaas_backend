import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { prisma } from "../prisma/index.js";

const TOKEN_TTL_MS = 60 * 60 * 1000;
const MIN_PASSWORD = 8;

export const FORGOT_PASSWORD_MESSAGE =
  "Eğer bu e-posta adresiyle kayıtlı bir hesap varsa, şifre sıfırlama bağlantısı gönderildi.";

export const RESET_LINK_INVALID_MESSAGE = "Bağlantı geçersiz veya süresi dolmuş.";

export const PASSWORD_TOO_SHORT_MESSAGE = "Şifre en az 8 karakter olmalı.";

export const EMAIL_INVALID_MESSAGE = "Geçerli bir e-posta adresi girin.";

type LinkDelivery = (email: string, link: string) => Promise<void>;

async function defaultDeliver(email: string, link: string): Promise<void> {
  if ((process.env.NODE_ENV ?? "development") !== "production") {
    console.info(`[auth] password reset link for ${email}: ${link}`);
  }
}

let deliverResetLink: LinkDelivery = defaultDeliver;

/** Test veya ileride SMTP adaptörü bağlamak için. */
export function setResetLinkDelivery(delivery: LinkDelivery): void {
  deliverResetLink = delivery;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

function appBaseUrl(): string {
  const raw = process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || "http://localhost:5173";
  return raw.replace(/\/$/, "");
}

export async function requestPasswordReset(emailInput: unknown): Promise<{ status: number; body: { message: string } }> {
  if (typeof emailInput !== "string" || !isValidEmail(emailInput.trim())) {
    return { status: 400, body: { message: EMAIL_INVALID_MESSAGE } };
  }
  const email = emailInput.trim();
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true },
  });
  if (user) {
    const raw = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hashToken(raw), expiresAt },
    });
    const link = `${appBaseUrl()}/sifre-sifirla?token=${encodeURIComponent(raw)}`;
    await deliverResetLink(user.email, link);
  }
  return { status: 200, body: { message: FORGOT_PASSWORD_MESSAGE } };
}

export async function confirmPasswordReset(
  tokenInput: unknown,
  passwordInput: unknown
): Promise<{ status: number; body: { message: string } }> {
  if (typeof passwordInput !== "string" || passwordInput.length < MIN_PASSWORD) {
    return { status: 400, body: { message: PASSWORD_TOO_SHORT_MESSAGE } };
  }
  if (typeof tokenInput !== "string" || tokenInput.trim().length < 20) {
    return { status: 400, body: { message: RESET_LINK_INVALID_MESSAGE } };
  }
  const tokenHash = hashToken(tokenInput.trim());
  const now = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const row = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
      if (!row || row.usedAt || row.expiresAt <= now) {
        throw new Error("invalid");
      }
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw new Error("invalid");
      const passwordHash = await bcrypt.hash(passwordInput, 10);
      await tx.user.update({ where: { id: row.userId }, data: { passwordHash } });
    });
  } catch {
    return { status: 400, body: { message: RESET_LINK_INVALID_MESSAGE } };
  }
  return { status: 200, body: { message: "Şifreniz güncellendi." } };
}
