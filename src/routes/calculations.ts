import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { validateCalculationDraft } from "../calculations/validateDraft.js";
import {
  calculationAccessService,
  isPaymentBlockedAccess,
} from "../services/calculationAccessService.js";
import { calculateTrafficInjury } from "../calculations/trafficInjury/calculateTrafficInjury.js";
import type { CalculationDraft, TrafficInjuryDraft } from "../calculations/types.js";
import { buildCalculationReviewSummaryForDraft } from "../calculations/buildReviewSummary.js";
import {
  generateTrafficInjuryWordReport,
  trafficInjuryReportFilename,
} from "../reports/trafficInjury/trafficInjuryWordReport.js";

export const calculationsRouter = Router();

function respondAccessDenied(
  res: import("express").Response,
  access: Awaited<ReturnType<typeof calculationAccessService.assertCalculationAccess>>
): void {
  res.status(402).json({
    code: access.code,
    message: access.message,
    inputHash: access.inputHash,
    calculationHashVersion: access.calculationHashVersion,
  });
}

/**
 * POST /calculations/validate
 * Yalnızca veri doğrulama. Parasal sonuç, motor, TRH, rapor yok.
 */
calculationsRouter.post("/validate", authMiddleware, (req, res) => {
  const outcome = validateCalculationDraft(req.body);
  if (!outcome.valid) {
    res.status(422).json(outcome);
    return;
  }
  res.status(200).json(outcome);
});

/**
 * POST /calculations/review-summary
 * Girdi özeti + inputHash — motor çalıştırmaz, parasal sonuç dönmez.
 */
calculationsRouter.post("/review-summary", authMiddleware, (req, res) => {
  const validation = validateCalculationDraft(req.body);
  if (!validation.valid) {
    res.status(422).json(validation);
    return;
  }

  const draft = req.body as CalculationDraft;
  if (draft.calculationType !== "TRAFFIC_INJURY") {
    res.status(501).json({
      code: "REVIEW_SUMMARY_NOT_AVAILABLE",
      message: "Giriş özeti yalnızca TRAFFIC_INJURY için kullanılabilir.",
    });
    return;
  }

  res.status(200).json(buildCalculationReviewSummaryForDraft(draft));
});

/**
 * POST /calculations/run
 */
calculationsRouter.post("/run", authMiddleware, async (req, res) => {
  const userId = (req as AuthRequest).user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const validation = validateCalculationDraft(req.body);
  if (!validation.valid) {
    res.status(422).json(validation);
    return;
  }

  const draft = req.body as CalculationDraft;
  const access = await calculationAccessService.assertCalculationAccess({
    userId,
    draft,
    action: "RUN",
  });
  if (!access.allowed || isPaymentBlockedAccess(access.code)) {
    respondAccessDenied(res, access);
    return;
  }

  if (draft.calculationType !== "TRAFFIC_INJURY") {
    res.status(501).json({
      code: "CALCULATION_ENGINE_NOT_BOUND",
      message: "Bu hesap türü için motor henüz bağlanmamıştır.",
    });
    return;
  }

  const injuryDraft = draft as TrafficInjuryDraft;
  const result = calculateTrafficInjury(injuryDraft);
  res.status(200).json({
    valid: true,
    warnings: [...validation.warnings, ...result.warnings.map((m) => ({ code: "ENGINE", message: m }))],
    result,
    access: {
      code: access.code,
      inputHash: access.inputHash,
      calculationHashVersion: access.calculationHashVersion,
    },
  });
});

/**
 * POST /calculations/report
 */
calculationsRouter.post("/report", authMiddleware, async (req, res) => {
  const userId = (req as AuthRequest).user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const validation = validateCalculationDraft(req.body);
  if (!validation.valid) {
    res.status(422).json(validation);
    return;
  }

  const draft = req.body as CalculationDraft;
  const access = await calculationAccessService.assertCalculationAccess({
    userId,
    draft,
    action: "REPORT",
  });
  if (!access.allowed || isPaymentBlockedAccess(access.code)) {
    respondAccessDenied(res, access);
    return;
  }

  if (draft.calculationType !== "TRAFFIC_INJURY") {
    res.status(501).json({
      code: "REPORT_NOT_AVAILABLE",
      message: "Word raporu yalnızca TRAFFIC_INJURY için kullanılabilir.",
    });
    return;
  }

  try {
    const injuryDraft = draft as TrafficInjuryDraft;
    const result = calculateTrafficInjury(injuryDraft);
    const buffer = await generateTrafficInjuryWordReport(injuryDraft, result);
    const filename = trafficInjuryReportFilename(injuryDraft);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.setHeader("X-Calculation-Access-Code", access.code);
    if (access.inputHash) {
      res.setHeader("X-Input-Hash", access.inputHash);
    }
    res.send(buffer);
  } catch (err) {
    console.error("[calculations/report]", err instanceof Error ? err.message : err);
    res.status(500).json({ error: "Word raporu oluşturulamadı." });
  }
});
