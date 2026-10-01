/**
 * ==============================================================================
 * GURUPRO AI: GENERATION PLANNING CLIENT STORE (GEN-0)
 * ==============================================================================
 *
 * Client-side reactive hook and state management for:
 * - Illustration Generation Planning
 * - Presentation (PPT) Generation Planning
 *
 * Interacts with TanStack Start Server Functions:
 * - createGenerationPlanServerFn
 * - getGenerationPlanServerFn
 * - updateGenerationPlanServerFn
 * - selectPlanStyleServerFn
 * - approveGenerationPlanServerFn
 * - revokeApprovalServerFn
 * - listAvailableStylesServerFn
 * - getGenerationSpecificationServerFn
 */

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import {
  GenerationPlan,
  GenerationPlanVersion,
  GenerationPlanTargetType,
  IllustrationOutline,
  PresentationOutline,
  PresentationSlide,
  GenerationStyle,
  ILLUSTRATION_STYLES_CATALOG,
  PRESENTATION_STYLES_CATALOG,
} from "./ai/generation-planning-contract";
import {
  addSlideToPresentationOutline,
  removeSlideFromPresentationOutline,
  reorderSlidesInPresentationOutline,
  updateSlideInPresentationOutline,
  duplicateSlideInPresentationOutline,
} from "./ai/generation-planning-service";
import {
  createGenerationPlanServerFn,
  getGenerationPlanServerFn,
  updateGenerationPlanServerFn,
  selectPlanStyleServerFn,
  approveGenerationPlanServerFn,
  revokeApprovalServerFn,
  getGenerationSpecificationServerFn,
} from "./generation-planning.functions";
import {
  prepareIllustrationGenerationRequestServerFn,
  generateIllustrationServerFn,
} from "./illustration-generation.functions";
import {
  preparePresentationGenerationRequestServerFn,
  getPresentationGenerationRequestServerFn,
  generatePresentationContentServerFn,
  getPresentationGenerationResultServerFn,
} from "./presentation-generation.functions";
import type {
  IllustrationGenerationRequest,
  IllustrationGenerationParameters,
  IllustrationGenerationResult,
} from "./ai/illustration-generation-contract";
import type {
  PresentationGenerationRequest,
  PresentationGenerationParameters,
  PresentationContentPackage,
} from "./ai/presentation-generation-contract";

export interface UseGenerationPlanOptions {
  moduleId: string;
  targetType: GenerationPlanTargetType;
  sectionId?: string;
  autoLoad?: boolean;
}

