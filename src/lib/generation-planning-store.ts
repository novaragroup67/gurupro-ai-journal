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
  GenerationSpecification,
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
import {
  renderPresentationPptxServerFn,
  getPresentationArtifactServerFn,
  listPresentationArtifactsServerFn,
} from "./presentation-artifact.functions";
import {
  getPresentationReviewServerFn,
  startPresentationReviewServerFn,
  approvePresentationServerFn,
  rejectPresentationServerFn,
  updatePresentationReviewNotesServerFn,
} from "./presentation-review.functions";
import {
  evaluatePresentationQualityServerFn,
  getPresentationQualityEvaluationServerFn,
  downloadPresentationPptxServerFn,
} from "./presentation-quality.functions";
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
import type { PresentationArtifact } from "./ai/presentation-artifact-contract";
import type { PresentationReview } from "./ai/presentation-review-contract";
import type { PresentationQualityEvaluation } from "./ai/presentation-quality-contract";

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
  const [presentationArtifact, setPresentationArtifact] = useState<PresentationArtifact | null>(null);
  const [renderingPptx, setRenderingPptx] = useState(false);
  const [pptxRenderError, setPptxRenderError] = useState<string | null>(null);
  const [renderStage, setRenderStage] = useState<
    "idle" | "rendering" | "validating" | "storing" | "ready" | "failed"
  >("idle");
  const [presentationReview, setPresentationReview] = useState<PresentationReview | null>(null);
  const [reviewingPresentation, setReviewingPresentation] = useState(false);
  const [presentationReviewError, setPresentationReviewError] = useState<string | null>(null);
  const [presentationQualityEvaluation, setPresentationQualityEvaluation] =
    useState<PresentationQualityEvaluation | null>(null);
  const [evaluatingPresentationQuality, setEvaluatingPresentationQuality] =
    useState(false);
  const [presentationQualityError, setPresentationQualityError] = useState<string | null>(null);
  const [availableStyles] = useState<GenerationStyle[]>(
    targetType === "illustration" ? ILLUSTRATION_STYLES_CATALOG : PRESENTATION_STYLES_CATALOG,
  );
  const [specification, setSpecification] = useState<GenerationSpecification | null>(null);

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
        if (res.specification) {
          setSpecification(res.specification);
        } else {
          setSpecification(null);
        }
      } else {
        setPlan(null);
        setVersions([]);
        setSpecification(null);
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
          setSpecification(null);
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
          setSpecification(null);
          setPreparedRequest(null);
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
            setSpecification(null);
            setPreparedRequest(null);
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
        if (res.specification) {
          setSpecification(res.specification);
        }
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
        setSpecification(null);
        setPreparedRequest(null);
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
        toast.error("Permintaan generasi gambar belum siap. Pastikan rencana telah disetujui.");
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

  const renderPresentationPptx = useCallback(
    async (contentResultId: string, forceReRender = false) => {
      setRenderingPptx(true);
      setPptxRenderError(null);
      setRenderStage("rendering");
      try {
        setRenderStage("validating");
        const res = (await renderPresentationPptxServerFn({
          data: { contentResultId, forceReRender },
        })) as any;

        if (res.status === "success" && res.artifact) {
          setRenderStage("ready");
          setPresentationArtifact(res.artifact);
          toast.success("File PowerPoint (.pptx) berhasil dibuat!");
          return res.artifact;
        } else {
          throw new Error("Gagal membuat file PPTX.");
        }
      } catch (err: any) {
        setRenderStage("failed");
        const msg = err.message || "Gagal merender file PPTX.";
        setPptxRenderError(msg);
        toast.error(`Gagal membuat PPTX: ${msg}`);
        return null;
      } finally {
        setRenderingPptx(false);
      }
    },
    []
  );

  const loadPresentationArtifact = useCallback(async (artifactId: string) => {
    try {
      const res = (await getPresentationArtifactServerFn({
        data: { artifactId },
      })) as any;
      if (res.status === "success" && res.artifact) {
        setPresentationArtifact(res.artifact);
        setRenderStage("ready");
        return res.artifact;
      }
    } catch (err: any) {
      console.warn("[loadPresentationArtifact] Error:", err);
    }
    return null;
  }, []);

  const resetPresentationArtifact = useCallback(() => {
    setPresentationArtifact(null);
    setPptxRenderError(null);
    setRenderStage("idle");
  }, []);

  const loadPresentationReview = useCallback(async (contentResultId: string) => {
    try {
      const res = (await getPresentationReviewServerFn({
        data: { contentResultId },
      })) as any;
      if (res.status === "success" && res.review) {
        setPresentationReview(res.review);
        return res.review;
      }
    } catch (err: any) {
      console.warn("[loadPresentationReview] Error:", err);
    }
    return null;
  }, []);

  const startPresentationReview = useCallback(async (contentResultId: string) => {
    setReviewingPresentation(true);
    setPresentationReviewError(null);
    try {
      const res = (await startPresentationReviewServerFn({
        data: { contentResultId },
      })) as any;
      if (res.status === "success" && res.review) {
        setPresentationReview(res.review);
        return res.review;
      }
    } catch (err: any) {
      const msg = err.message || "Gagal memulai peninjauan presentasi.";
      setPresentationReviewError(msg);
      toast.error(msg);
    } finally {
      setReviewingPresentation(false);
    }
    return null;
  }, []);

  const approvePresentation = useCallback(
    async (contentResultId: string, teacherNotes?: string, expectedVersion?: number) => {
      setReviewingPresentation(true);
      setPresentationReviewError(null);
      try {
        const res = (await approvePresentationServerFn({
          data: { contentResultId, teacherNotes, expectedVersion },
        })) as any;
        if (res.status === "success" && res.review) {
          setPresentationReview(res.review);
          toast.success("Presentasi berhasil disetujui oleh guru!");
          return res.review;
        }
      } catch (err: any) {
        const msg = err.message || "Gagal menyetujui presentasi.";
        setPresentationReviewError(msg);
        toast.error(`Persetujuan ditolak: ${msg}`);
      } finally {
        setReviewingPresentation(false);
      }
      return null;
    },
    []
  );

  const rejectPresentation = useCallback(
    async (contentResultId: string, teacherNotes: string, expectedVersion?: number) => {
      setReviewingPresentation(true);
      setPresentationReviewError(null);
      try {
        const res = (await rejectPresentationServerFn({
          data: { contentResultId, teacherNotes, expectedVersion },
        })) as any;
        if (res.status === "success" && res.review) {
          setPresentationReview(res.review);
          toast.info("Presentasi telah ditolak dengan catatan evaluasi.");
          return res.review;
        }
      } catch (err: any) {
        const msg = err.message || "Gagal menolak presentasi.";
        setPresentationReviewError(msg);
        toast.error(`Penolakan gagal: ${msg}`);
      } finally {
        setReviewingPresentation(false);
      }
      return null;
    },
    []
  );

  const updatePresentationReviewNotes = useCallback(
    async (contentResultId: string, teacherNotes?: string) => {
      try {
        const res = (await updatePresentationReviewNotesServerFn({
          data: { contentResultId, teacherNotes },
        })) as any;
        if (res.status === "success" && res.review) {
          setPresentationReview(res.review);
          toast.success("Catatan review berhasil diperbarui.");
          return res.review;
        }
      } catch (err: any) {
        console.warn("[updatePresentationReviewNotes] Error:", err);
      }
      return null;
    },
    []
  );

  const resetPresentationReview = useCallback(() => {
    setPresentationReview(null);
    setPresentationReviewError(null);
  }, []);

  const loadPresentationQualityEvaluation = useCallback(
    async (artifactId: string) => {
      if (!artifactId) return null;
      try {
        const res = (await getPresentationQualityEvaluationServerFn({
          data: { artifactId },
        })) as any;
        if (res.status === "success") {
          setPresentationQualityEvaluation(res.evaluation);
          return res.evaluation;
        }
      } catch (err: any) {
        console.warn("[loadPresentationQualityEvaluation] Error:", err);
      }
      return null;
    },
    []
  );

  const evaluatePresentationQuality = useCallback(
    async (artifactId: string, forceReevaluate = false) => {
      if (!artifactId) return null;
      setEvaluatingPresentationQuality(true);
      setPresentationQualityError(null);
      try {
        const res = (await evaluatePresentationQualityServerFn({
          data: { artifactId, forceReevaluate },
        })) as any;
        if (res.status === "success" && res.evaluation) {
          setPresentationQualityEvaluation(res.evaluation);
          if (res.evaluation.status === "passed") {
            toast.success("Dokumen PPTX lolos validasi mutu (Quality Gate PASS)! Berkas siap diunduh.");
          } else {
            toast.error("Validasi mutu mendeteksi kendala pada presentasi. Periksa catatan temuan.");
          }
          return res.evaluation;
        }
      } catch (err: any) {
        const msg = err.message || "Gagal menjalankan evaluasi mutu presentasi.";
        setPresentationQualityError(msg);
        toast.error(`Quality Gate gagal: ${msg}`);
      } finally {
        setEvaluatingPresentationQuality(false);
      }
      return null;
    },
    []
  );

  const downloadApprovedPresentationPptx = useCallback(
    async (artifactId: string) => {
      if (!artifactId) return null;
      try {
        const res = (await downloadPresentationPptxServerFn({
          data: { artifactId },
        })) as any;
        if (res.status === "success") {
          if (typeof window !== "undefined" && res.downloadUrl) {
            const a = document.createElement("a");
            a.href = res.downloadUrl;
            a.download = res.filename;
            a.target = "_blank";
            document.body.appendChild(a);
            a.click();
            a.remove();
          }
          toast.success("Mengunduh dokumen PowerPoint (.pptx)...");
          return res;
        }
      } catch (err: any) {
        const msg = err.message || "Gagal mengunduh presentasi.";
        toast.error(`Unduhan ditolak: ${msg}`);
      }
      return null;
    },
    []
  );

  const resetPresentationQualityEvaluation = useCallback(() => {
    setPresentationQualityEvaluation(null);
    setPresentationQualityError(null);
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
    presentationArtifact,
    renderingPptx,
    pptxRenderError,
    renderStage,
    presentationReview,
    reviewingPresentation,
    presentationReviewError,
    presentationQualityEvaluation,
    evaluatingPresentationQuality,
    presentationQualityError,
    availableStyles,
    specification,
    setSpecification,
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
    renderPresentationPptx,
    loadPresentationArtifact,
    resetPresentationArtifact,
    setPresentationArtifact,
    loadPresentationReview,
    startPresentationReview,
    approvePresentation,
    rejectPresentation,
    updatePresentationReviewNotes,
    resetPresentationReview,
    setPresentationReview,
    loadPresentationQualityEvaluation,
    evaluatePresentationQuality,
    downloadApprovedPresentationPptx,
    resetPresentationQualityEvaluation,
    setPresentationQualityEvaluation,
  };
}
