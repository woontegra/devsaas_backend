import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import { validateCalculationDraft } from "../calculations/validateDraft.js";
import { calculationAccessService } from "../services/calculationAccessService.js";

export const calculationsRouter = Router();

/**
 * POST /calculations/validate
 * Yalnızca veri doğrulama. Parasal sonuç, motor, TRH, rapor yok.
 * Subscription / kredi gerektirmez.
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
 * POST /calculations/run
 * Bu aşamada gerçek hesap motoruna bağlanmaz.
 * Erişim hakkı yoksa 402. Mock / örnek sonuç dönmez.
 */
calculationsRouter.post("/run", authMiddleware, async (req, res) => {
  const userId = (req as AuthRequest).user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  // Frontend paid bayrağına güvenilmez; yalnızca sunucu erişim servisi
  const access = await calculationAccessService.hasCalculationAccess(userId);
  if (!access.allowed) {
    res.status(402).json({
      code: access.code,
      message: access.message,
    });
    return;
  }

  // İleride gerçek motor burada bağlanacak. Şimdilik erişim açılmadığı için unreachable.
  res.status(501).json({
    code: "CALCULATION_ENGINE_NOT_BOUND",
    message: "Hesaplama motoru henüz bağlanmamıştır.",
  });
});
