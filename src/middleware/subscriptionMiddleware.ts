import type { Response, NextFunction } from "express";
import { prisma } from "../prisma/index.js";
import type { AuthRequest } from "./authMiddleware.js";

export async function subscriptionMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const sub = await prisma.subscription.findFirst({
    where: { userId },
    orderBy: { expiresAt: "desc" },
  });
  if (!sub || new Date(sub.expiresAt) < new Date()) {
    res.status(403).json({ error: "Valid subscription required" });
    return;
  }
  (req as AuthRequest & { subscriptionPlan: string }).subscriptionPlan = sub.plan;
  next();
}
