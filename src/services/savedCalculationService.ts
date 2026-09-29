import type { CalculationDraft, TrafficDeathDraft, TrafficInjuryDraft } from "../calculations/types.js";
import { validateCalculationDraft } from "../calculations/validateDraft.js";
import { hashCalculationInput, CALCULATION_HASH_VERSION } from "../calculations/hash/calculationInputHash.js";
import { calculateTrafficInjury } from "../calculations/trafficInjury/calculateTrafficInjury.js";
import { calculateTrafficDeath } from "../calculations/trafficDeath/calculateTrafficDeath.js";
import { calculateTrafficDeathSupportPeriods } from "../calculations/trafficDeath/supportPeriods/calculateSupportPeriods.js";
import { prisma } from "../prisma/index.js";
import { Prisma } from "@prisma/client";
import { calculationAccessService } from "./calculationAccessService.js";

export class SavedCalculationError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string
  ) {
    super(message);
    this.name = "SavedCalculationError";
  }
}

export interface SavedCalculationSummary {
  id: string;
  calculationType: string;
  title: string | null;
  displayName: string | null;
  /** Müteveffa veya davacı adı — listede gösterim için snapshot'tan türetilir */
  subjectName: string | null;
  eventDate: string | null;
  calculationDate: string | null;
  inputHash: string;
  calculationHashVersion: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
}

export interface SavedCalculationDetail extends SavedCalculationSummary {
  inputSnapshotJson: CalculationDraft;
  resultSnapshotJson: unknown | null;
}

export function extractPlaintiffDisplayName(draft: TrafficInjuryDraft): string {
  const p = draft.parties.plaintiff;
  return [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "—";
}

export function extractSavedMetadata(draft: TrafficInjuryDraft) {
  return {
    title: draft.common.internalFileName?.trim() || null,
    displayName: extractPlaintiffDisplayName(draft),
    eventDate: draft.common.eventDate || null,
    calculationDate: draft.common.calculationDate || null,
  };
}

export function extractTrafficDeathMetadata(draft: TrafficDeathDraft, displayName: string) {
  const trimmed = displayName.trim();
  return {
    title: trimmed,
    displayName: trimmed,
    eventDate: draft.deceased.deathDate || draft.common.eventDate || null,
    calculationDate: draft.common.calculationDate || null,
  };
}

/** Kullanıcı dosya adı ile kalıcı kayıt meta (DEATH / INJURY). */
export function extractNamedFileMetadata(draft: CalculationDraft, displayName: string) {
  const trimmed = displayName.trim();
  if (draft.calculationType === "TRAFFIC_DEATH") {
    return extractTrafficDeathMetadata(draft as TrafficDeathDraft, trimmed);
  }
  if (draft.calculationType === "TRAFFIC_INJURY") {
    const injury = draft as TrafficInjuryDraft;
    return {
      title: trimmed,
      displayName: trimmed,
      eventDate: injury.common.eventDate || null,
      calculationDate: injury.common.calculationDate || null,
    };
  }
  throw new SavedCalculationError(
    "Bu hesap türü için dosya kaydı desteklenmiyor.",
    400,
    "INVALID_CALCULATION_TYPE"
  );
}

export function assertClientInputHashMatches(
  clientInputHash: string,
  serverInputHash: string
): void {
  if (clientInputHash !== serverInputHash) {
    throw new SavedCalculationError(
      "Hesap girdisi değişmiş. Sonucu kaydetmeden önce hesaplamayı yeniden çalıştırın.",
      409,
      "INPUT_HASH_MISMATCH"
    );
  }
}

export function extractSubjectNameFromSnapshot(
  calculationType: string,
  snapshot: unknown
): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const data = snapshot as Record<string, unknown>;
  if (calculationType === "TRAFFIC_DEATH") {
    const deceased = data.deceased as { fullName?: string } | undefined;
    const name = deceased?.fullName?.trim();
    return name || null;
  }
  if (calculationType === "TRAFFIC_INJURY") {
    const parties = data.parties as
      | { plaintiff?: { firstName?: string; lastName?: string } }
      | undefined;
    const plaintiff = parties?.plaintiff;
    if (!plaintiff) return null;
    const name = [plaintiff.firstName, plaintiff.lastName].filter(Boolean).join(" ").trim();
    return name || null;
  }
  return null;
}

