import { Router } from "express";
import bcrypt from "bcrypt";
import { prisma } from "../prisma/index.js";
import { createToken, authMiddleware } from "../middleware/authMiddleware.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { getUserAccessProfile } from "../services/subscriptionAccessService.js";
import { confirmPasswordReset, requestPasswordReset } from "../services/passwordResetService.js";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "Email and password required" });
      return;
    }
    if (password.length < 8) {
      res.status(400).json({ error: "Password must be at least 8 characters" });
      return;
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, passwordHash },
      select: { id: true, email: true, createdAt: true },
    });
    const oneYear = new Date();
    oneYear.setFullYear(oneYear.getFullYear() + 1);
    await prisma.subscription.create({
      data: { userId: user.id, plan: "starter", expiresAt: oneYear },
    });
    const token = createToken({ userId: user.id, email: user.email });
    res.status(201).json({ user: { id: user.id, email: user.email }, token });
  } catch (e) {
    res.status(500).json({ error: "Registration failed" });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password || typeof email !== "string" || typeof password !== "string") {
      res.status(400).json({ error: "Email and password required" });
      return;
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }
    const token = createToken({ userId: user.id, email: user.email });
    res.json({ user: { id: user.id, email: user.email }, token });
  } catch {
    res.status(500).json({ error: "Login failed" });
  }
});

authRouter.get("/me", authMiddleware, async (req, res) => {
  const authReq = req as AuthRequest;
  const userId = authReq.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const profile = await getUserAccessProfile(userId, authReq.user?.email ?? null);
    res.json({
      user: { id: userId, email: profile.email },
      capabilities: {
        canSaveCalculation: profile.canSaveCalculation,
        plan: profile.plan,
        subscriptionActive: profile.subscriptionActive,
        subscriptionExpiresAt: profile.subscriptionExpiresAt,
      },
    });
  } catch {
    res.status(500).json({ error: "Failed to load profile" });
  }
});

authRouter.post("/forgot-password", async (req, res) => {
  try {
    const email = (req.body as { email?: unknown } | undefined)?.email;
    const result = await requestPasswordReset(email);
    res.status(result.status).json(result.body);
  } catch {
    res.status(500).json({ error: "Password reset request failed" });
  }
});

authRouter.post("/reset-password", async (req, res) => {
  try {
    const body = req.body as { token?: unknown; newPassword?: unknown } | undefined;
    const result = await confirmPasswordReset(body?.token, body?.newPassword);
    res.status(result.status).json(result.body);
  } catch {
    res.status(500).json({ error: "Password reset failed" });
  }
});
