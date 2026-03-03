import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { subscriptionMiddleware } from "../middleware/subscriptionMiddleware.js";
import { generateDocxReport } from "../services/reportService.js";
import type { ActuarialResult } from "../core/types.js";

function flattenResult(result: ActuarialResult): Record<string, string | number> {
  return {
    ageAtAccident: result.ageAtAccident,
    activePeriodYears: result.activePeriodYears,
    passivePeriodYears: result.passivePeriodYears,
    monthlyPension: result.monthlyPension,
    discountFactor: result.discountFactor,
    presentCapitalValue: result.presentCapitalValue,
    activePeriodPV: result.breakdown.activePeriodPV,
    passivePeriodPV: result.breakdown.passivePeriodPV,
    interestRate: result.metadata.interestRate,
    wageIncreaseRate: result.metadata.wageIncreaseRate,
    disabilityRate: result.metadata.disabilityRate,
    calculatedAt: result.metadata.calculatedAt,
  };
}

export const reportRouter = Router();

reportRouter.post(
  "/report",
  authMiddleware,
  subscriptionMiddleware,
  async (req, res) => {
    const resultJson = req.body?.resultJson as ActuarialResult | undefined;
    if (!resultJson || typeof resultJson !== "object") {
      res.status(400).json({ error: "resultJson required" });
      return;
    }
    try {
      const data = flattenResult(resultJson);
      const buffer = await generateDocxReport(data);
      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", 'attachment; filename="actuarial-report.docx"');
      res.send(buffer);
    } catch {
      res.status(500).json({ error: "Report generation failed" });
    }
  }
);