function toSummary(row: {
  id: string;
  calculationType: string;
  title: string | null;
  displayName: string | null;
  eventDate: string | null;
  calculationDate: string | null;
  inputHash: string;
  calculationHashVersion: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  lastOpenedAt: Date | null;
  inputSnapshotJson?: unknown;
}): SavedCalculationSummary {
  const subjectFromSnapshot =
    row.inputSnapshotJson != null
      ? extractSubjectNameFromSnapshot(row.calculationType, row.inputSnapshotJson)
      : null;
  return {
    id: row.id,
    calculationType: row.calculationType,
    title: row.title,
    displayName: row.displayName,
    subjectName:
      subjectFromSnapshot ??
      (row.calculationType === "TRAFFIC_INJURY" ? row.displayName : null),
    eventDate: row.eventDate,
    calculationDate: row.calculationDate,
    inputHash: row.inputHash,
    calculationHashVersion: row.calculationHashVersion,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lastOpenedAt: row.lastOpenedAt?.toISOString() ?? null,
  };
}

export function resolveTrafficDeathResultSnapshot(
  draft: TrafficDeathDraft,
  clientResult: unknown | null | undefined
): unknown | null {
  if (clientResult !== undefined && clientResult !== null) {
    return clientResult;
  }
  try {
    return calculateTrafficDeath(draft);
  } catch {
    const motor = calculateTrafficDeathSupportPeriods(draft);
    if (motor.errors.length > 0) return null;
    return {
      shareRatioPeriods: motor.shareRatioPeriods,
      personLives: motor.personLives,
      periods: motor.periods,
      columnKeys: motor.columnKeys,
    };
  }
}

export function resolveTrafficInjuryResultSnapshot(
  draft: TrafficInjuryDraft,
  clientResult: unknown | null | undefined
): unknown | null {
  if (clientResult !== undefined && clientResult !== null) {
    return clientResult;
  }
  const validation = validateCalculationDraft(draft);
  if (!validation.valid) return null;
  try {
    return calculateTrafficInjury(draft);
  } catch {
    return null;
  }
}

function resolveNamedResultSnapshot(
  draft: CalculationDraft,
  clientResult: unknown | null | undefined
): unknown | null {
  if (draft.calculationType === "TRAFFIC_DEATH") {
    return resolveTrafficDeathResultSnapshot(draft as TrafficDeathDraft, clientResult);
  }
  if (draft.calculationType === "TRAFFIC_INJURY") {
    return resolveTrafficInjuryResultSnapshot(draft as TrafficInjuryDraft, clientResult);
  }
  return null;
}

async function assertSaveAccess(params: {
  userId: string;
  email?: string | null;
  draft: CalculationDraft;
}): Promise<void> {
  const access = await calculationAccessService.assertCalculationAccess({
    userId: params.userId,
    email: params.email,
    draft: params.draft,
    action: "SAVE",
  });
  if (!access.allowed) {
    throw new SavedCalculationError(access.message, 403, access.code);
  }
}

