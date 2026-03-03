import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { subscriptionMiddleware } from "../middleware/subscriptionMiddleware.js";
import { runCalculation } from "../services/actuarialService.js";
import { prisma } from "../prisma/index.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";

export const actuarialRouter = Router();

actuarialRouter.post(
  "/calculate",
  authMiddleware,
  subscriptionMiddleware,
  (req, res) => {
    const outcome = runCalculation(req.body);
    if (!outcome.success) {
      res.status(400).json({ errors: outcome.errors });
      return;
    }
    res.json({ result: outcome.result });
  }
);

actuarialRouter.post("/cases/save", authMiddleware, async (req, res) => {
  const userId = (req as AuthRequest).user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const { inputJson, resultJson } = req.body as { inputJson?: unknown; resultJson?: unknown };
  if (inputJson === undefined || resultJson === undefined) {
    res.status(400).json({ error: "inputJson and resultJson required" });
    return;
  }
  try {
    const caseRecord = await prisma.case.create({
      data: {
        userId,
        inputJson: inputJson as object,
        resultJson: resultJson as object,
      },
    });
    res.status(201).json({ id: caseRecord.id, createdAt: caseRecord.createdAt });
  } catch {
    res.status(500).json({ error: "Failed to save case" });
  }
});

actuarialRouter.get("/cases", authMiddleware, async (req, res) => {
  const userId = (req as AuthRequest).user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const cases = await prisma.case.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { id: true, inputJson: true, resultJson: true, createdAt: true },
    });
    res.json({ cases });
  } catch {
    res.status(500).json({ error: "Failed to list cases" });
  }
});
