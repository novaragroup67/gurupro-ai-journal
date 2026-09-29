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

  return {
    plan,
    versions,
    loading,
    saving,
    approving,
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
    reorderSlides,
    updateSlide,
    fetchSpecification,
  };
}