export async function saveCompletedCalculation(params: {
  userId: string;
  email?: string | null;
  draft: CalculationDraft;
  clientInputHash: string;
}): Promise<SavedCalculationSummary> {
  await assertSaveAccess(params);

  const validation = validateCalculationDraft(params.draft);
  if (!validation.valid) {
    throw new SavedCalculationError(validation.message ?? "Doğrulama hatası.", 422, "VALIDATION_FAILED");
  }

  if (params.draft.calculationType !== "TRAFFIC_INJURY") {
    throw new SavedCalculationError(
      "Bu endpoint yalnızca TRAFFIC_INJURY tamamlanmış kayıtları içindir.",
      501,
      "SAVE_NOT_AVAILABLE"
    );
  }

  const serverInputHash = hashCalculationInput(params.draft);
  assertClientInputHashMatches(params.clientInputHash, serverInputHash);

  const injuryDraft = params.draft as TrafficInjuryDraft;
  const result = calculateTrafficInjury(injuryDraft);
  const meta = extractSavedMetadata(injuryDraft);

  const row = await prisma.savedCalculation.create({
    data: {
      userId: params.userId,
      calculationType: injuryDraft.calculationType,
      title: meta.title,
      displayName: meta.displayName,
      eventDate: meta.eventDate,
      calculationDate: meta.calculationDate,
      inputHash: serverInputHash,
      calculationHashVersion: CALCULATION_HASH_VERSION,
      inputSnapshotJson: injuryDraft as object,
      resultSnapshotJson: result as object,
      status: "COMPLETED",
    },
  });

  return toSummary(row);
}

/** Kalıcı dosya kaydı (POST) — TRAFFIC_DEATH / TRAFFIC_INJURY */
export async function saveNamedCalculation(params: {
  userId: string;
  email?: string | null;
  draft: CalculationDraft;
  displayName: string;
  resultSnapshot?: unknown | null;
}): Promise<SavedCalculationSummary> {
  await assertSaveAccess({ ...params, draft: params.draft });

  const trimmedName = params.displayName.trim();
  if (!trimmedName) {
    throw new SavedCalculationError("Dosya adı zorunludur.", 400, "DISPLAY_NAME_REQUIRED");
  }

  if (
    params.draft.calculationType !== "TRAFFIC_DEATH" &&
    params.draft.calculationType !== "TRAFFIC_INJURY"
  ) {
    throw new SavedCalculationError(
      "Bu hesap türü için dosya kaydı desteklenmiyor.",
      400,
      "INVALID_CALCULATION_TYPE"
    );
  }

  const serverInputHash = hashCalculationInput(params.draft);
  const meta = extractNamedFileMetadata(params.draft, trimmedName);
  const resultSnapshot = resolveNamedResultSnapshot(params.draft, params.resultSnapshot);

  const row = await prisma.savedCalculation.create({
    data: {
      userId: params.userId,
      calculationType: params.draft.calculationType,
      title: meta.title,
      displayName: meta.displayName,
      eventDate: meta.eventDate,
      calculationDate: meta.calculationDate,
      inputHash: serverInputHash,
      calculationHashVersion: CALCULATION_HASH_VERSION,
      inputSnapshotJson: params.draft as object,
      resultSnapshotJson:
        resultSnapshot != null ? (resultSnapshot as object) : Prisma.DbNull,
      status: resultSnapshot ? "COMPLETED" : "DRAFT",
    },
  });

  return toSummary(row);
}

