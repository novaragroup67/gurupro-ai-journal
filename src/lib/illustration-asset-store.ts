/**
 * ==============================================================================
 * GURUPRO AI: ILLUSTRATION ASSET & REVIEW CLIENT HOOK & STORE (VIS-1C / VIS-1D)
 * ==============================================================================
 *
 * Lightweight, zero-external-dependency reactive state hook for managing
 * pedagogical illustration assets, teacher reviews, section attachments,
 * and lifecycle states.
 */

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import type { IllustrationAsset, AssetLifecycleStatus } from "./ai/illustration-asset-contract";
import type {
  IllustrationReview,
  ReviewStatus,
  TeacherDecision,
  ReviewableIllustrationAsset,
} from "./ai/illustration-review-contract";
import {
  persistIllustrationAssetServerFn,
  attachIllustrationAssetServerFn,
  detachIllustrationAssetServerFn,
  transitionAssetLifecycleServerFn,
  listModuleIllustrationAssetsServerFn,
} from "./illustration-asset.functions";
import {
  getIllustrationReviewServerFn,
  saveIllustrationReviewServerFn,
  approveIllustrationForUseServerFn,
  rejectIllustrationServerFn,
  listReviewableIllustrationsServerFn,
} from "./illustration-review.functions";
import type {
  IllustrationQualityEvaluation,
  IllustrationEligibility,
} from "./ai/illustration-quality-contract";
import {
  evaluateIllustrationQualityServerFn,
  getIllustrationQualityEvaluationServerFn,
  checkIllustrationEligibilityServerFn,
} from "./illustration-quality.functions";

// In-memory module caches
const moduleAssetCache = new Map<string, IllustrationAsset[]>();
const moduleReviewableCache = new Map<string, ReviewableIllustrationAsset[]>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export interface UseIllustrationAssetStoreResult {
  // Asset State (VIS-1C)
  assets: IllustrationAsset[];
  activeAssetBySection: Record<string, IllustrationAsset>;
  loading: boolean;
  persisting: boolean;
  attaching: boolean;
  error: string | null;

  // Review State (VIS-1D)
  reviewItems: ReviewableIllustrationAsset[];
  reviewsByAssetId: Record<string, IllustrationReview>;
  selectedAssetId: string | null;
  selectedReviewable: ReviewableIllustrationAsset | null;
  savingReview: boolean;
  reviewError: string | null;

  // Asset Actions (VIS-1C)
  loadAssets: (moduleId: string) => Promise<void>;
  persistAsset: (generationId: string, targetSectionId?: string) => Promise<IllustrationAsset | null>;
  attachAsset: (assetId: string, moduleId: string, sectionId: string) => Promise<IllustrationAsset | null>;
  detachAsset: (assetId: string, moduleId: string) => Promise<boolean>;
  transitionLifecycle: (
    assetId: string,
    targetStatus: "staged" | "archived" | "soft_deleted",
    moduleId: string
  ) => Promise<boolean>;

  // Review Actions (VIS-1D)
  loadReviewableAssets: (moduleId: string, generationPlanId?: string) => Promise<void>;
  selectAssetForReview: (assetId: string) => void;
  saveReview: (
    assetId: string,
    reviewStatus: ReviewStatus,
    teacherDecision?: TeacherDecision | null,
    teacherNotes?: string | null,
    expectedUpdatedAt?: string
  ) => Promise<IllustrationReview | null>;
  approveForUse: (assetId: string, teacherNotes?: string | null) => Promise<IllustrationReview | null>;
  rejectAsset: (
    assetId: string,
    teacherNotes?: string | null,
    decision?: "regenerate" | "archive" | "keep_for_later"
  ) => Promise<IllustrationReview | null>;
  keepForLater: (assetId: string, teacherNotes?: string | null) => Promise<IllustrationReview | null>;

  // Quality Gate State (VIS-1E)
  evaluationsByAssetId: Record<string, IllustrationQualityEvaluation>;
  evaluatingAssetId: string | null;
  qualityError: string | null;

  // Quality Gate Actions (VIS-1E)
  evaluateQuality: (assetId: string, forceReevaluate?: boolean) => Promise<IllustrationQualityEvaluation | null>;
  loadQualityEvaluation: (assetId: string) => Promise<IllustrationQualityEvaluation | null>;
  checkEligibility: (assetId: string) => Promise<IllustrationEligibility | null>;
}

