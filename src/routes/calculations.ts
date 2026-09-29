import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { validateCalculationDraft } from "../calculations/validateDraft.js";
import { blocksTrafficDeathSupportPeriods } from "../calculations/validateTrafficDeath.js";
import {
  calculationAccessService,
  isPaymentBlockedAccess,
} from "../services/calculationAccessService.js";
import { calculateTrafficInjury } from "../calculations/trafficInjury/calculateTrafficInjury.js";
import { calculateTrafficDeath } from "../calculations/trafficDeath/calculateTrafficDeath.js";
import { calculateTrafficDeathSupportPeriods } from "../calculations/trafficDeath/supportPeriods/calculateSupportPeriods.js";
import type { CalculationDraft, TrafficDeathDraft, TrafficInjuryDraft } from "../calculations/types.js";
import { buildCalculationReviewSummaryForDraft } from "../calculations/buildReviewSummary.js";
import {
  generateTrafficInjuryWordReport,
  trafficInjuryReportFilename,
} from "../reports/trafficInjury/trafficInjuryWordReport.js";
import {
  buildTrafficDeathReportModel,
  trafficDeathReportFilename,
} from "../reports/trafficDeath/trafficDeathReportModel.js";
import { generateTrafficDeathWordReport } from "../reports/trafficDeath/trafficDeathWordReport.js";
import { generateTrafficDeathPdfReport } from "../reports/trafficDeath/trafficDeathPdfReport.js";

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
  if (draft.calculationType !== "TRAFFIC_INJURY" && draft.calculationType !== "TRAFFIC_DEATH") {
    res.status(501).json({
      code: "REVIEW_SUMMARY_NOT_AVAILABLE",
      message: "Giriş özeti bu hesap türü için henüz kullanılamıyor.",
    });
    return;
  }

  res.status(200).json(buildCalculationReviewSummaryForDraft(draft));
});

/**
 * POST /calculations/support-periods
 * TRAFFIC_DEATH pay / destek dönemleri — parasal sonuç yok.
 */
calculationsRouter.post("/support-periods", authMiddleware, (req, res) => {
  const validation = validateCalculationDraft(req.body);
  if (blocksTrafficDeathSupportPeriods(validation)) {
    res.status(422).json(validation);
    return;
  }

  const draft = req.body as CalculationDraft;
  if (draft.calculationType !== "TRAFFIC_DEATH") {
    res.status(501).json({
      code: "SUPPORT_PERIODS_NOT_AVAILABLE",
      message: "Pay dönemleri motoru yalnızca TRAFFIC_DEATH için kullanılabilir.",
    });
    return;
  }

  const result = calculateTrafficDeathSupportPeriods(draft as TrafficDeathDraft);
  if (result.errors.length > 0) {
    res.status(422).json({
      valid: false,
      errors: result.errors.map((message) => ({ field: "supportPeriods", message, code: "SUPPORT_PERIOD" })),
      warnings: validation.warnings,
      missingSections: validation.missingSections,
      completedSections: validation.completedSections,
    });
    return;
  }

  res.status(200).json({
    valid: true,
    periods: result.periods,
    shareRatioPeriods: result.shareRatioPeriods,
    columnKeys: result.columnKeys,
    personLives: result.personLives,
    warnings: [...validation.warnings, ...result.warnings.map((m) => ({ code: "SUPPORT_PERIOD", message: m }))],
    errors: result.errors,
  });
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

  if (draft.calculationType === "TRAFFIC_INJURY") {
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
    return;
  }

  if (draft.calculationType === "TRAFFIC_DEATH") {
    try {
      const deathDraft = draft as TrafficDeathDraft;
      const result = calculateTrafficDeath(deathDraft);
      res.status(200).json({
        valid: true,
        warnings: [
          ...validation.warnings,
          ...result.warnings.map((m) => ({ code: "ENGINE", message: m })),
        ],
        result,
        access: {
          code: access.code,
          inputHash: access.inputHash,
          calculationHashVersion: access.calculationHashVersion,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ölüm hesap motoru çalıştırılamadı.";
      res.status(422).json({
        valid: false,
        errors: [{ field: "calculation", message, code: "DEATH_ENGINE" }],
        warnings: validation.warnings,
        missingSections: validation.missingSections,
        completedSections: validation.completedSections,
        message,
      });
    }
    return;
  }

  res.status(501).json({
    code: "CALCULATION_ENGINE_NOT_BOUND",
    message: "Bu hesap türü için motor henüz bağlanmamıştır.",
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

  const format = req.query.format === "pdf" ? "pdf" : "docx";

  if (draft.calculationType === "TRAFFIC_DEATH") {
    try {
      const deathDraft = draft as TrafficDeathDraft;
      const result = calculateTrafficDeath(deathDraft);
      const model = buildTrafficDeathReportModel(deathDraft, result);
      const buffer =
        format === "pdf"
          ? await generateTrafficDeathPdfReport(model)
          : await generateTrafficDeathWordReport(model);
      const filename = trafficDeathReportFilename(deathDraft, format);
      res.setHeader(
        "Content-Type",
        format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      );
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader("X-Calculation-Access-Code", access.code);
      if (access.inputHash) {
        res.setHeader("X-Input-Hash", access.inputHash);
      }
      res.send(buffer);
    } catch (err) {
      console.error("[calculations/report]", err instanceof Error ? err.message : err);
      res.status(500).json({ error: "Rapor oluşturulamadı." });
    }
    return;
  }

  if (draft.calculationType !== "TRAFFIC_INJURY" || format === "pdf") {
    res.status(501).json({
      code: "REPORT_NOT_AVAILABLE",
      message: "Bu hesap türü için istenen rapor biçimi kullanılamaz.",
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
