import { Router } from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import type { AuthRequest } from "../middleware/authMiddleware.js";
import type { CalculationDraft } from "../calculations/types.js";
import {
  saveCompletedCalculation,
  saveNamedCalculation,
  updateNamedCalculation,
  listSavedCalculations,
  getSavedCalculation,
  deleteSavedCalculation,
  SavedCalculationError,
} from "../services/savedCalculationService.js";

export const savedCalculationsRouter = Router();

function handleSavedError(res: import("express").Response, err: unknown): void {
  if (err instanceof SavedCalculationError) {
    res.status(err.status).json({ code: err.code, message: err.message });
    return;
  }
  console.error("[calculations/saved]", err instanceof Error ? err.message : err);
  res.status(500).json({ code: "SAVE_FAILED", message: "Kayıt işlemi başarısız." });
}

/**
 * POST /calculations/saved
 * Named file (DEATH/INJURY): { draft, displayName, resultSnapshot? }
 * Completed INJURY (result phase): { draft, inputHash }
 */
savedCalculationsRouter.post("/", authMiddleware, async (req, res) => {
  const userId = (req as AuthRequest).user?.userId;
  const email = (req as AuthRequest).user?.email;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body as {
    draft?: CalculationDraft;
    inputHash?: string;
    displayName?: string;
    resultSnapshot?: unknown | null;
  };

  if (!body.draft?.calculationType) {
    res.status(400).json({ code: "INVALID_BODY", message: "draft zorunludur." });
    return;
  }

  try {
    const isNamedFileSave =
      body.draft.calculationType === "TRAFFIC_DEATH" ||
      (body.draft.calculationType === "TRAFFIC_INJURY" &&
        typeof body.displayName === "string");

    if (isNamedFileSave) {
      const saved = await saveNamedCalculation({
        userId,
        email,
        draft: body.draft,
        displayName: body.displayName ?? "",
        resultSnapshot: body.resultSnapshot,
      });
      res.status(201).json({ item: saved });
      return;
    }

    if (typeof body.inputHash !== "string" || !body.inputHash.trim()) {
      res.status(400).json({ code: "INVALID_BODY", message: "draft ve inputHash zorunludur." });
      return;
    }

    const saved = await saveCompletedCalculation({
      userId,
      email,
      draft: body.draft,
      clientInputHash: body.inputHash.trim(),
    });
    res.status(201).json({ item: saved });
  } catch (err) {
    handleSavedError(res, err);
  }
});

/**
 * PUT /calculations/saved/:id
 * TRAFFIC_DEATH / TRAFFIC_INJURY güncelleme (aynı kayıt)
 */
savedCalculationsRouter.put("/:id", authMiddleware, async (req, res) => {
  const userId = (req as AuthRequest).user?.userId;
  const email = (req as AuthRequest).user?.email;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const body = req.body as {
    draft?: CalculationDraft;
    displayName?: string;
    resultSnapshot?: unknown | null;
  };

  if (
    !body.draft ||
    (body.draft.calculationType !== "TRAFFIC_DEATH" &&
      body.draft.calculationType !== "TRAFFIC_INJURY")
  ) {
    res.status(400).json({
      code: "INVALID_BODY",
      message: "TRAFFIC_DEATH veya TRAFFIC_INJURY draft zorunludur.",
    });
    return;
  }

  try {
    const saved = await updateNamedCalculation({
      userId,
      email,
      id: req.params.id,
      draft: body.draft,
      displayName: body.displayName ?? "",
      resultSnapshot: body.resultSnapshot,
    });
    res.status(200).json({ item: saved });
  } catch (err) {
    handleSavedError(res, err);
  }
});

/**
 * GET /calculations/saved
 */
savedCalculationsRouter.get("/", authMiddleware, async (req, res) => {
  const userId = (req as AuthRequest).user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const items = await listSavedCalculations(userId);
    res.json({ items, total: items.length });
  } catch (err) {
    handleSavedError(res, err);
  }
});

/**
 * GET /calculations/saved/:id
 */
savedCalculationsRouter.get("/:id", authMiddleware, async (req, res) => {
  const userId = (req as AuthRequest).user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const item = await getSavedCalculation(userId, req.params.id);
    res.json({ item });
  } catch (err) {
    handleSavedError(res, err);
  }
});

/**
 * DELETE /calculations/saved/:id
 */
savedCalculationsRouter.delete("/:id", authMiddleware, async (req, res) => {
  const userId = (req as AuthRequest).user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    await deleteSavedCalculation(userId, req.params.id);
    res.status(204).send();
  } catch (err) {
    handleSavedError(res, err);
  }
});
