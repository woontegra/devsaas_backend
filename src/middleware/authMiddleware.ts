import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface JwtPayload {
  userId: string;
  email: string;
}

export interface AuthRequest extends Request {
  user?: JwtPayload;
}

/**
 * JWT secret resolution.
 * Production: JWT_SECRET zorunlu; yoksa process başlamamalı (server.ts kontrol eder).
 * Development: yoksa uyarı + geçici secret.
 */
export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const nodeEnv = process.env.NODE_ENV ?? "development";

  if (secret && secret.trim().length > 0 && secret !== "change-me-in-production") {
    return secret;
  }

  if (nodeEnv === "production") {
    throw new Error("JWT_SECRET must be set to a strong value in production.");
  }

  console.warn(
    "[SECURITY] JWT_SECRET is missing or insecure. Set a strong JWT_SECRET. Using a development-only fallback."
  );
  return "dev-only-insecure-secret-do-not-use-in-production";
}

let cachedSecret: string | null = null;

function getSecret(): string {
  if (!cachedSecret) cachedSecret = resolveJwtSecret();
  return cachedSecret;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, getSecret()) as JwtPayload;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function createToken(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}