/** Mevcut kalıcı dosyayı güncelle (PUT) — duplicate oluşturmaz */
export async function updateNamedCalculation(params: {
  userId: string;
  email?: string | null;
  id: string;
  draft: CalculationDraft;
  displayName: string;
  resultSnapshot?: unknown | null;
}): Promise<SavedCalculationSummary> {
  await assertSaveAccess({ ...params, draft: params.draft });

  const trimmedName = params.displayName.trim();
  if (!trimmedName) {
    throw new SavedCalculationError("Dosya adı zorunludur.", 400, "DISPLAY_NAME_REQUIRED");
  }

  if (
    params.draft.calculationType !== "TRAFFIC_DEATH" &&
    params.draft.calculationType !== "TRAFFIC_INJURY"
  ) {
    throw new SavedCalculationError(
      "Bu hesap türü için dosya kaydı desteklenmiyor.",
      400,
      "INVALID_CALCULATION_TYPE"
    );
  }

  const existing = await prisma.savedCalculation.findFirst({
    where: { id: params.id, userId: params.userId },
  });
  if (!existing) {
    throw new SavedCalculationError("Kayıtlı hesap bulunamadı.", 404, "NOT_FOUND");
  }
  if (existing.calculationType !== params.draft.calculationType) {
    throw new SavedCalculationError(
      "Kayıt türü ile girdi uyumsuz.",
      400,
      "INVALID_CALCULATION_TYPE"
    );
  }

  const serverInputHash = hashCalculationInput(params.draft);
  const meta = extractNamedFileMetadata(params.draft, trimmedName);
  const resultSnapshot = resolveNamedResultSnapshot(params.draft, params.resultSnapshot);

  const row = await prisma.savedCalculation.update({
    where: { id: existing.id },
    data: {
      title: meta.title,
      displayName: meta.displayName,
      eventDate: meta.eventDate,
      calculationDate: meta.calculationDate,
      inputHash: serverInputHash,
      calculationHashVersion: CALCULATION_HASH_VERSION,
      inputSnapshotJson: params.draft as object,
      resultSnapshotJson:
        resultSnapshot != null ? (resultSnapshot as object) : Prisma.DbNull,
      status: resultSnapshot ? "COMPLETED" : "DRAFT",
    },
  });

  return toSummary(row);
}

/** @deprecated use saveNamedCalculation — geriye uyumluluk */
export async function saveTrafficDeathCalculation(params: {
  userId: string;
  email?: string | null;
  draft: TrafficDeathDraft;
  displayName: string;
  resultSnapshot?: unknown | null;
}): Promise<SavedCalculationSummary> {
  return saveNamedCalculation(params);
}

/** @deprecated use updateNamedCalculation — geriye uyumluluk */
export async function updateTrafficDeathCalculation(params: {
  userId: string;
  email?: string | null;
  id: string;
  draft: TrafficDeathDraft;
  displayName: string;
  resultSnapshot?: unknown | null;
}): Promise<SavedCalculationSummary> {
  return updateNamedCalculation(params);
}

export async function listSavedCalculations(userId: string): Promise<SavedCalculationSummary[]> {
  const rows = await prisma.savedCalculation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toSummary);
}

export async function getSavedCalculation(
  userId: string,
  id: string
): Promise<SavedCalculationDetail> {
  const row = await prisma.savedCalculation.findFirst({
    where: { id, userId },
  });

  if (!row) {
    throw new SavedCalculationError("Kayıtlı hesap bulunamadı.", 404, "NOT_FOUND");
  }

  await prisma.savedCalculation.update({
    where: { id: row.id },
    data: { lastOpenedAt: new Date() },
  });

  return {
    ...toSummary(row),
    inputSnapshotJson: row.inputSnapshotJson as unknown as CalculationDraft,
    resultSnapshotJson: row.resultSnapshotJson ?? null,
  };
}

export async function deleteSavedCalculation(userId: string, id: string): Promise<void> {
  const row = await prisma.savedCalculation.findFirst({
    where: { id, userId },
    select: { id: true },
  });

  if (!row) {
    throw new SavedCalculationError("Kayıtlı hesap bulunamadı.", 404, "NOT_FOUND");
  }

  await prisma.savedCalculation.delete({ where: { id: row.id } });
}

export async function countSavedCalculations(userId: string): Promise<number> {
  return prisma.savedCalculation.count({ where: { userId, status: "COMPLETED" } });
}

/** Test / restore: TRAFFIC_DEATH snapshot'ını draft'a coerce eder */
export function coerceTrafficDeathSnapshot(snapshot: Partial<TrafficDeathDraft>): TrafficDeathDraft {
  return {
    ...snapshot,
    calculationType: "TRAFFIC_DEATH",
  } as TrafficDeathDraft;
}