export function useIllustrationAssetStore(targetModuleId?: string): UseIllustrationAssetStoreResult {
  const [assets, setAssets] = useState<IllustrationAsset[]>(() =>
    targetModuleId ? moduleAssetCache.get(targetModuleId) || [] : []
  );
  const [reviewItems, setReviewItems] = useState<ReviewableIllustrationAsset[]>(() =>
    targetModuleId ? moduleReviewableCache.get(targetModuleId) || [] : []
  );
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [persisting, setPersisting] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [evaluationsByAssetId, setEvaluationsByAssetId] = useState<Record<string, IllustrationQualityEvaluation>>({});
  const [evaluatingAssetId, setEvaluatingAssetId] = useState<string | null>(null);
  const [qualityError, setQualityError] = useState<string | null>(null);

  // Sync cache changes
  useEffect(() => {
    const handler = () => {
      if (targetModuleId) {
        setAssets(moduleAssetCache.get(targetModuleId) || []);
        setReviewItems(moduleReviewableCache.get(targetModuleId) || []);
      }
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, [targetModuleId]);

  // Load basic assets
  const loadAssets = useCallback(async (moduleId: string) => {
    if (!moduleId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listModuleIllustrationAssetsServerFn({ data: { moduleId } });
      const fetched = res.assets || [];
      moduleAssetCache.set(moduleId, fetched);
      setAssets(fetched);
      notify();
    } catch (err: any) {
      setError(err.message || "Gagal memuat aset ilustrasi.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Load reviewable items with immutable outline & style snapshots
  const loadReviewableAssets = useCallback(async (moduleId: string, generationPlanId?: string) => {
    if (!moduleId) return;
    setLoading(true);
    setReviewError(null);
    try {
      const res = await listReviewableIllustrationsServerFn({ data: { moduleId, generationPlanId } });
      const fetched = res.items || [];
      moduleReviewableCache.set(moduleId, fetched);
      setReviewItems(fetched);
      if (fetched.length > 0 && !selectedAssetId) {
        setSelectedAssetId(fetched[0].asset.id);
      }
      notify();
    } catch (err: any) {
      setReviewError(err.message || "Gagal memuat daftar ulasan ilustrasi.");
    } finally {
      setLoading(false);
    }
  }, [selectedAssetId]);

  const selectAssetForReview = useCallback((assetId: string) => {
    setSelectedAssetId(assetId);
  }, []);

  const persistAsset = useCallback(
    async (generationId: string, targetSectionId?: string) => {
      setPersisting(true);
      setError(null);
      try {
        const res = await persistIllustrationAssetServerFn({
          data: { generationId, targetSectionId },
        });
        const asset = res.asset;
        toast.success("Aset ilustrasi permanen berhasil disimpan.");

        const current = moduleAssetCache.get(asset.moduleId) || [];
        const next = [asset, ...current.filter((a) => a.id !== asset.id)];
        moduleAssetCache.set(asset.moduleId, next);
        setAssets(next);
        notify();
        return asset;
      } catch (err: any) {
        const msg = err.message || "Gagal menyimpan aset ilustrasi.";
        setError(msg);
        toast.error(msg);
        return null;
      } finally {
        setPersisting(false);
      }
    },
    []
  );

  const attachAsset = useCallback(
    async (assetId: string, moduleId: string, sectionId: string) => {
      setAttaching(true);
      setError(null);
      try {
        const res = await attachIllustrationAssetServerFn({
          data: { assetId, moduleId, sectionId },
        });
        toast.success(
          res.sectionTitle
            ? `Ilustrasi berhasil ditautkan ke ${res.sectionTitle}.`
            : "Ilustrasi berhasil ditautkan ke bab modul ajar."
        );
        await loadAssets(moduleId);
        await loadReviewableAssets(moduleId);
        return res.asset;
      } catch (err: any) {
        const msg = err.message || "Gagal menautkan ilustrasi.";
        setError(msg);
        toast.error(msg);
        return null;
      } finally {
        setAttaching(false);
      }
    },
    [loadAssets, loadReviewableAssets]
  );

  const detachAsset = useCallback(
    async (assetId: string, moduleId: string) => {
      setAttaching(true);
      setError(null);
      try {
        await detachIllustrationAssetServerFn({ data: { assetId } });
        toast.success("Tautan ilustrasi berhasil dilepas dari modul.");
        await loadAssets(moduleId);
        await loadReviewableAssets(moduleId);
        return true;
      } catch (err: any) {
        const msg = err.message || "Gagal melepas tautan ilustrasi.";
        setError(msg);
        toast.error(msg);
        return false;
      } finally {
        setAttaching(false);
      }
    },
    [loadAssets, loadReviewableAssets]
  );

  const transitionLifecycle = useCallback(
    async (
      assetId: string,
      targetStatus: "staged" | "archived" | "soft_deleted",
      moduleId: string
    ) => {
      try {
        await transitionAssetLifecycleServerFn({ data: { assetId, targetStatus } });
        const label =
          targetStatus === "archived"
            ? "diarsipkan"
            : targetStatus === "soft_deleted"
            ? "dihapus"
            : "dipulihkan";
        toast.success(`Aset ilustrasi berhasil ${label}.`);
        await loadAssets(moduleId);
        await loadReviewableAssets(moduleId);
        return true;
      } catch (err: any) {
        toast.error(err.message || "Gagal memperbarui status aset.");
        return false;
      }
    },
    [loadAssets, loadReviewableAssets]
  );

  // Review Actions
  const saveReview = useCallback(
    async (
      assetId: string,
      reviewStatus: ReviewStatus,
      teacherDecision?: TeacherDecision | null,
      teacherNotes?: string | null,
      expectedUpdatedAt?: string
    ) => {
      setSavingReview(true);
      setReviewError(null);
      try {
        const res = await saveIllustrationReviewServerFn({
          data: {
            assetId,
            reviewStatus,
            teacherDecision,
            teacherNotes,
            expectedUpdatedAt,
          },
        });
        toast.success("Ulasan ilustrasi berhasil disimpan.");
        if (targetModuleId) {
          await loadReviewableAssets(targetModuleId);
        }
        return res.review;
      } catch (err: any) {
        const msg = err.message || "Gagal menyimpan ulasan ilustrasi.";
        setReviewError(msg);
        toast.error(msg);
        return null;
      } finally {
        setSavingReview(false);
      }
    },
    [targetModuleId, loadReviewableAssets]
  );

  const approveForUse = useCallback(
    async (assetId: string, teacherNotes?: string | null) => {
      setSavingReview(true);
      setReviewError(null);
      try {
        const res = await approveIllustrationForUseServerFn({
          data: { assetId, teacherNotes },
        });
        toast.success("Ilustrasi disetujui dan siap digunakan.");
        if (targetModuleId) {
          await loadReviewableAssets(targetModuleId);
        }
        return res.review;
      } catch (err: any) {
        const msg = err.message || "Gagal menyetujui ilustrasi.";
        setReviewError(msg);
        toast.error(msg);
        return null;
      } finally {
        setSavingReview(false);
      }
    },
    [targetModuleId, loadReviewableAssets]
  );

  const rejectAsset = useCallback(
    async (
      assetId: string,
      teacherNotes?: string | null,
      decision: "regenerate" | "archive" | "keep_for_later" = "regenerate"
    ) => {
      setSavingReview(true);
      setReviewError(null);
      try {
        const res = await rejectIllustrationServerFn({
          data: { assetId, teacherNotes, teacherDecision: decision },
        });
        toast.info("Ilustrasi ditolak dan tetap tersimpan dalam riwayat.");
        if (targetModuleId) {
          await loadReviewableAssets(targetModuleId);
        }
        return res.review;
      } catch (err: any) {
        const msg = err.message || "Gagal menolak ilustrasi.";
        setReviewError(msg);
        toast.error(msg);
        return null;
      } finally {
        setSavingReview(false);
      }
    },
    [targetModuleId, loadReviewableAssets]
  );

  const keepForLater = useCallback(
    async (assetId: string, teacherNotes?: string | null) => {
      return saveReview(assetId, "reviewed", "keep_for_later", teacherNotes);
    },
    [saveReview]
  );

  const loadQualityEvaluation = useCallback(async (assetId: string) => {
    try {
      const res = await (getIllustrationQualityEvaluationServerFn as any)({
        data: { assetId },
      });
      if (res && res.evaluation) {
        setEvaluationsByAssetId((prev) => ({ ...prev, [assetId]: res.evaluation }));
        return res.evaluation;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const evaluateQuality = useCallback(
    async (assetId: string, forceReevaluate?: boolean) => {
      setEvaluatingAssetId(assetId);
      setQualityError(null);
      try {
        const res = await (evaluateIllustrationQualityServerFn as any)({
          data: { assetId, forceReevaluate },
        });
        if (res && res.evaluation) {
          setEvaluationsByAssetId((prev) => ({ ...prev, [assetId]: res.evaluation }));
          if (res.evaluation.decision === "PASS") {
            toast.success("Kualitas ilustrasi lulus pemeriksaan AI (PASS)!");
          } else if (res.evaluation.decision === "NEEDS_REVISION") {
            toast.warning("Pemeriksaan mutu: Perlu revisi (NEEDS_REVISION). Cek temuan.");
          } else {
            toast.error(`Pemeriksaan mutu: ${res.evaluation.decision}. Cek temuan.`);
          }
          return res.evaluation;
        }
        return null;
      } catch (err: any) {
        const msg = err.message || "Gagal menjalankan evaluasi kualitas AI.";
        setQualityError(msg);
        toast.error(msg);
        return null;
      } finally {
        setEvaluatingAssetId(null);
      }
    },
    []
  );

  const checkEligibility = useCallback(async (assetId: string) => {
    try {
      const res = await (checkIllustrationEligibilityServerFn as any)({
        data: { assetId },
      });
      return res?.eligibility || null;
    } catch {
      return null;
    }
  }, []);

  // Derived states
  const activeAssetBySection: Record<string, IllustrationAsset> = {};
  for (const a of assets) {
    if (a.lifecycleStatus === "attached" && a.attachedSectionId) {
      activeAssetBySection[a.attachedSectionId] = a;
    }
  }

  const reviewsByAssetId: Record<string, IllustrationReview> = {};
  for (const item of reviewItems) {
    reviewsByAssetId[item.asset.id] = item.review;
  }

  const selectedReviewable =
    reviewItems.find((item) => item.asset.id === selectedAssetId) ||
    (reviewItems.length > 0 ? reviewItems[0] : null);

  return {
    assets,
    activeAssetBySection,
    loading,
    persisting,
    attaching,
    error,
    reviewItems,
    reviewsByAssetId,
    selectedAssetId,
    selectedReviewable,
    savingReview,
    reviewError,
    evaluationsByAssetId,
    evaluatingAssetId,
    qualityError,
    loadAssets,
    loadReviewableAssets,
    selectAssetForReview,
    persistAsset,
    attachAsset,
    detachAsset,
    transitionLifecycle,
    saveReview,
    approveForUse,
    rejectAsset,
    keepForLater,
    evaluateQuality,
    loadQualityEvaluation,
    checkEligibility,
  };
}