export function useGenerationPlan({
  moduleId,
  targetType,
  sectionId,
  autoLoad = true,
}: UseGenerationPlanOptions) {
  const [plan, setPlan] = useState<GenerationPlan | null>(null);
  const [versions, setVersions] = useState<GenerationPlanVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [preparedRequest, setPreparedRequest] = useState<IllustrationGenerationRequest | null>(null);
  const [preparingRequest, setPreparingRequest] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<IllustrationGenerationResult | null>(null);
  const [preparedPresentationRequest, setPreparedPresentationRequest] = useState<PresentationGenerationRequest | null>(null);
  const [preparingPresentationRequest, setPreparingPresentationRequest] = useState(false);
  const [generatedPresentationContent, setGeneratedPresentationContent] = useState<PresentationContentPackage | null>(null);
  const [generatingPresentationContent, setGeneratingPresentationContent] = useState(false);
  const [presentationGenerationError, setPresentationGenerationError] = useState<string | null>(null);
  const [availableStyles] = useState<GenerationStyle[]>(
    targetType === "illustration" ? ILLUSTRATION_STYLES_CATALOG : PRESENTATION_STYLES_CATALOG,
  );

  const loadPlan = useCallback(async () => {
    if (!moduleId) return;
    setLoading(true);
    try {
      const res = (await getGenerationPlanServerFn({
        data: { moduleId, targetType },
      })) as any;

      if (res.status === "success" && res.plan) {
        setPlan(res.plan);
        setVersions(res.versions || []);
      } else {
        setPlan(null);
        setVersions([]);
      }
    } catch (err: any) {
      console.warn("[useGenerationPlan] Error loading plan:", err);
    } finally {
      setLoading(false);
    }
  }, [moduleId, targetType]);

  useEffect(() => {
    if (autoLoad && moduleId) {
      void loadPlan();
    }
  }, [autoLoad, moduleId, loadPlan]);

  const initPlan = useCallback(
    async (initialStyleId?: string) => {
      if (!moduleId) return;
      setSaving(true);
      try {
        const defaultStyle = initialStyleId || (targetType === "illustration" ? "style_ill_flat_edu" : "style_ppt_edu_classroom");
        const res = (await createGenerationPlanServerFn({
          data: {
            moduleId,
            targetType,
            sectionId,
            initialStyleId: defaultStyle,
          },
        })) as any;

        if (res.status === "success" && res.plan) {
          setPlan(res.plan);
          setVersions(res.initialVersion ? [res.initialVersion] : []);
          toast.success(
            targetType === "illustration"
              ? "Draf outline rencana ilustrasi berhasil dibuat."
              : "Draf outline rencana presentasi berhasil dibuat.",
          );
        }
      } catch (err: any) {
        console.error("[initPlan] Error:", err);
        toast.error(err.message || "Gagal membuat draf rencana generasi.");
      } finally {
        setSaving(false);
      }
    },
    [moduleId, targetType, sectionId],
  );

  const saveOutlineEdits = useCallback(
    async (newOutline: IllustrationOutline | PresentationOutline, summary?: string) => {
      if (!plan) return;
      setSaving(true);
      try {
        const res = (await updateGenerationPlanServerFn({
          data: {
            planId: plan.id,
            outline: newOutline as any,
            summary,
          },
        })) as any;

        if (res.status === "success" && res.plan) {
          setPlan(res.plan);
          setVersions((prev) => [...prev, res.newVersion]);
          if (plan.status === "approved") {
            toast.info("Perubahan disimpan. Persetujuan sebelumnya dicabut karena ada pembaruan outline.");
          } else {
            toast.success("Perubahan outline berhasil disimpan.");
          }
        }
      } catch (err: any) {
        console.error("[saveOutlineEdits] Error:", err);
        toast.error(err.message || "Gagal menyimpan perubahan outline.");
      } finally {
        setSaving(false);
      }
    },
    [plan],
  );

  const selectStyle = useCallback(
    async (styleId: string) => {
      if (!plan) return;
      setSaving(true);
      try {
        const res = (await selectPlanStyleServerFn({
          data: {
            planId: plan.id,
            styleId,
          },
        })) as any;

        if (res.status === "success" && res.plan) {
          const wasApproved = plan.status === "approved";
          setPlan(res.plan);
          if (wasApproved && res.plan.status !== "approved") {
            toast.info("Gaya diubah. Persetujuan sebelumnya dicabut agar sesuai dengan gaya baru.");
          } else {
            toast.success("Gaya visual berhasil dipilih.");
          }
        }
      } catch (err: any) {
        console.error("[selectStyle] Error:", err);
        toast.error(err.message || "Gagal memilih gaya visual.");
      } finally {
        setSaving(false);
      }
    },
    [plan],
  );

  const approvePlan = useCallback(async () => {
    if (!plan) return;
    setApproving(true);
    try {
      const res = (await approveGenerationPlanServerFn({
        data: {
          planId: plan.id,
        },
      })) as any;

      if (res.status === "success" && res.plan) {
        setPlan(res.plan);
        setVersions((prev) =>
          prev.map((v) =>
            v.versionNumber === res.plan.currentVersion ? { ...v, isApproved: true } : v,
          ),
        );
        toast.success("Rencana generasi berhasil disetujui! Otorisasi generasi kini aktif.");
      }
    } catch (err: any) {
      console.error("[approvePlan] Error:", err);
      toast.error(err.message || "Gagal menyetujui rencana generasi.");
    } finally {
      setApproving(false);
    }
  }, [plan]);

  const revokeApproval = useCallback(async () => {
    if (!plan) return;
    setApproving(true);
    try {
      const res = (await revokeApprovalServerFn({
        data: {
          planId: plan.id,
        },
      })) as any;

      if (res.status === "success" && res.plan) {
        setPlan(res.plan);
        toast.info("Persetujuan rencana generasi berhasil dicabut.");
      }
    } catch (err: any) {
      console.error("[revokeApproval] Error:", err);
      toast.error(err.message || "Gagal mencabut persetujuan rencana.");
    } finally {
      setApproving(false);
    }
  }, [plan]);

  // Slide Manipulation helpers for Presentation
  const addSlide = useCallback(
    async (slideData: Partial<PresentationSlide>) => {
      if (!plan || plan.targetType !== "presentation") return;
      const currentOutline = plan.outline as PresentationOutline;
      const nextOutline = addSlideToPresentationOutline(currentOutline, slideData);
      await saveOutlineEdits(nextOutline, `Menambahkan slide: ${slideData.slideTitle || "Slide Baru"}`);
    },
    [plan, saveOutlineEdits],
  );

  const removeSlide = useCallback(
    async (slideId: string) => {
      if (!plan || plan.targetType !== "presentation") return;
      const currentOutline = plan.outline as PresentationOutline;
      const nextOutline = removeSlideFromPresentationOutline(currentOutline, slideId);
      await saveOutlineEdits(nextOutline, `Menghapus slide ID: ${slideId}`);
    },
    [plan, saveOutlineEdits],
  );

  const reorderSlides = useCallback(
    async (slideIdsInOrder: string[]) => {
      if (!plan || plan.targetType !== "presentation") return;
      const currentOutline = plan.outline as PresentationOutline;
      const nextOutline = reorderSlidesInPresentationOutline(currentOutline, slideIdsInOrder);
      await saveOutlineEdits(nextOutline, "Mengubah urutan slide presentasi");
    },
    [plan, saveOutlineEdits],
  );

  const updateSlide = useCallback(
    async (slideId: string, patch: Partial<PresentationSlide>) => {
      if (!plan || plan.targetType !== "presentation") return;
      const currentOutline = plan.outline as PresentationOutline;
      const nextOutline = updateSlideInPresentationOutline(currentOutline, slideId, patch);
      await saveOutlineEdits(nextOutline, `Memperbarui slide: ${patch.slideTitle || slideId}`);
    },
    [plan, saveOutlineEdits],
  );

  const duplicateSlide = useCallback(
    async (slideId: string) => {
      if (!plan || plan.targetType !== "presentation") return;
      const currentOutline = plan.outline as PresentationOutline;
      const nextOutline = duplicateSlideInPresentationOutline(currentOutline, slideId);
      await saveOutlineEdits(nextOutline, `Menduplikasi slide ID: ${slideId}`);
    },
    [plan, saveOutlineEdits],
  );

  const fetchSpecification = useCallback(async () => {
    if (!plan) return null;
    try {
      const res = (await getGenerationSpecificationServerFn({
        data: { planId: plan.id },
      })) as any;
      if (res.status === "success") {
        return res.specification;
      }
    } catch (err: any) {
      toast.error(err.message || "Gagal memuat spesifikasi generasi.");
    }
    return null;
  }, [plan]);

  const prepareIllustrationRequest = useCallback(
    async (overrideParams?: Partial<IllustrationGenerationParameters>) => {
      if (!plan || plan.targetType !== "illustration") return null;
      setPreparingRequest(true);
      try {
        const res = (await prepareIllustrationGenerationRequestServerFn({
          data: {
            planId: plan.id,
            parameters: overrideParams,
          },
        })) as any;
        if (res.status === "success" && res.request) {
          setPreparedRequest(res.request);
          toast.success("Permintaan generasi ilustrasi (VIS-1A) berhasil divalidasi dan disiapkan!");
          return res.request;
        }
      } catch (err: any) {
        console.error("[prepareIllustrationRequest] Error:", err);
        toast.error(err.message || "Gagal menyiapkan permintaan generasi ilustrasi.");
      } finally {
        setPreparingRequest(false);
      }
      return null;
    },
    [plan]
  );

  const generateIllustration = useCallback(
    async (forceRetry = false) => {
      if (!plan || plan.targetType !== "illustration") return null;

      let req = preparedRequest;
      if (!req) {
        req = await prepareIllustrationRequest();
      }
      if (!req) {
        toast.error("Permintaan generasi gambar belum siap. Silakan klik Siapkan Permintaan terlebih dahulu.");
        return null;
      }

      setGenerating(true);
      try {
        const res = (await generateIllustrationServerFn({
          data: {
            requestId: req.requestId,
            forceRetry,
          },
        })) as any;

        if (res.status === "success" && res.result) {
          setGenerationResult(res.result);
          if (res.result.status === "succeeded") {
            toast.success(
              res.fromCache
                ? "Ilustrasi dimuat dari hasil generasi sebelumnya (cache)!"
                : "Ilustrasi nyata AI berhasil digenerate!"
            );
          } else {
            toast.error(
              res.result.error?.message || "Generasi gambar gagal dari provider AI."
            );
          }
          return res.result as IllustrationGenerationResult;
        }
      } catch (err: any) {
        console.error("[generateIllustration] Error:", err);
        toast.error(err.message || "Gagal menjalankan generasi ilustrasi AI.");
      } finally {
        setGenerating(false);
      }
      return null;
    },
    [plan, preparedRequest, prepareIllustrationRequest]
  );

  const preparePresentationRequest = useCallback(
    async (overrideParams?: Partial<PresentationGenerationParameters>) => {
      if (!plan || plan.targetType !== "presentation") return null;
      setPreparingPresentationRequest(true);
      try {
        const res = (await preparePresentationGenerationRequestServerFn({
          data: {
            planId: plan.id,
            parameters: overrideParams,
          },
        })) as any;
        if (res.status === "success" && res.request) {
          setPreparedPresentationRequest(res.request);
          toast.success("Spesifikasi generasi presentasi (PPT-1A) berhasil divalidasi dan disiapkan!");
          return res.request;
        }
      } catch (err: any) {
        console.error("[preparePresentationRequest] Error:", err);
        toast.error(err.message || "Gagal menyiapkan spesifikasi presentasi.");
      } finally {
        setPreparingPresentationRequest(false);
      }
      return null;
    },
    [plan]
  );

  const loadPreparedPresentationRequest = useCallback(
    async (requestId: string) => {
      try {
        const res = (await getPresentationGenerationRequestServerFn({
          data: { requestId },
        })) as any;
        if (res.status === "success" && res.request) {
          setPreparedPresentationRequest(res.request);
          return res.request;
        }
      } catch (err: any) {
        console.warn("[loadPreparedPresentationRequest] Error:", err);
      }
      return null;
    },
    []
  );

  const generatePresentationContent = useCallback(
    async (requestId?: string, forceRetry = false) => {
      let targetRequestId = requestId || preparedPresentationRequest?.requestId;
      if (!targetRequestId) {
        const req = await preparePresentationRequest();
        if (!req) {
          toast.error("Tidak dapat menjalankan generasi konten: Spesifikasi presentasi belum disiapkan.");
          return null;
        }
        targetRequestId = req.requestId;
      }

      setGeneratingPresentationContent(true);
      setPresentationGenerationError(null);
      try {
        const res = (await generatePresentationContentServerFn({
          data: {
            requestId: targetRequestId,
            options: { forceFresh: forceRetry },
          },
        })) as any;

        if (res.status === "success" && res.result) {
          setGeneratedPresentationContent(res.result);
          toast.success("Konten presentasi edukatif AI (PPT-1B) berhasil digenerate dan divalidasi!");
          return res.result as PresentationContentPackage;
        }
      } catch (err: any) {
        console.error("[generatePresentationContent] Error:", err);
        const errMsg = err.message || "Gagal mengenerate konten presentasi AI.";
        setPresentationGenerationError(errMsg);
        toast.error(errMsg);
      } finally {
        setGeneratingPresentationContent(false);
      }
      return null;
    },
    [preparedPresentationRequest, preparePresentationRequest]
  );

  const loadPresentationContent = useCallback(
    async (resultId: string) => {
      try {
        const res = (await getPresentationGenerationResultServerFn({
          data: { resultId },
        })) as any;
        if (res.status === "success" && res.result) {
          setGeneratedPresentationContent(res.result);
          return res.result;
        }
      } catch (err: any) {
        console.warn("[loadPresentationContent] Error:", err);
      }
      return null;
    },
    []
  );

  const resetPresentationContent = useCallback(() => {
    setGeneratedPresentationContent(null);
    setPresentationGenerationError(null);
  }, []);

  return {
    plan,
    versions,
    loading,
    saving,
    approving,
    preparedRequest,
    preparingRequest,
    generating,
    generationResult,
    preparedPresentationRequest,
    preparingPresentationRequest,
    generatedPresentationContent,
    generatingPresentationContent,
    presentationGenerationError,
    availableStyles,
    isApproved: Boolean(plan && plan.status === "approved" && plan.approvedVersion === plan.currentVersion),
    initPlan,
    loadPlan,
    saveOutlineEdits,
    selectStyle,
    approvePlan,
    revokeApproval,
    addSlide,
    removeSlide,
    duplicateSlide,
    reorderSlides,
    updateSlide,
    fetchSpecification,
    prepareIllustrationRequest,
    generateIllustration,
    setGenerationResult,
    preparePresentationRequest,
    loadPreparedPresentationRequest,
    setPreparedPresentationRequest,
    generatePresentationContent,
    loadPresentationContent,
    resetPresentationContent,
    setGeneratedPresentationContent,
  };
}
