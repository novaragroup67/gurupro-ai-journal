/**
 * ==============================================================================
 * GURUPRO AI: GENERATION PLANNING PANELS (GEN-0)
 * ==============================================================================
 *
 * Implements the 5-step lifecycle planning interface for:
 * 1. AI Illustration Planning
 * 2. AI Presentation (PPT) Planning
 *
 * Steps:
 * Step 1: Draf Outline Rencana
 * Step 2: Tinjau & Edit Outline
 * Step 3: Pilih Gaya Visual
 * Step 4: Persetujuan Rencana (Approval Gate)
 * Step 5: Otorisasi Generasi (Authorized Specification Preview)
 *
 * Invariant:
 * Strictly does NOT perform real image or PPTX generation.
 * Generates and validates the planning and authorization specification.
 */

import React, { useState, useEffect } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  FileText,
  Palette,
  ShieldCheck,
  Zap,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  RefreshCw,
  Lock,
  Unlock,
  Eye,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Database,
  Link2,
  Unlink,
  Copy,
  Check,
  Archive,
  ExternalLink,
  FileCheck2,
  ThumbsUp,
  ThumbsDown,
  Clock,
  AlertTriangle,
  Info,
  ListChecks,
  MessageSquare,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  IllustrationOutline,
  PresentationOutline,
  PresentationSlide,
  ILLUSTRATION_STYLES_CATALOG,
  PRESENTATION_STYLES_CATALOG,
  GenerationSpecification,
} from "@/lib/ai/generation-planning-contract";
import type { IllustrationGenerationRequest } from "@/lib/ai/illustration-generation-contract";
import type {
  PresentationGenerationRequest,
  PresentationGenerationParameters,
  PresentationAspectRatio,
  PresentationContentDensity,
  PresentationContentPackage,
  PresentationSlideContent,
} from "@/lib/ai/presentation-generation-contract";
import { useGenerationPlan } from "@/lib/generation-planning-store";
import { useIllustrationAssetStore } from "@/lib/illustration-asset-store";
import { toast } from "sonner";

// ==============================================================================
// 1. ILLUSTRATION PLANNING PANEL
// ==============================================================================

export interface IllustrationPlanningPanelProps {
  moduleId: string;
  sectionId?: string;
  moduleTitle?: string;
  sections?: Array<{ id: string; judul: string; ilustrasi?: string }>;
  onSectionUpdated?: (sectionId: string, illustrationUrl?: string) => void;
}

export function IllustrationPlanningPanel({
  moduleId,
  sectionId,
  moduleTitle,
  sections = [],
  onSectionUpdated,
}: IllustrationPlanningPanelProps) {
  const {
    plan,
    versions,
    loading,
    saving,
    approving,
    preparedRequest,
    preparingRequest,
    generating,
    generationResult,
    availableStyles,
    initPlan,
    saveOutlineEdits,
    selectStyle,
    approvePlan,
    revokeApproval,
    fetchSpecification,
    prepareIllustrationRequest,
    generateIllustration,
    specification: storeSpec,
  } = useGenerationPlan({
    moduleId,
    targetType: "illustration",
    sectionId,
  });

  // Local editable form state
  const [formOutline, setFormOutline] = useState<IllustrationOutline | null>(null);
  const [localSpecification, setLocalSpecification] = useState<GenerationSpecification | null>(null);
  const specification = storeSpec || localSpecification;
  const [showSpecPreview, setShowSpecPreview] = useState(false);
  const [showReqPreview, setShowReqPreview] = useState(false);

  // Sync form state when plan changes
  useEffect(() => {
    if (plan && plan.outline) {
      setFormOutline(plan.outline as IllustrationOutline);
    }
  }, [plan]);

  // VIS-1C & VIS-1D Asset & Review Store
  const {
    assets: moduleAssets,
    loadAssets,
    loadReviewableAssets,
    reviewItems,
    selectedAssetId,
    selectedReviewable,
    selectAssetForReview,
    persistAsset,
    attachAsset,
    detachAsset,
    transitionLifecycle,
    saveReview,
    approveForUse,
    rejectAsset,
    keepForLater,
    savingReview,
    persisting: persistingAsset,
    attaching: attachingAsset,
    evaluationsByAssetId,
    evaluatingAssetId,
    evaluateQuality,
    loadQualityEvaluation,
  } = useIllustrationAssetStore(moduleId);

  const [selectedTargetSection, setSelectedTargetSection] = useState<string>(sectionId || "");
  const [copiedHash, setCopiedHash] = useState(false);
  const [showAssetHistory, setShowAssetHistory] = useState(false);
  const [showCompareOutline, setShowCompareOutline] = useState(true);
  const [teacherNotesInput, setTeacherNotesInput] = useState("");
  const [confirmReplaceOpen, setConfirmReplaceOpen] = useState(false);
  const [confirmArchiveOpen, setConfirmArchiveOpen] = useState(false);
  const [targetSectionToAttach, setTargetSectionToAttach] = useState<string | null>(null);
  const [targetAssetToArchive, setTargetAssetToArchive] = useState<string | null>(null);

  useEffect(() => {
    if (moduleId) {
      void loadAssets(moduleId);
      void loadReviewableAssets(moduleId, plan?.id);
    }
  }, [moduleId, plan?.id, loadAssets, loadReviewableAssets]);

  // Sync teacher notes input when selected review changes
  useEffect(() => {
    if (selectedReviewable?.review?.teacherNotes) {
      setTeacherNotesInput(selectedReviewable.review.teacherNotes);
    } else {
      setTeacherNotesInput("");
    }
  }, [selectedReviewable?.asset.id, selectedReviewable?.review?.teacherNotes]);

  const currentAsset =
    (selectedReviewable?.asset) ||
    moduleAssets.find((a) => a.generationId === generationResult?.generationId) ||
    (moduleAssets.length > 0 ? moduleAssets[0] : null);

  const currentReview =
    (selectedReviewable?.review) ||
    (currentAsset ? reviewItems.find((r) => r.asset.id === currentAsset.id)?.review : null);

  const currentQualityEvaluation = currentAsset ? evaluationsByAssetId[currentAsset.id] : null;

  useEffect(() => {
    if (currentAsset?.id && !evaluationsByAssetId[currentAsset.id]) {
      void loadQualityEvaluation(currentAsset.id);
    }
  }, [currentAsset?.id, loadQualityEvaluation, evaluationsByAssetId]);

  const isEligibleForUse = Boolean(
    currentAsset &&
    currentAsset.lifecycleStatus !== "soft_deleted" &&
    currentReview?.reviewStatus === "approved_for_use" &&
    currentQualityEvaluation?.decision === "PASS" &&
    currentQualityEvaluation?.deterministicChecks?.passed
  );

  // Load specification when approved
  useEffect(() => {
    if (plan?.status === "approved" && !storeSpec) {
      void fetchSpecification().then((spec) => {
        if (spec) setLocalSpecification(spec);
      });
    } else if (plan?.status !== "approved") {
      setLocalSpecification(null);
    }
  }, [plan?.status, plan?.currentVersion, fetchSpecification, storeSpec]);

  const handleSaveOutline = async () => {
    if (!formOutline) return;
    await saveOutlineEdits(formOutline, "Pembaruan outline ilustrasi oleh guru");
  };

  const handleStyleChange = async (styleId: string) => {
    await selectStyle(styleId);
  };

  const isApproved = plan?.status === "approved";
  const selectedStyleId = plan?.selectedStyleId || "style_ill_flat_edu";

  return (
    <div className="grid gap-6">
      {/* HEADER & LIFECYCLE PROGRESS */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-accent/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-primary/30 text-primary font-mono text-xs">
                  GEN-0
                </Badge>
                <CardTitle className="text-lg font-display text-navy">
                  Perencanaan Ilustrasi Modul Terstruktur
                </CardTitle>
              </div>
              <CardDescription className="mt-1 text-xs">
                Siklus 5 Langkah: Draf Outline → Tinjau/Edit → Pilih Gaya → Persetujuan Rencana → Otorisasi Generasi
              </CardDescription>
            </div>

            {plan ? (
              <div className="flex items-center gap-2">
                <Badge variant={isApproved ? "default" : "secondary"} className="gap-1">
                  {isApproved ? <CheckCircle2 className="h-3 w-3" /> : <SlidersHorizontal className="h-3 w-3" />}
                  {isApproved ? `Disetujui (v${plan.approvedVersion})` : `Draf v${plan.currentVersion}`}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {versions.length} versi tercatat
                </span>
              </div>
            ) : null}
          </div>
        </CardHeader>

        {!plan ? (
          <CardContent className="pt-2">
            <div className="rounded-xl border border-dashed border-primary/30 bg-background/50 p-6 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-primary mb-2" />
              <h4 className="font-semibold text-sm text-foreground">
                Belum ada rencana ilustrasi terstruktur untuk modul ini
              </h4>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                Buat draf outline visual awal berdasarkan subjek dan materi modul pembelajaran secara aman tanpa pemanggilan generator eksternal berbiaya.
              </p>
              <Button
                className="mt-4 gap-2"
                onClick={() => initPlan()}
                disabled={loading || saving}
              >
                <Plus className="h-4 w-4" />
                {saving ? "Membuat Draf..." : "Mulai Rencanakan Ilustrasi (GEN-0)"}
              </Button>
            </div>
          </CardContent>
        ) : null}
      </Card>

      {plan && formOutline ? (
        <div className="grid gap-6">
          {/* STEP 1: DRAF STATUS SUMMARY */}
          <Card>
            <CardHeader className="py-3 px-4 bg-muted/20 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    1
                  </span>
                  <h4 className="text-sm font-semibold text-foreground">
                    Status Draf & Provenance Rencana
                  </h4>
                </div>
                <Badge variant="outline" className="text-xs">
                  Modul ID: {moduleId.slice(0, 8)}…
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4 grid gap-3 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border bg-muted/10">
                  <p className="text-muted-foreground">Versi Terkini</p>
                  <p className="font-semibold text-foreground text-sm">v{plan.currentVersion}</p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/10">
                  <p className="text-muted-foreground">Status Otorisasi</p>
                  <p className="font-semibold text-foreground text-sm capitalize">
                    {plan.status === "approved" ? "Disetujui Guru" : "Menunggu Persetujuan"}
                  </p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/10">
                  <p className="text-muted-foreground">Referensi Sumber</p>
                  <p className="font-semibold text-foreground text-sm truncate">
                    {formOutline.sourceReferences?.join(", ") || `modul:${moduleId}`}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* STEP 2: REVIEW & EDIT OUTLINE */}
          <Card>
            <CardHeader className="py-3 px-4 bg-muted/20 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    2
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Tinjau & Edit Outline Ilustrasi
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Sesuaikan subjek, komposisi, dan fokus pembelajaran sesuai pedagogi Anda.
                    </p>
                  </div>
                </div>
                {isApproved ? (
                  <Badge variant="destructive" className="text-[10px]">
                    Edit akan mencabut persetujuan
                  </Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="pt-4 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="ill-title" className="text-xs font-medium">
                  Judul Ilustrasi
                </Label>
                <Input
                  id="ill-title"
                  value={formOutline.title}
                  onChange={(e) => setFormOutline({ ...formOutline, title: e.target.value })}
                  placeholder="Judul visualisasi..."
                  className="text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="ill-subject" className="text-xs font-medium">
                    Subjek Visual Utama
                  </Label>
                  <Input
                    id="ill-subject"
                    value={formOutline.mainSubject}
                    onChange={(e) => setFormOutline({ ...formOutline, mainSubject: e.target.value })}
                    placeholder="Contoh: Proses fotosintesis pada penampang melintang daun"
                    className="text-sm"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="ill-perspective" className="text-xs font-medium">
                    Sudut Pandang / Sudut Kamera
                  </Label>
                  <Input
                    id="ill-perspective"
                    value={formOutline.perspectiveView}
                    onChange={(e) => setFormOutline({ ...formOutline, perspectiveView: e.target.value })}
                    placeholder="Contoh: Isometrik 3D, eye-level, close-up"
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ill-bg" className="text-xs font-medium">
                  Deskripsi Latar Belakang & Lingkungan
                </Label>
                <Textarea
                  id="ill-bg"
                  value={formOutline.environmentBackground}
                  onChange={(e) =>
                    setFormOutline({ ...formOutline, environmentBackground: e.target.value })
                  }
                  rows={2}
                  placeholder="Deskripsikan latar belakang gambar..."
                  className="text-sm"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ill-composition" className="text-xs font-medium">
                  Komposisi & Tata Letak Visual
                </Label>
                <Textarea
                  id="ill-composition"
                  value={formOutline.composition}
                  onChange={(e) => setFormOutline({ ...formOutline, composition: e.target.value })}
                  rows={2}
                  placeholder="Komposisi penataan elemen..."
                  className="text-sm"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ill-focus" className="text-xs font-medium">
                  Fokus Edukatif / Tujuan Pembelajaran
                </Label>
                <Textarea
                  id="ill-focus"
                  value={formOutline.educationalFocus}
                  onChange={(e) =>
                    setFormOutline({ ...formOutline, educationalFocus: e.target.value })
                  }
                  rows={2}
                  placeholder="Konsep pembelajaran apa yang ingin dipahamkan lewat visual..."
                  className="text-sm"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="ill-avoid" className="text-xs font-medium">
                  Elemen yang Harus Dihindari (Things to Avoid)
                </Label>
                <Input
                  id="ill-avoid"
                  value={formOutline.thingsToAvoid?.join(", ") || ""}
                  onChange={(e) =>
                    setFormOutline({
                      ...formOutline,
                      thingsToAvoid: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Pisahkan dengan koma: teks berjejal, visual seram, warna terlalu gelap"
                  className="text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  Dipisahkan dengan tanda koma.
                </p>
              </div>

              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  {isApproved
                    ? "⚠️ Menyimpan perubahan outline akan mencabut persetujuan secara otomatis."
                    : "Simpan draf outline untuk melanjutkan ke pemilihan gaya dan persetujuan."}
                </p>
                <Button
                  onClick={handleSaveOutline}
                  disabled={saving}
                  size="sm"
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  {saving ? "Menyimpan..." : "Simpan Perubahan Outline"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* STEP 3: STYLE SELECTION */}
          <Card>
            <CardHeader className="py-3 px-4 bg-muted/20 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    3
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Pilih Gaya Ilustrasi Visual
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Pilih salah satu dari 7 preset gaya visual pedagogis terverifikasi.
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs font-medium">
                  {ILLUSTRATION_STYLES_CATALOG.find((s) => s.id === selectedStyleId)?.name || "Preset Terpilih"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ILLUSTRATION_STYLES_CATALOG.map((style) => {
                  const isSelected = selectedStyleId === style.id;
                  return (
                    <button
                      type="button"
                      key={style.id}
                      aria-pressed={isSelected}
                      disabled={loading || saving}
                      onClick={() => handleStyleChange(style.id)}
                      className={`cursor-pointer rounded-xl border p-3.5 transition-all text-left relative flex flex-col justify-between ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                          : "border-border/70 hover:border-primary/40 hover:bg-muted/30"
                      } ${loading || saving ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <h5 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                            <Palette className="h-3.5 w-3.5 text-primary" />
                            {style.name}
                          </h5>
                          {isSelected ? (
                            <Badge className="h-5 px-1.5 text-[10px] bg-primary">Terpilih</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                          {style.description}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-1 mt-2">
                        {style.visualRules.slice(0, 2).map((rule, idx) => (
                          <span
                            key={idx}
                            className="inline-block rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {rule}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* STEP 4: APPROVAL GATE */}
          <Card className={isApproved ? "border-emerald-500/30 bg-emerald-50/10" : ""}>
            <CardHeader className="py-3 px-4 bg-muted/20 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      isApproved
                        ? "bg-emerald-600 text-white"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    4
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Persetujuan Rencana Ilustrasi (Approval Gate)
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Guru memvalidasi kesesuaian outline dan gaya sebelum otorisasi generasi diaktifkan.
                    </p>
                  </div>
                </div>
                {isApproved ? (
                  <Badge className="bg-emerald-600 text-white text-xs gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Telah Disetujui
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                    Perlu Persetujuan
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {isApproved ? (
                <Alert className="border-emerald-500/30 bg-emerald-500/5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <AlertTitle className="text-sm font-semibold text-emerald-800">
                    Rencana Ilustrasi Disetujui (Versi {plan.approvedVersion})
                  </AlertTitle>
                  <AlertDescription className="text-xs text-emerald-700 mt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span>
                      Rencana ini terkunci dan telah memenuhi syarat otorisasi generasi spesifikasi. Jika Anda mengubah outline atau gaya visual, persetujuan akan otomatis dicabut.
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => revokeApproval()}
                      disabled={approving}
                      className="border-emerald-400 text-emerald-800 hover:bg-emerald-100/50 shrink-0 gap-1"
                    >
                      <Unlock className="h-3.5 w-3.5" />
                      Cabut Persetujuan
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border bg-muted/10">
                  <div className="space-y-1">
                    <h5 className="font-semibold text-sm text-foreground">
                      Siap menyetujui rencana visualisasi ini?
                    </h5>
                    <p className="text-xs text-muted-foreground">
                      Memastikan subjek, fokus edukatif, dan gaya telah sesuai dengan standar pembelajaran.
                    </p>
                  </div>
                  <Button
                    onClick={() => approvePlan()}
                    disabled={approving || saving}
                    className="gap-2 shrink-0 bg-primary"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {approving ? "Menyetujui..." : "Setujui Rencana Ilustrasi"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* STEP 5: GENERATION AUTHORIZATION & SPEC PREVIEW */}
          <Card className={isApproved ? "border-primary/40 shadow-sm" : "opacity-80"}>
            <CardHeader className="py-3 px-4 bg-muted/20 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      isApproved
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    5
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Otorisasi Generasi & Spesifikasi AI
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Spesifikasi siap-eksekusi setelah rencana disetujui oleh guru.
                    </p>
                  </div>
                </div>
                {isApproved ? (
                  <Badge className="bg-primary text-primary-foreground text-xs gap-1">
                    <Lock className="h-3 w-3" />
                    Siap untuk Generasi
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-xs">
                    Terkunci
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4 grid gap-4">
              {isApproved ? (
                <div className="grid gap-3">
                  {specification ? (
                    <div className="rounded-xl border p-4 bg-muted/10 grid gap-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-muted-foreground">ID Otorisasi:</span>
                        <span className="font-mono font-semibold text-foreground">
                          {specification.authorizationId}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Resolusi Output Target:</span>
                        <span className="font-medium text-foreground">
                          {specification.parameters.dimensions?.width}x{specification.parameters.dimensions?.height} (Rasio {specification.parameters.aspectRatio})
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Gaya Diterapkan:</span>
                        <span className="font-medium text-foreground">
                          {specification.styleSnapshot.styleName} (v{specification.styleSnapshot.styleVersion})
                        </span>
                      </div>
                      <Separator className="my-1" />
                      <div>
                        <span className="text-muted-foreground block mb-1">Prompt Gambar Terstruktur (Grounded):</span>
                        <p className="p-2.5 rounded-lg bg-background border font-mono text-[11px] text-foreground/90 whitespace-pre-wrap">
                          {specification.prompt}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border p-3.5 bg-emerald-50/20 border-emerald-500/30 text-xs text-foreground flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span>Rencana telah disetujui. Otorisasi generasi aktif dan siap diproses.</span>
                      </div>
                      <Badge className="bg-emerald-600 text-white text-[10px]">Otorisasi Valid</Badge>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {specification ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowSpecPreview(!showSpecPreview)}
                          className="text-xs gap-1.5"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          {showSpecPreview ? "Tutup Inspeksi Spek" : "Inspeksi Spesifikasi (JSON)"}
                        </Button>
                      ) : null}

                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => prepareIllustrationRequest()}
                        disabled={preparingRequest}
                        className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {preparingRequest ? "Menyiapkan Permintaan..." : "Siapkan Permintaan Generasi (VIS-1A)"}
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => generateIllustration()}
                        disabled={!isApproved || generating}
                        className="text-xs gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-sm"
                      >
                        {generating ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Menghasilkan Gambar AI...
                          </>
                        ) : (
                          <>
                            <Zap className="h-3.5 w-3.5 text-amber-300" />
                            Generate Gambar Nyata (VIS-1B)
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {preparedRequest ? (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/10 p-4 grid gap-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span className="font-semibold text-emerald-800">
                            Permintaan Generasi Gambar Siap (VIS-1A Canonical Request)
                          </span>
                        </div>
                        <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-[10px]">
                          Provider-Agnostic
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                        <div className="p-2 rounded bg-background/80 border">
                          <span className="text-muted-foreground block text-[10px]">ID Permintaan:</span>
                          <span className="font-bold text-foreground">{preparedRequest.requestId}</span>
                        </div>
                        <div className="p-2 rounded bg-background/80 border">
                          <span className="text-muted-foreground block text-[10px]">Rasio & Resolusi:</span>
                          <span className="font-bold text-foreground">
                            {preparedRequest.generationParameters.aspectRatio} ({preparedRequest.generationParameters.width}x{preparedRequest.generationParameters.height})
                          </span>
                        </div>
                      </div>

                      <div className="p-2.5 rounded bg-background/80 border space-y-1">
                        <span className="text-muted-foreground block text-[10px] font-semibold">Kebijakan Teks Visual (Text Policy):</span>
                        <div className="flex flex-wrap items-center gap-2 text-[11px]">
                          <Badge variant="secondary" className="text-[10px]">
                            Model Invented Text: Dilarang (Strict)
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            Strategi: {preparedRequest.textPolicy.textRenderStrategy}
                          </Badge>
                          {preparedRequest.textPolicy.mustAppear.length > 0 ? (
                            <span className="text-muted-foreground text-[10px]">
                              Label Wajib: <strong>{preparedRequest.textPolicy.mustAppear.join(", ")}</strong>
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">Tanpa Label Teks (Visual Bersih)</span>
                          )}
                        </div>
                      </div>

                      <div className="p-2.5 rounded bg-background/80 border space-y-1">
                        <span className="text-muted-foreground block text-[10px] font-semibold">Prompt Terakit Final (Deterministic Assembled):</span>
                        <p className="font-mono text-[10px] text-foreground/90 whitespace-pre-wrap max-h-32 overflow-y-auto p-1.5 rounded bg-muted/30">
                          {preparedRequest.assembledPrompt.fullPrompt}
                        </p>
                      </div>

                      <div className="flex justify-start">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowReqPreview(!showReqPreview)}
                          className="text-[11px] h-7 px-2 text-emerald-800 hover:text-emerald-900 hover:bg-emerald-100/50 gap-1"
                        >
                          <Eye className="h-3 w-3" />
                          {showReqPreview ? "Sembunyikan Raw Request JSON" : "Lihat Raw Request JSON"}
                        </Button>
                      </div>

                      {showReqPreview ? (
                        <pre className="mt-1 p-3 rounded-lg bg-slate-950 text-slate-100 text-[10px] font-mono overflow-x-auto max-h-60 border">
                          {JSON.stringify(preparedRequest, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}

                  {/* GENERATION RESULT ARTIFACT DISPLAY (VIS-1B) */}
                  {generationResult ? (
                    <div
                      className={`rounded-xl border p-4 grid gap-3 transition-all ${
                        generationResult.status === "succeeded"
                          ? "border-emerald-500/40 bg-emerald-50/15"
                          : "border-destructive/40 bg-destructive/5"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {generationResult.status === "succeeded" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-destructive" />
                          )}
                          <h5 className="font-semibold text-xs">
                            {generationResult.status === "succeeded"
                              ? "Hasil Generasi Ilustrasi AI Nyata (Real Image Output)"
                              : "Generasi Gambar Gagal (Provider Error)"}
                          </h5>
                        </div>
                        <Badge
                          variant={generationResult.status === "succeeded" ? "default" : "destructive"}
                          className="text-[10px]"
                        >
                          {generationResult.status.toUpperCase()}
                        </Badge>
                      </div>

                      {generationResult.status === "succeeded" && generationResult.assetReference ? (
                        <div className="space-y-3">
                          <div className="rounded-lg overflow-hidden border bg-background flex items-center justify-center p-2">
                            <img
                              src={generationResult.assetReference}
                              alt={plan?.outline && "title" in plan.outline ? plan.outline.title : "Hasil Ilustrasi AI"}
                              className="max-h-96 w-auto object-contain rounded-md shadow-sm"
                            />
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                            <div className="p-2 rounded bg-background border">
                              <span className="text-muted-foreground block text-[10px]">Provider:</span>
                              <span className="font-bold uppercase text-foreground">{generationResult.provider || "OpenAI"}</span>
                            </div>
                            <div className="p-2 rounded bg-background border">
                              <span className="text-muted-foreground block text-[10px]">Model:</span>
                              <span className="font-bold text-foreground">{generationResult.model || "gpt-image-1-mini"}</span>
                            </div>
                            <div className="p-2 rounded bg-background border">
                              <span className="text-muted-foreground block text-[10px]">Dimensi:</span>
                              <span className="font-bold text-foreground">
                                {generationResult.width}x{generationResult.height}
                              </span>
                            </div>
                            <div className="p-2 rounded bg-background border">
                              <span className="text-muted-foreground block text-[10px]">Format:</span>
                              <span className="font-bold text-foreground">{generationResult.mimeType || "image/png"}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <p className="text-[11px] text-muted-foreground">
                              Gambar telah diverifikasi (binary raster non-mock) dan siap digunakan pada materi modul.
                            </p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => generateIllustration(true)}
                              disabled={generating}
                              className="text-xs gap-1.5"
                            >
                              <RefreshCw className={`h-3 w-3 ${generating ? "animate-spin" : ""}`} />
                              Generate Ulang
                            </Button>
                          </div>

                          {/* VIS-1D: TEACHER REVIEW & ASSET MANAGEMENT */}
                          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-3.5 mt-2">
                            {/* Header with Semantic Separation */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 pb-2.5">
                              <div className="flex items-center gap-2">
                                <FileCheck2 className="h-4 w-4 text-primary" />
                                <div>
                                  <h6 className="font-semibold text-xs text-foreground">
                                    Tinjauan Guru & Manajemen Aset (VIS-1D)
                                  </h6>
                                  <p className="text-[10px] text-muted-foreground">
                                    Guru memegang kendali penuh atas evaluasi, persetujuan, penautan, dan pengarsipan ilustrasi.
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                {/* Semantic Review Status Badge */}
                                {currentReview ? (
                                  <Badge
                                    className={
                                      currentReview.reviewStatus === "approved_for_use"
                                        ? "bg-emerald-600 text-white text-[10px]"
                                        : currentReview.reviewStatus === "rejected"
                                        ? "bg-rose-600 text-white text-[10px]"
                                        : currentReview.reviewStatus === "reviewed"
                                        ? "bg-blue-600 text-white text-[10px]"
                                        : "bg-amber-500 text-white text-[10px]"
                                    }
                                  >
                                    {currentReview.reviewStatus === "approved_for_use"
                                      ? "DISETUJUI GURU"
                                      : currentReview.reviewStatus === "rejected"
                                      ? "DITOLAK GURU"
                                      : currentReview.reviewStatus === "reviewed"
                                      ? "SEDANG DITINJAU"
                                      : "MENUNGGU TINJAUAN"}
                                  </Badge>
                                ) : null}

                                {/* Semantic Lifecycle Status Badge */}
                                {currentAsset ? (
                                  <Badge
                                    variant={
                                      currentAsset.lifecycleStatus === "attached"
                                        ? "default"
                                        : currentAsset.lifecycleStatus === "superseded"
                                        ? "outline"
                                        : "secondary"
                                    }
                                    className="text-[10px]"
                                  >
                                    {currentAsset.lifecycleStatus === "attached"
                                      ? "TERPAUT DI MODUL"
                                      : currentAsset.lifecycleStatus === "superseded"
                                      ? "DIGANTIKAN (ARSIP)"
                                      : currentAsset.lifecycleStatus === "archived"
                                      ? "DIARSIPKAN"
                                      : "STAGED (TERSEDIA)"}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                    Belum Tersimpan
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Multiple Output / Alternative Variasi Selector (VIS-1D) */}
                            {reviewItems.length > 1 ? (
                              <div className="p-2 rounded-lg bg-background border space-y-1.5">
                                <span className="text-[10px] font-semibold text-muted-foreground block">
                                  Pilih Variasi Hasil Generasi untuk Ditinjau ({reviewItems.length} Variasi Tersedia):
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  {reviewItems.map((item, idx) => {
                                    const isSelected = item.asset.id === currentAsset?.id;
                                    return (
                                      <div
                                        key={item.asset.id}
                                        onClick={() => selectAssetForReview(item.asset.id)}
                                        className={`cursor-pointer rounded-md border p-1.5 flex items-center gap-2 text-xs transition-all ${
                                          isSelected
                                            ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                                            : "border-border/60 hover:bg-muted/40"
                                        }`}
                                      >
                                        <img
                                          src={item.asset.publicUrl}
                                          alt={`Variasi ${idx + 1}`}
                                          className="h-8 w-8 object-cover rounded shrink-0"
                                        />
                                        <div className="text-[10px] leading-tight">
                                          <p className="font-semibold text-foreground">Variasi #{idx + 1}</p>
                                          <p className="text-muted-foreground">
                                            {item.review.reviewStatus === "approved_for_use"
                                              ? "Disetujui"
                                              : item.review.reviewStatus === "rejected"
                                              ? "Ditolak"
                                              : "Pending"}
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : null}

                            {/* Persistence Action if not yet persisted */}
                            {!currentAsset ? (
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-2.5 rounded-lg bg-background border">
                                <div className="space-y-0.5">
                                  <p className="text-xs font-medium text-foreground">
                                    Simpan gambar ke penyimpanan permanen
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    Menghitung checksum SHA-256 dan mengamankan rekaman jejak pedagogis ke database.
                                  </p>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={async () => {
                                    if (generationResult?.generationId) {
                                      const ast = await persistAsset(
                                        generationResult.generationId,
                                        selectedTargetSection || undefined
                                      );
                                      if (ast && onSectionUpdated && ast.attachedSectionId) {
                                        onSectionUpdated(ast.attachedSectionId, ast.publicUrl);
                                      }
                                      if (ast && moduleId) {
                                        await loadReviewableAssets(moduleId, plan?.id);
                                      }
                                    }
                                  }}
                                  disabled={persistingAsset}
                                  className="text-xs gap-1.5 shrink-0 bg-primary"
                                >
                                  <Database className="h-3.5 w-3.5" />
                                  {persistingAsset ? "Menyimpan Aset..." : "Simpan Aset Permanen (VIS-1C)"}
                                </Button>
                              </div>
                            ) : (
                              <div className="space-y-3 text-xs">
                                {/* Integrity & Storage Metadata */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono">
                                  <div className="p-2 rounded bg-background border flex items-center justify-between">
                                    <div>
                                      <span className="text-[10px] text-muted-foreground block">Hash SHA-256 (Integritas):</span>
                                      <span className="font-bold text-foreground">
                                        {currentAsset.sha256Hash.slice(0, 16)}...
                                      </span>
                                    </div>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6"
                                      onClick={() => {
                                        navigator.clipboard.writeText(currentAsset.sha256Hash);
                                        setCopiedHash(true);
                                        setTimeout(() => setCopiedHash(false), 2000);
                                        toast.success("Hash SHA-256 disalin ke clipboard.");
                                      }}
                                      title="Salin Hash SHA-256"
                                    >
                                      {copiedHash ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                                    </Button>
                                  </div>
                                  <div className="p-2 rounded bg-background border">
                                    <span className="text-[10px] text-muted-foreground block">Storage Path & Driver:</span>
                                    <span className="font-bold text-foreground truncate block">
                                      {currentAsset.storageProvider} ({currentAsset.storagePath})
                                    </span>
                                  </div>
                                </div>

                                {/* VIS-1E: AI ILLUSTRATION QUALITY GATE & VALIDATION */}
                                <div className="rounded-lg border border-indigo-500/30 bg-indigo-50/10 p-3 space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-500/20 pb-2">
                                    <div className="flex items-center gap-2">
                                      <ShieldCheck className="h-4 w-4 text-indigo-600" />
                                      <div>
                                        <h6 className="font-semibold text-xs text-foreground">
                                          Pemeriksaan Kualitas AI (VIS-1E Quality Gate)
                                        </h6>
                                        <p className="text-[10px] text-muted-foreground">
                                          Validasi 3-lapis: teknis deterministik, keselarasan outline & gaya, dan akurasi pedagogis.
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {/* Quality Decision Badge */}
                                      {currentQualityEvaluation ? (
                                        <Badge
                                          className={
                                            currentQualityEvaluation.decision === "PASS"
                                              ? "bg-emerald-600 text-white text-[10px]"
                                              : currentQualityEvaluation.decision === "NEEDS_REVISION"
                                              ? "bg-amber-600 text-white text-[10px]"
                                              : currentQualityEvaluation.decision === "REJECT"
                                              ? "bg-rose-600 text-white text-[10px]"
                                              : "bg-slate-600 text-white text-[10px]"
                                          }
                                        >
                                          {currentQualityEvaluation.decision === "PASS"
                                            ? "LULUS (PASS)"
                                            : currentQualityEvaluation.decision === "NEEDS_REVISION"
                                            ? "PERLU REVISI"
                                            : currentQualityEvaluation.decision === "REJECT"
                                            ? "DITOLAK (REJECT)"
                                            : "EVALUASI GAGAL"}
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-muted-foreground text-[10px]">
                                          Belum Dievaluasi
                                        </Badge>
                                      )}

                                      {/* Composite Usability Eligibility Badge */}
                                      {isEligibleForUse ? (
                                        <Badge className="bg-emerald-700 text-white text-[10px] gap-1">
                                          <CheckCircle2 className="h-2.5 w-2.5" />
                                          SIAP DIGUNAKAN
                                        </Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-slate-500 border-slate-300 text-[10px]">
                                          Belum Memenuhi Syarat Kelayakan
                                        </Badge>
                                      )}
                                    </div>
                                  </div>

                                  {/* Technical Checks Summary (Layer 1) */}
                                  {currentQualityEvaluation?.deterministicChecks ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
                                      <div className="p-2 rounded bg-background border">
                                        <span className="text-muted-foreground block text-[10px]">Format MIME:</span>
                                        <span className="font-semibold text-foreground">
                                          {currentQualityEvaluation.deterministicChecks.mimeType}{" "}
                                          {currentQualityEvaluation.deterministicChecks.mimeTypeValid ? "✓" : "✗"}
                                        </span>
                                      </div>
                                      <div className="p-2 rounded bg-background border">
                                        <span className="text-muted-foreground block text-[10px]">Dimensi (256-4096):</span>
                                        <span className="font-semibold text-foreground">
                                          {currentQualityEvaluation.deterministicChecks.width}x{currentQualityEvaluation.deterministicChecks.height}{" "}
                                          {currentQualityEvaluation.deterministicChecks.dimensionsValid ? "✓" : "✗"}
                                        </span>
                                      </div>
                                      <div className="p-2 rounded bg-background border">
                                        <span className="text-muted-foreground block text-[10px]">Aspek Rasio:</span>
                                        <span className="font-semibold text-foreground">
                                          {currentQualityEvaluation.deterministicChecks.aspectRatio}{" "}
                                          {currentQualityEvaluation.deterministicChecks.aspectRatioValid ? "✓" : "✗"}
                                        </span>
                                      </div>
                                      <div className="p-2 rounded bg-background border">
                                        <span className="text-muted-foreground block text-[10px]">Hash SHA-256:</span>
                                        <span className="font-semibold text-foreground">
                                          {currentQualityEvaluation.deterministicChecks.hashMatches ? "Cocok ✓" : "Beda ✗"}
                                        </span>
                                      </div>
                                    </div>
                                  ) : null}

                                  {/* Findings List */}
                                  {currentQualityEvaluation?.findings && currentQualityEvaluation.findings.length > 0 ? (
                                    <div className="rounded-lg border bg-background p-2.5 space-y-1.5 text-xs">
                                      <span className="font-semibold text-foreground block text-[11px]">
                                        Temuan Evaluasi Mutu ({currentQualityEvaluation.findings.length}):
                                      </span>
                                      <div className="space-y-1 max-h-40 overflow-y-auto">
                                        {currentQualityEvaluation.findings.map((f, idx) => (
                                          <div
                                            key={idx}
                                            className={`p-2 rounded text-[11px] border flex flex-col gap-0.5 ${
                                              f.severity === "critical"
                                                ? "bg-rose-50 border-rose-200 text-rose-900"
                                                : f.severity === "warning"
                                                ? "bg-amber-50 border-amber-200 text-amber-900"
                                                : "bg-slate-50 border-slate-200 text-slate-900"
                                            }`}
                                          >
                                            <div className="flex items-center justify-between">
                                              <span className="font-bold text-[10px] uppercase">
                                                [{f.category}] {f.code}
                                              </span>
                                              <Badge
                                                variant="outline"
                                                className={`text-[9px] uppercase ${
                                                  f.severity === "critical"
                                                    ? "border-rose-400 text-rose-700 bg-white"
                                                    : f.severity === "warning"
                                                    ? "border-amber-400 text-amber-700 bg-white"
                                                    : "border-slate-400 text-slate-700 bg-white"
                                                }`}
                                              >
                                                {f.severity}
                                              </Badge>
                                            </div>
                                            <p className="mt-0.5">{f.description}</p>
                                            {f.recommendation ? (
                                              <p className="text-[10px] opacity-80 italic mt-0.5">Saran: {f.recommendation}</p>
                                            ) : null}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ) : currentQualityEvaluation ? (
                                    <div className="p-2.5 rounded-lg bg-emerald-50/40 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                                      <span>Tidak ditemukan masalah mutu kritis atau peringatan. Ilustrasi selaras dengan spesifikasi outline dan gaya.</span>
                                    </div>
                                  ) : null}

                                  {/* Explicit Action Button */}
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                                    <p className="text-[10px] text-muted-foreground italic">
                                      Evaluasi kualitas AI tidak menggantikan keputusan guru dan tidak memicu regenerasi otomatis.
                                    </p>
                                    <Button
                                      size="sm"
                                      onClick={() => evaluateQuality(currentAsset.id, true)}
                                      disabled={evaluatingAssetId === currentAsset.id}
                                      className="text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white shrink-0"
                                    >
                                      {evaluatingAssetId === currentAsset.id ? (
                                        <>
                                          <RefreshCw className="h-3 w-3 animate-spin" />
                                          Mengevaluasi Kualitas AI...
                                        </>
                                      ) : (
                                        <>
                                          <ShieldCheck className="h-3.5 w-3.5" />
                                          {currentQualityEvaluation ? "Evaluasi Ulang Kualitas AI" : "Evaluasi Kualitas AI"}
                                        </>
                                      )}
                                    </Button>
                                  </div>
                                </div>

                                {/* IMMUTABLE OUTLINE COMPARISON CARD (VIS-1D) */}
                                {selectedReviewable?.approvedOutline ? (
                                  <div className="rounded-lg border bg-background p-3 space-y-2.5">
                                    <div className="flex items-center justify-between border-b pb-1.5">
                                      <div className="flex items-center gap-1.5">
                                        <ListChecks className="h-3.5 w-3.5 text-primary" />
                                        <span className="font-semibold text-xs text-foreground">
                                          Perbandingan Spesifikasi Outline yang Disetujui (Immutable Snapshot)
                                        </span>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowCompareOutline(!showCompareOutline)}
                                        className="h-6 px-1.5 text-[10px] text-muted-foreground"
                                      >
                                        {showCompareOutline ? "Sembunyikan" : "Tampilkan Rincian"}
                                      </Button>
                                    </div>

                                    {showCompareOutline ? (
                                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] pt-1">
                                        <div className="p-2 rounded bg-muted/20 border space-y-1">
                                          <span className="text-muted-foreground text-[10px] block font-medium">Tujuan Edukatif & Subjek:</span>
                                          <p className="font-medium text-foreground">
                                            <strong>Subjek:</strong> {selectedReviewable.approvedOutline.mainSubject}
                                          </p>
                                          <p className="text-muted-foreground text-[10px]">
                                            <strong>Tujuan:</strong> {selectedReviewable.approvedOutline.objective}
                                          </p>
                                          <p className="text-muted-foreground text-[10px]">
                                            <strong>Fokus:</strong> {selectedReviewable.approvedOutline.educationalFocus}
                                          </p>
                                        </div>

                                        <div className="p-2 rounded bg-muted/20 border space-y-1">
                                          <span className="text-muted-foreground text-[10px] block font-medium">Arahan Visual & Komposisi:</span>
                                          <p className="text-foreground text-[10px]">
                                            <strong>Komposisi:</strong> {selectedReviewable.approvedOutline.composition}
                                          </p>
                                          <p className="text-muted-foreground text-[10px]">
                                            <strong>Latar:</strong> {selectedReviewable.approvedOutline.environment}
                                          </p>
                                          <p className="text-muted-foreground text-[10px]">
                                            <strong>Gaya:</strong> {selectedReviewable.approvedStyle?.name} (v{selectedReviewable.approvedStyle?.version})
                                          </p>
                                        </div>

                                        {selectedReviewable.approvedStyle?.visualRules?.length > 0 ? (
                                          <div className="col-span-1 md:col-span-2 p-2 rounded bg-muted/15 border">
                                            <span className="text-muted-foreground text-[10px] block font-medium mb-1">
                                              Aturan Visual Gaya yang Disetujui:
                                            </span>
                                            <div className="flex flex-wrap gap-1">
                                              {selectedReviewable.approvedStyle.visualRules.map((rule, idx) => (
                                                <Badge key={idx} variant="outline" className="text-[9px] bg-background">
                                                  {rule}
                                                </Badge>
                                              ))}
                                            </div>
                                          </div>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}

                                {/* TEACHER REVIEW NOTES & FEEDBACK */}
                                <div className="p-3 rounded-lg bg-background border space-y-2">
                                  <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                                      <MessageSquare className="h-3.5 w-3.5 text-primary" />
                                      Catatan Tinjauan Guru (Opsional):
                                    </Label>
                                    <span className="text-[10px] text-muted-foreground">
                                      Tersimpan permanen untuk riwayat audit
                                    </span>
                                  </div>
                                  <Textarea
                                    value={teacherNotesInput}
                                    onChange={(e) => setTeacherNotesInput(e.target.value)}
                                    placeholder="Contoh: Komposisi visual sudah sangat jelas dan relevan dengan materi siklus air Fase D..."
                                    rows={2}
                                    className="text-xs resize-none"
                                  />
                                  <p className="text-[10px] text-muted-foreground italic">
                                    Catatan guru adalah metadata pedagogis dan tidak dikirimkan ke model AI ataupun memicu generasi otomatis.
                                  </p>
                                </div>

                                {/* TEACHER DECISION ACTIONS (VIS-1D) */}
                                <div className="p-3 rounded-lg bg-background border space-y-2.5">
                                  <span className="text-xs font-semibold text-foreground block">
                                    Keputusan Guru Terhadap Aset Ini:
                                  </span>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                      size="sm"
                                      onClick={() => approveForUse(currentAsset.id, teacherNotesInput)}
                                      disabled={savingReview}
                                      className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                                    >
                                      <ThumbsUp className="h-3.5 w-3.5" />
                                      Setujui untuk Digunakan
                                    </Button>

                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => keepForLater(currentAsset.id, teacherNotesInput)}
                                      disabled={savingReview}
                                      className="text-xs gap-1.5 border-blue-300 text-blue-800 hover:bg-blue-50"
                                    >
                                      <Clock className="h-3.5 w-3.5" />
                                      Simpan untuk Nanti
                                    </Button>

                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => rejectAsset(currentAsset.id, teacherNotesInput, "regenerate")}
                                      disabled={savingReview}
                                      className="text-xs gap-1.5 border-rose-300 text-rose-800 hover:bg-rose-50"
                                    >
                                      <ThumbsDown className="h-3.5 w-3.5" />
                                      Tolak / Jangan Gunakan
                                    </Button>
                                  </div>
                                </div>

                                {/* SECTION ATTACHMENT & REPLACEMENT ACTIONS */}
                                <div className="p-3 rounded-lg bg-background border space-y-2.5">
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                                      <Link2 className="h-3.5 w-3.5 text-primary" />
                                      Tautan ke Bab Modul Ajar:
                                    </span>
                                    {currentAsset.lifecycleStatus === "attached" && currentAsset.attachedSectionId ? (
                                      <Badge variant="outline" className="border-emerald-500 text-emerald-700 bg-emerald-50 text-[10px] gap-1">
                                        <CheckCircle2 className="h-3 w-3" />
                                        Terpaut di:{" "}
                                        {sections.find((s) => s.id === currentAsset.attachedSectionId)?.judul ||
                                          currentAsset.attachedSectionId}
                                      </Badge>
                                    ) : (
                                      <Badge variant="secondary" className="text-[10px]">
                                        Belum Ditautkan
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                                    <select
                                      value={selectedTargetSection}
                                      onChange={(e) => setSelectedTargetSection(e.target.value)}
                                      className="w-full h-8 text-xs rounded-md border border-input bg-background px-2.5 py-1 text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                    >
                                      <option value="">-- Pilih Bab Modul Ajar Target --</option>
                                      {sections.map((sec, idx) => (
                                        <option key={sec.id} value={sec.id}>
                                          Bab {idx + 1}: {sec.judul} {sec.ilustrasi ? "(Sudah ada gambar aktif)" : ""}
                                        </option>
                                      ))}
                                    </select>

                                    <div className="flex items-center gap-1.5 shrink-0 w-full sm:w-auto">
                                      <Button
                                        size="sm"
                                        disabled={!selectedTargetSection || attachingAsset}
                                        onClick={async () => {
                                          if (!selectedTargetSection) return;
                                          const sec = sections.find((s) => s.id === selectedTargetSection);
                                          // If section already has an illustration, open confirmation modal
                                          if (sec && sec.ilustrasi && sec.ilustrasi !== currentAsset.publicUrl) {
                                            setTargetSectionToAttach(selectedTargetSection);
                                            setConfirmReplaceOpen(true);
                                          } else {
                                            const updated = await attachAsset(
                                              currentAsset.id,
                                              moduleId,
                                              selectedTargetSection
                                            );
                                            if (updated && onSectionUpdated) {
                                              onSectionUpdated(selectedTargetSection, updated.publicUrl);
                                            }
                                          }
                                        }}
                                        className="text-xs h-8 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white flex-1 sm:flex-initial"
                                      >
                                        <Link2 className="h-3 w-3" />
                                        {attachingAsset ? "Menautkan..." : "Tautkan ke Bab"}
                                      </Button>

                                      {currentAsset.lifecycleStatus === "attached" ? (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={attachingAsset}
                                          onClick={async () => {
                                            const secId = currentAsset.attachedSectionId;
                                            const ok = await detachAsset(currentAsset.id, moduleId);
                                            if (ok && secId && onSectionUpdated) {
                                              onSectionUpdated(secId, undefined);
                                            }
                                          }}
                                          className="text-xs h-8 gap-1 text-muted-foreground hover:text-destructive"
                                          title="Lepas tautan dari bab ini"
                                        >
                                          <Unlink className="h-3 w-3" />
                                          Lepas
                                        </Button>
                                      ) : null}

                                      {currentAsset.lifecycleStatus !== "archived" ? (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => {
                                            if (currentAsset.lifecycleStatus === "attached") {
                                              setTargetAssetToArchive(currentAsset.id);
                                              setConfirmArchiveOpen(true);
                                            } else {
                                              transitionLifecycle(currentAsset.id, "archived", moduleId);
                                            }
                                          }}
                                          className="text-xs h-8 gap-1 text-muted-foreground hover:text-destructive"
                                          title="Arsipkan aset ini"
                                        >
                                          <Archive className="h-3 w-3" />
                                          Arsipkan
                                        </Button>
                                      ) : null}
                                    </div>
                                  </div>

                                  <p className="text-[10px] text-muted-foreground italic">
                                    Invarian Non-Destruktif: Mengganti ilustrasi bab akan secara otomatis menandai ilustrasi sebelumnya sebagai <strong>superseded</strong> tanpa menghapus data atau rekam jejaknya.
                                  </p>
                                </div>
                              </div>
                            )}

                            {/* Collapsible Module Asset History */}
                            {moduleAssets.length > 0 ? (
                              <div className="pt-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowAssetHistory(!showAssetHistory)}
                                  className="text-[11px] h-7 px-2 text-primary hover:text-primary/90 hover:bg-primary/10 gap-1 w-full justify-between"
                                >
                                  <span className="flex items-center gap-1.5">
                                    <Archive className="h-3 w-3" />
                                    Riwayat Aset Ilustrasi Modul Ini ({moduleAssets.length} Aset Tersimpan)
                                  </span>
                                  {showAssetHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </Button>

                                {showAssetHistory ? (
                                  <div className="mt-2 space-y-2 max-h-56 overflow-y-auto pr-1">
                                    {moduleAssets.map((ast) => {
                                      const astReview = reviewItems.find((r) => r.asset.id === ast.id)?.review;
                                      return (
                                        <div
                                          key={ast.id}
                                          className="p-2 rounded-lg bg-background border flex items-center justify-between gap-2 text-xs"
                                        >
                                          <div
                                            className="flex items-center gap-2 min-w-0 cursor-pointer"
                                            onClick={() => selectAssetForReview(ast.id)}
                                          >
                                            <img
                                              src={ast.publicUrl}
                                              alt={ast.pedagogicalMetadata?.title || "Thumbnail"}
                                              className="h-10 w-10 object-cover rounded border shrink-0"
                                            />
                                            <div className="min-w-0">
                                              <p className="font-semibold truncate text-[11px]">
                                                {ast.pedagogicalMetadata?.title || "Ilustrasi Aset"}
                                              </p>
                                              <p className="text-[10px] text-muted-foreground font-mono truncate">
                                                SHA-256: {ast.sha256Hash.slice(0, 12)}...
                                              </p>
                                              {ast.attachedSectionId ? (
                                                <p className="text-[10px] text-emerald-600">
                                                  Bab: {sections.find((s) => s.id === ast.attachedSectionId)?.judul || ast.attachedSectionId}
                                                </p>
                                              ) : null}
                                            </div>
                                          </div>
                                          <div className="flex items-center gap-1.5 shrink-0">
                                            {astReview ? (
                                              <Badge
                                                variant="outline"
                                                className={`text-[8px] ${
                                                  astReview.reviewStatus === "approved_for_use"
                                                    ? "border-emerald-400 text-emerald-700 bg-emerald-50"
                                                    : astReview.reviewStatus === "rejected"
                                                    ? "border-rose-400 text-rose-700 bg-rose-50"
                                                    : "border-amber-400 text-amber-700 bg-amber-50"
                                                }`}
                                              >
                                                {astReview.reviewStatus === "approved_for_use"
                                                  ? "DISETUJUI"
                                                  : astReview.reviewStatus === "rejected"
                                                  ? "DITOLAK"
                                                  : "PENDING"}
                                              </Badge>
                                            ) : null}

                                            <Badge
                                              variant={
                                                ast.lifecycleStatus === "attached"
                                                  ? "default"
                                                  : ast.lifecycleStatus === "superseded"
                                                  ? "outline"
                                                  : "secondary"
                                              }
                                              className="text-[9px]"
                                            >
                                              {ast.lifecycleStatus.toUpperCase()}
                                            </Badge>
                                            {ast.lifecycleStatus !== "archived" ? (
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                                onClick={() => transitionLifecycle(ast.id, "archived", moduleId)}
                                                title="Arsipkan Aset"
                                              >
                                                <Archive className="h-3 w-3" />
                                              </Button>
                                            ) : null}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}
                          </div>

                          {/* CONFIRMATION DIALOG: REPLACE ACTIVE ILLUSTRATION */}
                          <AlertDialog open={confirmReplaceOpen} onOpenChange={setConfirmReplaceOpen}>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center gap-2">
                                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                                  Ganti Ilustrasi Aktif Bab Ini?
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-xs space-y-2">
                                  <p>
                                    Bab yang Anda pilih sudah memiliki ilustrasi aktif sebelumnya.
                                  </p>
                                  <p className="p-2 rounded bg-muted/30 font-medium text-foreground">
                                    Ilustrasi sebelumnya akan secara otomatis berstatus <strong>superseded</strong> dan tetap tersimpan aman di riwayat modul. Tidak ada gambar atau data rekam jejak yang akan terhapus.
                                  </p>
                                  <p>
                                    Apakah Anda yakin ingin mengganti ilustrasi aktif bab tersebut dengan aset ini?
                                  </p>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setTargetSectionToAttach(null)}>
                                  Batal
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={async () => {
                                    if (targetSectionToAttach && currentAsset) {
                                      const updated = await attachAsset(
                                        currentAsset.id,
                                        moduleId,
                                        targetSectionToAttach
                                      );
                                      if (updated && onSectionUpdated) {
                                        onSectionUpdated(targetSectionToAttach, updated.publicUrl);
                                      }
                                      setTargetSectionToAttach(null);
                                    }
                                  }}
                                  className="bg-primary"
                                >
                                  Lanjutkan & Ganti Ilustrasi
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>

                          {/* CONFIRMATION DIALOG: ARCHIVE ATTACHED ILLUSTRATION */}
                          <AlertDialog open={confirmArchiveOpen} onOpenChange={setConfirmArchiveOpen}>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center gap-2">
                                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                                  Arsipkan Ilustrasi yang Sedang Terpaut?
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-xs space-y-2">
                                  <p>
                                    Aset ilustrasi ini sedang aktif terpaut di bab modul ajar.
                                  </p>
                                  <p className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-800">
                                    Mengarsipkan aset ini akan secara otomatis melepas tautannya dari bab modul ajar terkait.
                                  </p>
                                  <p>
                                    Aset ini akan tetap tersimpan di arsip dan dapat ditinjau kembali di kemudian hari.
                                  </p>
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel onClick={() => setTargetAssetToArchive(null)}>
                                  Batal
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={async () => {
                                    if (targetAssetToArchive) {
                                      const ast = moduleAssets.find((a) => a.id === targetAssetToArchive);
                                      const secId = ast?.attachedSectionId;
                                      await transitionLifecycle(targetAssetToArchive, "archived", moduleId);
                                      if (secId && onSectionUpdated) {
                                        onSectionUpdated(secId, undefined);
                                      }
                                      setTargetAssetToArchive(null);
                                    }
                                  }}
                                  className="bg-destructive hover:bg-destructive/90"
                                >
                                  Arsipkan & Lepas Tautan
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      ) : null}

                      {generationResult.status === "failed" ? (
                        <div className="space-y-2.5">
                          <Alert variant="destructive" className="py-2.5">
                            <AlertCircle className="h-4 w-4" />
                            <AlertTitle className="text-xs font-semibold">
                              {generationResult.error?.code || "GENERATION_FAILED"}
                            </AlertTitle>
                            <AlertDescription className="text-xs mt-1">
                              {generationResult.error?.message || "Provider tidak dapat menghasilkan gambar untuk permintaan ini."}
                            </AlertDescription>
                          </Alert>
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>Kebijakan Non-Fallback: Sistem tidak akan menampilkan gambar tiruan atau mock SVG.</span>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => generateIllustration(true)}
                              disabled={generating}
                              className="gap-1.5 text-xs"
                            >
                              <RefreshCw className={`h-3.5 w-3.5 ${generating ? "animate-spin" : ""}`} />
                              Coba Lagi
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {showSpecPreview ? (
                    <pre className="mt-2 p-3 rounded-lg bg-slate-950 text-slate-100 text-[10px] font-mono overflow-x-auto max-h-60 border">
                      {JSON.stringify(specification, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                  <Lock className="mx-auto h-6 w-6 text-muted-foreground/60 mb-2" />
                  <p className="font-medium text-foreground">Otorisasi Generasi Terkunci</p>
                  <p className="mt-1">
                    Harap setujui rencana pada Langkah 4 terlebih dahulu agar spesifikasi otorisasi generasi dapat diterbitkan.
                  </p>
                  <Button
                    disabled
                    variant="outline"
                    size="sm"
                    className="mt-3 cursor-not-allowed opacity-60 text-xs"
                  >
                    Generate Gambar Nyata (Terkunci)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

// ==============================================================================
// 2. PRESENTATION (PPT) PLANNING PANEL
// ==============================================================================

export interface PresentationPlanningPanelProps {
  moduleId: string;
  moduleTitle?: string;
}

export function PresentationPlanningPanel({
  moduleId,
  moduleTitle,
}: PresentationPlanningPanelProps) {
  const {
    plan,
    versions,
    loading,
    saving,
    approving,
    preparedPresentationRequest,
    preparingPresentationRequest,
    generatedPresentationContent,
    generatingPresentationContent,
    presentationGenerationError,
    availableStyles,
    initPlan,
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
    preparePresentationRequest,
    generatePresentationContent,
    resetPresentationContent,
    presentationArtifact,
    renderingPptx,
    pptxRenderError,
    renderStage,
    renderPresentationPptx,
    loadPresentationArtifact,
    presentationReview,
    reviewingPresentation,
    presentationReviewError,
    loadPresentationReview,
    startPresentationReview,
    approvePresentation,
    rejectPresentation,
    updatePresentationReviewNotes,
    presentationQualityEvaluation,
    evaluatingPresentationQuality,
    presentationQualityError,
    loadPresentationQualityEvaluation,
    evaluatePresentationQuality,
    downloadApprovedPresentationPptx,
  } = useGenerationPlan({
    moduleId,
    targetType: "presentation",
  });

  const [formOutline, setFormOutline] = useState<PresentationOutline | null>(null);
  const [specification, setSpecification] = useState<GenerationSpecification | null>(null);
  const [showSpecPreview, setShowSpecPreview] = useState(false);
  const [showBlueprintPreview, setShowBlueprintPreview] = useState(false);
  const [showContentJsonPreview, setShowContentJsonPreview] = useState(false);
  const [selectedContentSlideOrder, setSelectedContentSlideOrder] = useState<number>(1);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [teacherReviewNotes, setTeacherReviewNotes] = useState<string>("");

  useEffect(() => {
    if (generatedPresentationContent) {
      const resultId = (generatedPresentationContent as any).id || generatedPresentationContent.presentationId;
      if (resultId) {
        void loadPresentationReview(resultId);
      }
    }
  }, [generatedPresentationContent, loadPresentationReview]);

  useEffect(() => {
    if (presentationArtifact?.id) {
      void loadPresentationQualityEvaluation(presentationArtifact.id);
    }
  }, [presentationArtifact?.id, loadPresentationQualityEvaluation]);

  useEffect(() => {
    if (presentationReview?.teacherNotes) {
      setTeacherReviewNotes(presentationReview.teacherNotes);
    }
  }, [presentationReview?.teacherNotes]);

  // PPT-1A presentation parameters
  const [aspectRatio, setAspectRatio] = useState<PresentationAspectRatio>("16:9");
  const [contentDensity, setContentDensity] = useState<PresentationContentDensity>("balanced");
  const [language, setLanguage] = useState<"id" | "en">("id");
  const [includeSpeakerNotes, setIncludeSpeakerNotes] = useState<boolean>(true);
  const [footerPolicy, setFooterPolicy] = useState<"standard" | "minimal" | "none">("standard");

  const handleDuplicateSlide = (slideId: string) => {
    if (!formOutline) return;
    const slideIndex = formOutline.slides.findIndex((s) => s.id === slideId);
    if (slideIndex === -1) return;
    const sourceSlide = formOutline.slides[slideIndex];
    const newSlide: PresentationSlide = {
      ...sourceSlide,
      id: `slide_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      slideTitle: `${sourceSlide.slideTitle} (Salinan)`,
      slideOrder: slideIndex + 2,
    };
    const nextSlides = [...formOutline.slides];
    nextSlides.splice(slideIndex + 1, 0, newSlide);
    const reindexed = nextSlides.map((s, idx) => ({ ...s, slideOrder: idx + 1 }));
    setFormOutline({
      ...formOutline,
      intendedSlideCount: reindexed.length,
      slides: reindexed,
    });
    setActiveSlideIndex(slideIndex + 1);
    toast.success(`Slide "${sourceSlide.slideTitle}" berhasil diduplikasi.`);
  };

  useEffect(() => {
    if (plan && plan.outline) {
      setFormOutline(plan.outline as PresentationOutline);
    }
  }, [plan]);

  useEffect(() => {
    if (plan?.status === "approved") {
      void fetchSpecification().then((spec) => {
        if (spec) setSpecification(spec);
      });
    } else {
      setSpecification(null);
    }
  }, [plan?.status, plan?.currentVersion, fetchSpecification]);

  const handleSaveOutline = async () => {
    if (!formOutline) return;
    await saveOutlineEdits(formOutline, "Pembaruan outline presentasi oleh guru");
  };

  const handleStyleChange = async (styleId: string) => {
    await selectStyle(styleId);
  };

  const isApproved = plan?.status === "approved";
  const selectedStyleId = plan?.selectedStyleId || "style_ppt_edu_classroom";

  const handleAddSlide = () => {
    if (!formOutline) return;
    const newSlideOrder = formOutline.slides.length + 1;
    const newSlide: PresentationSlide = {
      id: `slide_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      slideOrder: newSlideOrder,
      slideTitle: `Slide Baru ${newSlideOrder}`,
      purpose: "Menjelaskan konsep tambahan",
      keyPoints: ["Poin bahasan pertama", "Poin bahasan kedua"],
      contentBlocks: ["Penjelasan materi terperinci."],
      visualDirection: "Diagram alir atau bagan perbandingan",
      sourceReferences: [`modul:${moduleId}`],
      evidenceReferences: ["ev_modul_grounding"],
    };
    const updatedSlides = [...formOutline.slides, newSlide];
    setFormOutline({
      ...formOutline,
      intendedSlideCount: updatedSlides.length,
      slides: updatedSlides,
    });
    setActiveSlideIndex(updatedSlides.length - 1);
  };

  const handleRemoveSlide = (slideId: string) => {
    if (!formOutline || formOutline.slides.length <= 1) return;
    const remaining = formOutline.slides.filter((s) => s.id !== slideId);
    const reindexed = remaining.map((s, idx) => ({ ...s, slideOrder: idx + 1 }));
    setFormOutline({
      ...formOutline,
      intendedSlideCount: reindexed.length,
      slides: reindexed,
    });
    if (activeSlideIndex >= reindexed.length) {
      setActiveSlideIndex(Math.max(0, reindexed.length - 1));
    }
  };

  const handleMoveSlide = (currentIndex: number, direction: "up" | "down") => {
    if (!formOutline) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= formOutline.slides.length) return;

    const newSlides = [...formOutline.slides];
    const temp = newSlides[currentIndex];
    newSlides[currentIndex] = newSlides[targetIndex];
    newSlides[targetIndex] = temp;

    const reindexed = newSlides.map((s, idx) => ({ ...s, slideOrder: idx + 1 }));
    setFormOutline({
      ...formOutline,
      slides: reindexed,
    });
    setActiveSlideIndex(targetIndex);
  };

  const currentSlide = formOutline?.slides[activeSlideIndex];

  return (
    <div className="grid gap-6">
      {/* HEADER & LIFECYCLE PROGRESS */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-accent/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-primary/30 text-primary font-mono text-xs">
                  GEN-0
                </Badge>
                <CardTitle className="text-lg font-display text-navy">
                  Perencanaan Slide Presentasi (PPT) Terstruktur
                </CardTitle>
              </div>
              <CardDescription className="mt-1 text-xs">
                Siklus 5 Langkah: Draf Slide → Tinjau/Edit Struktur → Pilih Gaya Presentasi → Persetujuan Rencana → Otorisasi Generasi
              </CardDescription>
            </div>

            {plan ? (
              <div className="flex items-center gap-2">
                <Badge variant={isApproved ? "default" : "secondary"} className="gap-1">
                  {isApproved ? <CheckCircle2 className="h-3 w-3" /> : <SlidersHorizontal className="h-3 w-3" />}
                  {isApproved ? `Disetujui (v${plan.approvedVersion})` : `Draf v${plan.currentVersion}`}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {formOutline?.slides.length || 0} slide • {versions.length} versi
                </span>
              </div>
            ) : null}
          </div>
        </CardHeader>

        {!plan ? (
          <CardContent className="pt-2">
            <div className="rounded-xl border border-dashed border-primary/30 bg-background/50 p-6 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-primary mb-2" />
              <h4 className="font-semibold text-sm text-foreground">
                Belum ada rencana presentasi terstruktur untuk modul ini
              </h4>
              <p className="mt-1 text-xs text-muted-foreground max-w-md mx-auto">
                Ekstrak alur pembelajaran modul ke dalam slide terstruktur yang dapat ditinjau, diedit urutannya, dan dipilih gaya visualnya sebelum diunduh.
              </p>
              <Button
                className="mt-4 gap-2"
                onClick={() => initPlan()}
                disabled={loading || saving}
              >
                <Plus className="h-4 w-4" />
                {saving ? "Menyusun Draf..." : "Mulai Rencanakan Slide PPT (GEN-0)"}
              </Button>
            </div>
          </CardContent>
        ) : null}
      </Card>

      {plan && formOutline ? (
        <div className="grid gap-6">
          {/* STEP 1: PROVENANCE & GLOBAL METADATA */}
          <Card>
            <CardHeader className="py-3 px-4 bg-muted/20 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    1
                  </span>
                  <h4 className="text-sm font-semibold text-foreground">
                    Metadata Global & Alur Pembelajaran
                  </h4>
                </div>
                <Badge variant="outline" className="text-xs">
                  {formOutline.slides.length} Slide Terdaftar
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4 grid gap-3 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Judul Presentasi</Label>
                  <Input
                    value={formOutline.title}
                    onChange={(e) => setFormOutline({ ...formOutline, title: e.target.value })}
                    className="text-xs h-8"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Target Siswa</Label>
                  <Input
                    value={formOutline.targetAudience}
                    onChange={(e) => setFormOutline({ ...formOutline, targetAudience: e.target.value })}
                    className="text-xs h-8"
                  />
                </div>
                <div className="grid gap-1">
                  <Label className="text-xs text-muted-foreground">Arah Visual Global</Label>
                  <Input
                    value={formOutline.globalVisualDirection}
                    onChange={(e) =>
                      setFormOutline({ ...formOutline, globalVisualDirection: e.target.value })
                    }
                    className="text-xs h-8"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* STEP 2: SLIDE REVIEW, EDIT, & REORDER */}
          <Card>
            <CardHeader className="py-3 px-4 bg-muted/20 border-b">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    2
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Tinjau, Edit & Urutkan Slide
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Kelola setiap slide presentasi secara spesifik.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddSlide}
                    className="text-xs gap-1 h-8"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Tambah Slide
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveOutline}
                    disabled={saving}
                    className="text-xs gap-1 h-8"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {saving ? "Menyimpan..." : "Simpan Perubahan Slide"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* SLIDE LIST THUMBNAILS (NAV) */}
              <div className="md:col-span-4 space-y-2 border-r pr-2 max-h-[500px] overflow-y-auto">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Daftar Slide</p>
                {formOutline.slides.map((s, idx) => (
                  <div
                    key={s.id}
                    onClick={() => setActiveSlideIndex(idx)}
                    className={`cursor-pointer rounded-lg border p-2.5 transition-all text-xs flex items-center justify-between gap-2 ${
                      activeSlideIndex === idx
                        ? "border-primary bg-primary/10 font-medium"
                        : "border-border/60 hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-mono text-[11px] font-bold text-muted-foreground w-4 shrink-0">
                        {idx + 1}.
                      </span>
                      <span className="truncate">{s.slideTitle || "Tanpa Judul"}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        disabled={idx === 0}
                        onClick={() => handleMoveSlide(idx, "up")}
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                        title="Pindah ke atas"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        disabled={idx === formOutline.slides.length - 1}
                        onClick={() => handleMoveSlide(idx, "down")}
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                        title="Pindah ke bawah"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDuplicateSlide(s.id)}
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                        title="Duplikat slide"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      <button
                        disabled={formOutline.slides.length <= 1}
                        onClick={() => handleRemoveSlide(s.id)}
                        className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive disabled:opacity-30"
                        title="Hapus slide"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* ACTIVE SLIDE EDITOR */}
              <div className="md:col-span-8 space-y-4">
                {currentSlide ? (
                  <div className="grid gap-3 p-4 rounded-xl border bg-muted/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-xs">
                          Slide {activeSlideIndex + 1} dari {formOutline.slides.length}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDuplicateSlide(currentSlide.id)}
                          className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                        >
                          <Copy className="h-3 w-3" />
                          Duplikat Slide
                        </Button>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        ID: {currentSlide.id}
                      </span>
                    </div>

                    <div className="grid gap-1.5">
                      <Label className="text-xs font-medium">Judul Slide</Label>
                      <Input
                        value={currentSlide.slideTitle}
                        onChange={(e) => {
                          const updated = [...formOutline.slides];
                          updated[activeSlideIndex] = {
                            ...updated[activeSlideIndex],
                            slideTitle: e.target.value,
                          };
                          setFormOutline({ ...formOutline, slides: updated });
                        }}
                        className="text-sm font-semibold"
                        placeholder="Judul bahasan slide..."
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <Label className="text-xs font-medium">Tujuan / Fokus Slide</Label>
                      <Input
                        value={currentSlide.purpose}
                        onChange={(e) => {
                          const updated = [...formOutline.slides];
                          updated[activeSlideIndex] = {
                            ...updated[activeSlideIndex],
                            purpose: e.target.value,
                          };
                          setFormOutline({ ...formOutline, slides: updated });
                        }}
                        className="text-xs"
                        placeholder="Tujuan spesifik slide ini..."
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <Label className="text-xs font-medium">
                        Poin-Poin Inti (1 baris per poin)
                      </Label>
                      <Textarea
                        value={currentSlide.keyPoints?.join("\n") || ""}
                        onChange={(e) => {
                          const points = e.target.value
                            .split("\n")
                            .map((p) => p.trim())
                            .filter(Boolean);
                          const updated = [...formOutline.slides];
                          updated[activeSlideIndex] = {
                            ...updated[activeSlideIndex],
                            keyPoints: points.length > 0 ? points : [e.target.value],
                          };
                          setFormOutline({ ...formOutline, slides: updated });
                        }}
                        rows={3}
                        className="text-xs font-mono"
                        placeholder="Poin bahasan 1&#10;Poin bahasan 2&#10;Poin bahasan 3"
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <Label className="text-xs font-medium">
                        Arah Visual / Catatan Desain Slide
                      </Label>
                      <Input
                        value={currentSlide.visualDirection}
                        onChange={(e) => {
                          const updated = [...formOutline.slides];
                          updated[activeSlideIndex] = {
                            ...updated[activeSlideIndex],
                            visualDirection: e.target.value,
                          };
                          setFormOutline({ ...formOutline, slides: updated });
                        }}
                        className="text-xs"
                        placeholder="Contoh: Infografik dengan 3 pilar berdampingan"
                      />
                    </div>

                    <div className="grid gap-1.5">
                      <Label className="text-xs font-medium">
                        Catatan Presenter / Guru (Speaker Notes)
                      </Label>
                      <Input
                        value={currentSlide.speakerNotesDirection || ""}
                        onChange={(e) => {
                          const updated = [...formOutline.slides];
                          updated[activeSlideIndex] = {
                            ...updated[activeSlideIndex],
                            speakerNotesDirection: e.target.value,
                          };
                          setFormOutline({ ...formOutline, slides: updated });
                        }}
                        className="text-xs text-muted-foreground"
                        placeholder="Panduan penyampaian guru..."
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground p-4 text-center">
                    Pilih slide dari daftar di sebelah kiri untuk mengedit.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* STEP 3: PRESENTATION STYLE PICKER */}
          <Card>
            <CardHeader className="py-3 px-4 bg-muted/20 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    3
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Pilih Gaya Desain Slide (Template Preset)
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Pilih salah satu dari 6 preset palet & tipografi presentasi edukatif.
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-xs font-medium">
                  {PRESENTATION_STYLES_CATALOG.find((s) => s.id === selectedStyleId)?.name || "Preset Terpilih"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {PRESENTATION_STYLES_CATALOG.map((style) => {
                  const isSelected = selectedStyleId === style.id;
                  return (
                    <button
                      type="button"
                      key={style.id}
                      aria-pressed={isSelected}
                      disabled={loading || saving}
                      onClick={() => handleStyleChange(style.id)}
                      className={`cursor-pointer rounded-xl border p-3.5 transition-all text-left relative flex flex-col justify-between ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                          : "border-border/70 hover:border-primary/40 hover:bg-muted/30"
                      } ${loading || saving ? "opacity-60 cursor-not-allowed" : ""}`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <h5 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
                            <Palette className="h-3.5 w-3.5 text-primary" />
                            {style.name}
                          </h5>
                          {isSelected ? (
                            <Badge className="h-5 px-1.5 text-[10px] bg-primary">Terpilih</Badge>
                          ) : null}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                          {style.description}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-1 mt-2">
                        {style.layoutRules.slice(0, 2).map((rule, idx) => (
                          <span
                            key={idx}
                            className="inline-block rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            {rule}
                          </span>
                        ))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* STEP 4: PRESENTATION APPROVAL GATE */}
          <Card className={isApproved ? "border-emerald-500/30 bg-emerald-50/10" : ""}>
            <CardHeader className="py-3 px-4 bg-muted/20 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      isApproved
                        ? "bg-emerald-600 text-white"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    4
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Persetujuan Rencana Slide PPT (Approval Gate)
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Guru memeriksa dan menyetujui seluruh outline slide sebelum otorisasi berkas PPTX diterbitkan.
                    </p>
                  </div>
                </div>
                {isApproved ? (
                  <Badge className="bg-emerald-600 text-white text-xs gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Telah Disetujui
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">
                    Perlu Persetujuan
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4">
              {isApproved ? (
                <Alert className="border-emerald-500/30 bg-emerald-500/5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <AlertTitle className="text-sm font-semibold text-emerald-800">
                    Rencana Slide Disetujui (Versi {plan.approvedVersion})
                  </AlertTitle>
                  <AlertDescription className="text-xs text-emerald-700 mt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span>
                      Rencana slide PPT ({formOutline.slides.length} slide) telah divalidasi. Mengubah urutan slide atau gaya presentasi akan otomatis mencabut persetujuan ini.
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => revokeApproval()}
                      disabled={approving}
                      className="border-emerald-400 text-emerald-800 hover:bg-emerald-100/50 shrink-0 gap-1"
                    >
                      <Unlock className="h-3.5 w-3.5" />
                      Cabut Persetujuan
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border bg-muted/10">
                  <div className="space-y-1">
                    <h5 className="font-semibold text-sm text-foreground">
                      Setujui rancangan alur slide presentasi ini?
                    </h5>
                    <p className="text-xs text-muted-foreground">
                      Pastikan urutan alur materi dan poin inti slide sudah lengkap dan terverifikasi.
                    </p>
                  </div>
                  <Button
                    onClick={() => approvePlan()}
                    disabled={approving || saving}
                    className="gap-2 shrink-0 bg-primary"
                  >
                    <ShieldCheck className="h-4 w-4" />
                    {approving ? "Menyetujui..." : "Setujui Rencana Slide PPT"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* STEP 5: PPT GENERATION CONTRACT & SPEC PREVIEW (PPT-1A) */}
          <Card className={isApproved ? "border-primary/40 shadow-sm" : "opacity-80"}>
            <CardHeader className="py-3 px-4 bg-muted/20 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                      isApproved
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    5
                  </span>
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Spesifikasi Generasi Presentasi (PPT-1A)
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Kontrak generasi presentasi terstruktur dan perancangan blueprint slide.
                    </p>
                  </div>
                </div>
                {isApproved ? (
                  <Badge className="bg-primary text-primary-foreground text-xs gap-1">
                    <Lock className="h-3 w-3" />
                    {preparedPresentationRequest ? "Spesifikasi Disiapkan (PPT-1A)" : "Rencana Disetujui"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-xs">
                    Terkunci
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-4 grid gap-4">
              {isApproved && specification ? (
                <div className="grid gap-4">
                  {/* SPECIFICATION BASE SUMMARY */}
                  <div className="rounded-xl border p-4 bg-muted/10 grid gap-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-muted-foreground">ID Otorisasi:</span>
                      <span className="font-mono font-semibold text-foreground">
                        {specification.authorizationId}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Gaya Presentasi Terpilih:</span>
                      <span className="font-medium text-foreground">
                        {specification.styleSnapshot.styleName} (v{specification.styleSnapshot.styleVersion})
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Total Slide Disetujui:</span>
                      <span className="font-medium text-foreground">
                        {specification.outlineSnapshot.slides?.length || formOutline.slides.length} Slide
                      </span>
                    </div>
                  </div>

                  {/* PPT-1A PRESENTATION PARAMETERS CONFIGURATION */}
                  <div className="rounded-xl border p-4 bg-background grid gap-3 text-xs">
                    <div className="flex items-center justify-between">
                      <h5 className="font-semibold text-foreground flex items-center gap-1.5">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
                        Parameter Generasi Presentasi (PPT-1A)
                      </h5>
                      <span className="text-[11px] text-muted-foreground">
                        Spesifikasi Teknis Slide
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                      <div className="grid gap-1">
                        <Label className="text-[11px] text-muted-foreground">Aspek Rasio Slide</Label>
                        <select
                          value={aspectRatio}
                          onChange={(e) => setAspectRatio(e.target.value as PresentationAspectRatio)}
                          className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="16:9">16:9 Widescreen (1920x1080)</option>
                          <option value="4:3">4:3 Standard (1024x768)</option>
                        </select>
                      </div>

                      <div className="grid gap-1">
                        <Label className="text-[11px] text-muted-foreground">Kerapatan Konten</Label>
                        <select
                          value={contentDensity}
                          onChange={(e) => setContentDensity(e.target.value as PresentationContentDensity)}
                          className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="balanced">Seimbang (Balanced)</option>
                          <option value="minimal">Minimalis (Ringkas & Poin)</option>
                          <option value="detailed">Mendalam (Detailed / Rinci)</option>
                        </select>
                      </div>

                      <div className="grid gap-1">
                        <Label className="text-[11px] text-muted-foreground">Bahasa Materi</Label>
                        <select
                          value={language}
                          onChange={(e) => setLanguage(e.target.value as "id" | "en")}
                          className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="id">Bahasa Indonesia (id)</option>
                          <option value="en">English (en)</option>
                        </select>
                      </div>

                      <div className="grid gap-1">
                        <Label className="text-[11px] text-muted-foreground">Catatan Pembicara</Label>
                        <select
                          value={includeSpeakerNotes ? "yes" : "no"}
                          onChange={(e) => setIncludeSpeakerNotes(e.target.value === "yes")}
                          className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="yes">Sertakan Catatan Pembicara</option>
                          <option value="no">Tanpa Catatan Pembicara</option>
                        </select>
                      </div>

                      <div className="grid gap-1">
                        <Label className="text-[11px] text-muted-foreground">Kebijakan Footer</Label>
                        <select
                          value={footerPolicy}
                          onChange={(e) => setFooterPolicy(e.target.value as "standard" | "minimal" | "none")}
                          className="h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                        >
                          <option value="standard">Standard (Judul & Nomor Slide)</option>
                          <option value="minimal">Minimal (Hanya Nomor Slide)</option>
                          <option value="none">None (Tanpa Footer)</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* ACTION CONTROLS */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() =>
                          preparePresentationRequest({
                            aspectRatio,
                            contentDensity,
                            language,
                            includeSpeakerNotes,
                            footerPolicy,
                          })
                        }
                        disabled={preparingPresentationRequest}
                        className="text-xs gap-1.5 bg-primary text-primary-foreground shadow-sm"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        {preparingPresentationRequest
                          ? "Memvalidasi Kontrak..."
                          : "Siapkan Spesifikasi PPT (PPT-1A)"}
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSpecPreview(!showSpecPreview)}
                        className="text-xs gap-1.5"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {showSpecPreview ? "Tutup Spek Dasar" : "Inspeksi Spek Dasar (JSON)"}
                      </Button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => generatePresentationContent()}
                        disabled={generatingPresentationContent || !preparedPresentationRequest}
                        variant="default"
                        size="sm"
                        className="text-xs gap-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-sm"
                      >
                        {generatingPresentationContent ? (
                          <>
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Mengenerate Konten Slide (PPT-1B)...
                          </>
                        ) : (
                          <>
                            <Zap className="h-3.5 w-3.5 text-amber-300" />
                            {generatedPresentationContent ? "Regenerasi Konten Slide (PPT-1B)" : "Generate Konten Presentasi (PPT-1B)"}
                          </>
                        )}
                      </Button>

                      {presentationArtifact ? (
                        <div className="flex items-center gap-2">
                          <Button
                            onClick={() => {
                              void downloadApprovedPresentationPptx(presentationArtifact.id);
                            }}
                            disabled={presentationQualityEvaluation?.status !== "passed"}
                            variant="default"
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1.5 shadow-sm disabled:opacity-50"
                            title={
                              presentationQualityEvaluation?.status === "passed"
                                ? "Unduh berkas Microsoft PowerPoint (.pptx) asli (Telah Lolos Quality Gate)"
                                : "Unduh terkunci: Selesaikan peninjauan guru dan validasi Quality Gate (PPT-1F) terlebih dahulu"
                            }
                          >
                            <Download className="h-3.5 w-3.5" />
                            Unduh File PPTX Nyata
                            {presentationQualityEvaluation?.status === "passed" ? (
                              <Badge variant="outline" className="ml-1 text-[10px] bg-emerald-700/40 text-emerald-100 border-emerald-400/40">
                                PPTX Ready
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="ml-1 text-[10px] bg-amber-700/40 text-amber-100 border-amber-400/40">
                                Perlu Quality Gate
                              </Badge>
                            )}
                          </Button>
                          <Button
                            disabled={renderingPptx}
                            onClick={() => {
                              if (generatedPresentationContent) {
                                void renderPresentationPptx(generatedPresentationContent.presentationId, true);
                              }
                            }}
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1"
                            title="Render ulang dokumen PPTX"
                          >
                            <RefreshCw className={`h-3 w-3 ${renderingPptx ? "animate-spin" : ""}`} />
                            Render Ulang
                          </Button>
                        </div>
                      ) : (
                        <Button
                          disabled={!generatedPresentationContent || renderingPptx}
                          onClick={() => {
                            if (generatedPresentationContent) {
                              void renderPresentationPptx(generatedPresentationContent.presentationId);
                            }
                          }}
                          variant="secondary"
                          size="sm"
                          className="text-xs gap-1.5 border border-indigo-200 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-900"
                          title="Render dokumen PowerPoint (.pptx) asli dari paket konten PPT-1B"
                        >
                          {renderingPptx ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-600" />
                              {renderStage === "validating"
                                ? "Memvalidasi OOXML..."
                                : renderStage === "storing"
                                ? "Menyimpan File..."
                                : "Merender PPTX..."}
                            </>
                          ) : (
                            <>
                              <FileCheck2 className="h-3.5 w-3.5 text-indigo-600" />
                              Buat Dokumen PPTX (PPT-1C)
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* ERROR ALERT IF PPTX RENDERING FAILED */}
                  {pptxRenderError ? (
                    <Alert variant="destructive" className="py-2.5">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle className="text-xs font-semibold">Gagal Merender PPTX (PPT-1C)</AlertTitle>
                      <AlertDescription className="text-[11px] mt-1">
                        {pptxRenderError}
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {/* ERROR ALERT IF GENERATION FAILED */}
                  {presentationGenerationError ? (
                    <Alert variant="destructive" className="py-2.5">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle className="text-xs font-semibold">Generasi Konten PPT-1B Gagal</AlertTitle>
                      <AlertDescription className="text-[11px] mt-1">
                        {presentationGenerationError}
                      </AlertDescription>
                    </Alert>
                  ) : null}

                  {/* PREPARED PPT-1A REQUEST DETAILS */}
                  {preparedPresentationRequest ? (
                    <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/10 p-4 grid gap-3 text-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                          <div>
                            <span className="font-semibold text-emerald-800 text-xs">
                              Kontrak Generasi Presentasi Terkonfirmasi (PPT-1A)
                            </span>
                            <p className="text-[11px] text-muted-foreground">
                              Spesifikasi kanonikal siap diteruskan ke pipeline generasi konten PPT-1B.
                            </p>
                          </div>
                        </div>
                        <Badge className="bg-emerald-600 text-white text-[11px]">
                          Status: {preparedPresentationRequest.status}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-emerald-200/40 text-[11px]">
                        <div>
                          <span className="text-muted-foreground block">Request ID:</span>
                          <span className="font-mono font-medium truncate block" title={preparedPresentationRequest.requestId}>
                            {preparedPresentationRequest.requestId}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Rasio & Ukuran:</span>
                          <span className="font-medium">
                            {preparedPresentationRequest.parameters.aspectRatio} ({preparedPresentationRequest.parameters.slideSize.width}x{preparedPresentationRequest.parameters.slideSize.height})
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Total Slide Blueprint:</span>
                          <span className="font-medium">
                            {preparedPresentationRequest.blueprint.totalSlides} Slide
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Kerapatan Konten:</span>
                          <span className="font-medium capitalize">
                            {preparedPresentationRequest.parameters.contentDensity}
                          </span>
                        </div>
                      </div>

                      {/* BLUEPRINT PEDAGOGICAL BREAKDOWN */}
                      <div className="pt-2 border-t border-emerald-200/40">
                        <span className="text-muted-foreground text-[11px] block mb-1.5 font-medium">
                          Struktur Pedagogis Slide (Inferred):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {preparedPresentationRequest.blueprint.slides.map((s) => (
                            <Badge
                              key={s.slideId}
                              variant="outline"
                              className="text-[10px] bg-background border-border/80 text-foreground"
                            >
                              Slide {s.slideOrder}: {s.pedagogicalType.replace("_", " ")}
                              {s.visualRequirement.requiresGeneratedIllustration ? " • 🖼️ Baru" : ""}
                              {s.visualRequirement.type === "existing_illustration" ? " • 🎨 Aset" : ""}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowBlueprintPreview(!showBlueprintPreview)}
                          className="text-xs h-7 gap-1"
                        >
                          <Eye className="h-3 w-3" />
                          {showBlueprintPreview ? "Tutup Blueprint" : "Inspeksi Blueprint PPT-1A (JSON)"}
                        </Button>
                      </div>

                      {showBlueprintPreview ? (
                        <pre className="p-3 rounded-lg bg-slate-950 text-slate-100 text-[10px] font-mono overflow-x-auto max-h-60 border">
                          {JSON.stringify(preparedPresentationRequest, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}

                  {/* PPT-1B VALIDATED CONTENT PACKAGE PREVIEW */}
                  {generatedPresentationContent ? (
                    <div className="rounded-xl border border-indigo-500/40 bg-indigo-50/15 p-4 grid gap-4 text-xs">
                      {/* PACKAGE HEADER */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-indigo-200/50">
                        <div className="flex items-start gap-2.5">
                          <div className="p-2 rounded-lg bg-indigo-600 text-white shadow-sm shrink-0">
                            <Sparkles className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-foreground">
                                {generatedPresentationContent.title}
                              </span>
                              <Badge className="bg-indigo-600 text-white text-[10px] uppercase">
                                PPT-1B Terverifikasi
                              </Badge>
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]">
                                {generatedPresentationContent.validationMetadata.semanticEvaluation.decision}
                              </Badge>
                            </div>
                            {generatedPresentationContent.subtitle ? (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {generatedPresentationContent.subtitle}
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 self-end sm:self-auto">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowContentJsonPreview(!showContentJsonPreview)}
                            className="text-xs h-7 gap-1"
                          >
                            <Eye className="h-3 w-3" />
                            {showContentJsonPreview ? "Tutup JSON" : "Inspeksi Konten Terstruktur (JSON)"}
                          </Button>
                        </div>
                      </div>

                      {/* PACKAGE METADATA BAR */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-background/80 p-2.5 rounded-lg border border-border/60">
                        <div>
                          <span className="text-muted-foreground block">Sasaran Audiens:</span>
                          <span className="font-medium text-foreground">
                            {generatedPresentationContent.targetAudience}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Estimasi Durasi:</span>
                          <span className="font-medium text-foreground">
                            {generatedPresentationContent.estimatedDurationMinutes || (generatedPresentationContent.slides.length * 3)} menit
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Gaya & Kerapatan:</span>
                          <span className="font-medium text-foreground capitalize">
                            {generatedPresentationContent.style.name} • {generatedPresentationContent.contentDensity}
                          </span>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">AI Generator:</span>
                          <span className="font-medium font-mono text-[10px] text-muted-foreground">
                            {generatedPresentationContent.generationMetadata.provider} / {generatedPresentationContent.generationMetadata.model}
                          </span>
                        </div>
                      </div>

                      {/* LEARNING OBJECTIVES BANNER */}
                      {generatedPresentationContent.primaryLearningObjectives.length > 0 ? (
                        <div className="p-2.5 rounded-lg bg-emerald-50/50 border border-emerald-200/50 text-[11px]">
                          <span className="font-semibold text-emerald-800 block mb-1">
                            Tujuan Pembelajaran Utama:
                          </span>
                          <ul className="list-disc list-inside space-y-0.5 text-emerald-900">
                            {generatedPresentationContent.primaryLearningObjectives.map((obj, i) => (
                              <li key={i}>{obj}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {/* PPT-1E: TEACHER REVIEW & APPROVAL CARD */}
                      {(() => {
                        const contentResultId =
                          (generatedPresentationContent as any).id ||
                          generatedPresentationContent.presentationId;
                        const reviewStatus = presentationReview?.reviewStatus || "generated";

                        return (
                          <div
                            className={`rounded-xl border p-4 space-y-3 text-xs transition-all ${
                              reviewStatus === "approved"
                                ? "border-emerald-500/40 bg-emerald-50/20"
                                : reviewStatus === "rejected"
                                ? "border-rose-500/40 bg-rose-50/20"
                                : reviewStatus === "superseded"
                                ? "border-amber-500/40 bg-amber-50/20"
                                : "border-indigo-400/40 bg-indigo-50/15"
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-border/60">
                              <div className="flex items-center gap-2">
                                <ShieldCheck
                                  className={`h-4 w-4 shrink-0 ${
                                    reviewStatus === "approved"
                                      ? "text-emerald-600"
                                      : reviewStatus === "rejected"
                                      ? "text-rose-600"
                                      : "text-indigo-600"
                                  }`}
                                />
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-foreground text-xs">
                                      Peninjauan & Persetujuan Guru (PPT-1E)
                                    </span>
                                    {reviewStatus === "approved" ? (
                                      <Badge className="bg-emerald-600 text-white text-[10px] gap-1">
                                        <CheckCircle2 className="h-3 w-3" />
                                        Disetujui Guru (v{presentationReview?.approvedVersion})
                                      </Badge>
                                    ) : reviewStatus === "rejected" ? (
                                      <Badge className="bg-rose-600 text-white text-[10px] gap-1">
                                        <ThumbsDown className="h-3 w-3" />
                                        Ditolak Guru
                                      </Badge>
                                    ) : reviewStatus === "superseded" ? (
                                      <Badge variant="outline" className="text-amber-700 border-amber-300 text-[10px] gap-1">
                                        <AlertTriangle className="h-3 w-3" />
                                        Versi Usang (Superseded)
                                      </Badge>
                                    ) : reviewStatus === "in_review" ? (
                                      <Badge className="bg-blue-600 text-white text-[10px] gap-1">
                                        <Clock className="h-3 w-3" />
                                        Sedang Ditinjau Guru
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-muted-foreground text-[10px]">
                                        Menunggu Peninjauan
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Keputusan otoritatif guru sebelum dokumen presentasi difinalisasi.
                                  </p>
                                </div>
                              </div>

                              {presentationReview?.reviewedAt ? (
                                <span className="text-[10px] text-muted-foreground font-mono self-end sm:self-auto">
                                  Ditinjau: {new Date(presentationReview.reviewedAt).toLocaleString("id-ID")}
                                </span>
                              ) : null}
                            </div>

                            {presentationReviewError ? (
                              <Alert variant="destructive" className="py-2 text-xs">
                                <AlertCircle className="h-3.5 w-3.5" />
                                <AlertDescription>{presentationReviewError}</AlertDescription>
                              </Alert>
                            ) : null}

                            {/* TEACHER REVIEW NOTES & ACTIONS */}
                            <div className="space-y-2">
                              <label className="text-[11px] font-medium text-foreground block">
                                Catatan Evaluasi & Umpan Balik Guru:
                              </label>
                              <textarea
                                value={teacherReviewNotes}
                                onChange={(e) => setTeacherReviewNotes(e.target.value)}
                                disabled={reviewingPresentation || reviewStatus === "approved"}
                                placeholder="Tuliskan catatan evaluasi, poin penguatan materi, atau alasan penolakan jika materi perlu direvisi..."
                                rows={2}
                                className="w-full text-xs rounded-lg border border-border/80 bg-background p-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-70 disabled:bg-muted/30"
                              />

                              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                <div className="flex items-center gap-2">
                                  {reviewStatus !== "approved" ? (
                                    <>
                                      <Button
                                        size="sm"
                                        onClick={() =>
                                          void approvePresentation(
                                            contentResultId,
                                            teacherReviewNotes
                                          )
                                        }
                                        disabled={reviewingPresentation}
                                        className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        {reviewingPresentation ? "Menyimpan..." : "Setujui Presentasi (Approve)"}
                                      </Button>

                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => {
                                          if (!teacherReviewNotes.trim()) {
                                            alert("Harap berikan catatan alasan penolakan pada kolom catatan guru.");
                                            return;
                                          }
                                          void rejectPresentation(
                                            contentResultId,
                                            teacherReviewNotes
                                          );
                                        }}
                                        disabled={reviewingPresentation || !teacherReviewNotes.trim()}
                                        className="h-8 gap-1.5 text-xs text-rose-700 border-rose-300 hover:bg-rose-50"
                                      >
                                        <ThumbsDown className="h-3.5 w-3.5" />
                                        Tolak Presentasi (Reject)
                                      </Button>
                                    </>
                                  ) : (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => void startPresentationReview(contentResultId)}
                                      disabled={reviewingPresentation}
                                      className="h-8 gap-1.5 text-xs text-muted-foreground"
                                    >
                                      <RefreshCw className="h-3.5 w-3.5" />
                                      Buka Ulang Peninjauan
                                    </Button>
                                  )}
                                </div>

                                {reviewStatus !== "approved" ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() =>
                                      void updatePresentationReviewNotes(
                                        contentResultId,
                                        teacherReviewNotes
                                      )
                                    }
                                    disabled={reviewingPresentation}
                                    className="h-8 text-xs text-muted-foreground"
                                  >
                                    Simpan Draf Catatan
                                  </Button>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {/* SLIDES PREVIEW TAB / SELECTOR */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-xs text-foreground">
                            Pratinjau Slide ({generatedPresentationContent.slides.length} Slide):
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            Klik slide untuk meninjau detail konten
                          </span>
                        </div>

                        {/* HORIZONTAL SLIDE SELECTOR */}
                        <div className="flex gap-2 overflow-x-auto pb-1.5 pt-0.5">
                          {generatedPresentationContent.slides.map((sl) => {
                            const isSelected = sl.slideOrder === selectedContentSlideOrder;
                            return (
                              <button
                                key={sl.slideId}
                                type="button"
                                onClick={() => setSelectedContentSlideOrder(sl.slideOrder)}
                                className={`shrink-0 text-left p-2.5 rounded-lg border text-xs transition-all w-44 ${
                                  isSelected
                                    ? "bg-indigo-600 text-white border-indigo-700 shadow-sm ring-2 ring-indigo-400/40"
                                    : "bg-background hover:bg-muted/50 border-border text-foreground"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                                    isSelected ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                                  }`}>
                                    Slide {sl.slideOrder}
                                  </span>
                                  <span className={`text-[9px] uppercase ${isSelected ? "text-indigo-100" : "text-muted-foreground"}`}>
                                    {sl.pedagogicalType.replace("_", " ")}
                                  </span>
                                </div>
                                <p className="font-medium text-[11px] truncate leading-tight">
                                  {sl.title}
                                </p>
                              </button>
                            );
                          })}
                        </div>

                        {/* SELECTED SLIDE CONTENT CARD */}
                        {(() => {
                          const currentSlide = generatedPresentationContent.slides.find(
                            (s) => s.slideOrder === selectedContentSlideOrder
                          ) || generatedPresentationContent.slides[0];

                          if (!currentSlide) return null;

                          return (
                            <div className="p-4 rounded-xl border border-border bg-background shadow-sm space-y-4">
                              {/* SLIDE HEADER */}
                              <div className="flex items-start justify-between gap-3 pb-3 border-b border-border/60">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[10px]">
                                      Slide #{currentSlide.slideOrder}
                                    </Badge>
                                    <Badge variant="outline" className="text-[10px] capitalize">
                                      {currentSlide.pedagogicalType.replace("_", " ")}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                      ID: {currentSlide.slideId}
                                    </span>
                                  </div>
                                  <h4 className="text-base font-bold text-foreground">
                                    {currentSlide.title}
                                  </h4>
                                  {currentSlide.subtitle ? (
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      {currentSlide.subtitle}
                                    </p>
                                  ) : null}

                                  {(currentSlide as any).illustrationReference ? (
                                    <div className="flex items-center gap-1.5 mt-2">
                                      <Palette className="h-3.5 w-3.5 text-indigo-600" />
                                      <span className="text-[11px] text-muted-foreground">Aset Ilustrasi:</span>
                                      <Badge
                                        variant="outline"
                                        className={`text-[10px] font-mono ${
                                          (currentSlide as any).illustrationReference.isApproved ||
                                          (currentSlide as any).illustrationReference.reviewStatus === "approved_for_use"
                                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                                            : "bg-amber-50 text-amber-800 border-amber-300"
                                        }`}
                                      >
                                        {(currentSlide as any).illustrationReference.isApproved ||
                                        (currentSlide as any).illustrationReference.reviewStatus === "approved_for_use"
                                          ? "✓ Ilustrasi Disetujui Guru"
                                          : "⚠ Belum Disetujui Guru"}
                                      </Badge>
                                      <span className="text-[10px] text-muted-foreground font-mono">
                                        ID: {(currentSlide as any).illustrationReference.assetId}
                                      </span>
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              {/* KEY POINTS (POIN UTAMA) */}
                              {currentSlide.keyPoints.length > 0 ? (
                                <div className="p-2.5 rounded-lg bg-muted/40 border border-border/40 text-xs">
                                  <span className="font-semibold text-foreground text-[11px] block mb-1">
                                    Poin Inti Slide:
                                  </span>
                                  <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                                    {currentSlide.keyPoints.map((kp, kIdx) => (
                                      <li key={kIdx} className="text-foreground/90">{kp}</li>
                                    ))}
                                  </ul>
                                </div>
                              ) : null}

                              {/* STRUCTURED CONTENT BLOCKS */}
                              <div className="space-y-2">
                                <span className="font-semibold text-xs text-foreground block">
                                  Blok Konten Terstruktur ({currentSlide.blocks.length} Blok):
                                </span>
                                <div className="grid gap-2.5">
                                  {currentSlide.blocks.map((block) => (
                                    <div
                                      key={block.id}
                                      className="p-3 rounded-lg border border-border/70 bg-card hover:bg-accent/5 transition-colors space-y-1.5"
                                    >
                                      <div className="flex items-center justify-between">
                                        <Badge variant="secondary" className="text-[9px] font-mono uppercase">
                                          {block.blockType.replace("_", " ")}
                                        </Badge>
                                        {block.title ? (
                                          <span className="font-semibold text-xs text-foreground">
                                            {block.title}
                                          </span>
                                        ) : null}
                                      </div>

                                      {block.content ? (
                                        <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap">
                                          {block.content}
                                        </p>
                                      ) : null}

                                      {block.items && block.items.length > 0 ? (
                                        <ul className="list-disc list-inside space-y-0.5 text-xs text-foreground/90 pl-1">
                                          {block.items.map((item, itemIdx) => (
                                            <li key={itemIdx}>{item}</li>
                                          ))}
                                        </ul>
                                      ) : null}

                                      {/* STAT METRIC RENDERING */}
                                      {block.blockType === "stat_metric" && block.metadata ? (
                                        <div className="flex items-center gap-3 pt-1">
                                          <span className="text-2xl font-black text-indigo-600">
                                            {block.metadata.value || block.metadata.stat}
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            {block.metadata.label || block.metadata.unit}
                                          </span>
                                        </div>
                                      ) : null}

                                      {/* KEY VALUE RENDERING */}
                                      {block.blockType === "key_value" && block.metadata && block.metadata.pairs ? (
                                        <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                                          {Object.entries(block.metadata.pairs).map(([k, v]) => (
                                            <div key={k} className="p-1.5 rounded bg-muted/40">
                                              <span className="font-semibold block text-muted-foreground">{k}:</span>
                                              <span className="text-foreground">{String(v)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      ) : null}

                                      {/* TABLE RENDERING */}
                                      {block.blockType === "table" && block.metadata && block.metadata.headers ? (
                                        <div className="overflow-x-auto pt-1">
                                          <table className="w-full text-left text-[11px] border-collapse">
                                            <thead>
                                              <tr className="border-b bg-muted/30">
                                                {block.metadata.headers.map((h: string, hIdx: number) => (
                                                  <th key={hIdx} className="p-1 font-semibold">{h}</th>
                                                ))}
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {(block.metadata.rows || []).map((row: any[], rIdx: number) => (
                                                <tr key={rIdx} className="border-b border-border/40">
                                                  {row.map((cell, cIdx) => (
                                                    <td key={cIdx} className="p-1">{String(cell)}</td>
                                                  ))}
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* VISUAL DIRECTION & SPEAKER NOTES */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                                {/* VISUAL DIRECTION */}
                                <div className="p-3 rounded-lg bg-purple-50/40 border border-purple-200/50 space-y-1.5 text-xs">
                                  <div className="flex items-center gap-1.5 font-semibold text-purple-900">
                                    <Palette className="h-3.5 w-3.5 text-purple-600" />
                                    <span>Arahan Visual Slide:</span>
                                    <Badge variant="outline" className="ml-auto text-[9px] bg-purple-100/60 text-purple-800 border-purple-300">
                                      {currentSlide.visualDirection.visualRequirement}
                                    </Badge>
                                  </div>
                                  <p className="text-[11px] text-purple-950/90 leading-relaxed">
                                    {currentSlide.visualDirection.description}
                                  </p>
                                  <div className="pt-1 text-[10px] text-purple-800/80">
                                    <span>Saran Tata Letak: <strong>{currentSlide.visualDirection.suggestedLayout}</strong></span>
                                  </div>
                                </div>

                                {/* SPEAKER NOTES */}
                                <div className="p-3 rounded-lg bg-amber-50/40 border border-amber-200/50 space-y-1.5 text-xs">
                                  <div className="flex items-center gap-1.5 font-semibold text-amber-900">
                                    <MessageSquare className="h-3.5 w-3.5 text-amber-600" />
                                    <span>Catatan Pemateri (Guru):</span>
                                    <span className="ml-auto text-[10px] text-amber-800/80">
                                      ~{currentSlide.speakerNotes.estimatedDurationSeconds || 90} detik
                                    </span>
                                  </div>
                                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-950/90 leading-relaxed">
                                    {currentSlide.speakerNotes.talkingPoints.map((tp, tpIdx) => (
                                      <li key={tpIdx}>{tp}</li>
                                    ))}
                                  </ul>
                                </div>
                              </div>

                              {/* EVIDENCE REFERENCES */}
                              {currentSlide.evidenceReferences.length > 0 ? (
                                <div className="pt-2 border-t border-border/50 text-[11px]">
                                  <span className="text-muted-foreground block mb-1 font-medium">
                                    Referensi Grounding Kurikulum / Modul:
                                  </span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {currentSlide.evidenceReferences.map((ev, evIdx) => (
                                      <Badge
                                        key={evIdx}
                                        variant="outline"
                                        className="text-[10px] bg-background border-border/80 text-foreground"
                                      >
                                        🏷️ {ev.source} {ev.field ? `• ${ev.field}` : ""}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })()}
                      </div>

                      {/* JSON INSPECTOR */}
                      {showContentJsonPreview ? (
                        <pre className="p-3 rounded-lg bg-slate-950 text-slate-100 text-[10px] font-mono overflow-x-auto max-h-72 border">
                          {JSON.stringify(generatedPresentationContent, null, 2)}
                        </pre>
                      ) : null}

                      {/* PPT-1C PRESENTATION ARTIFACT CARD */}
                      {presentationArtifact ? (
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-50/20 p-4 grid gap-3 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileCheck2 className="h-4 w-4 text-emerald-600 shrink-0" />
                              <div>
                                <span className="font-semibold text-emerald-950 text-xs">
                                  Dokumen PowerPoint Terverifikasi (PPT-1C)
                                </span>
                                <p className="text-[11px] text-muted-foreground">
                                  Paket OOXML valid dan telah disimpan secara permanen.
                                </p>
                              </div>
                            </div>
                            <Badge variant="outline" className="text-[10px] bg-emerald-100 text-emerald-800 border-emerald-300">
                              Status: Siap Diunduh
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1 border-t border-emerald-200/50 text-[11px]">
                            <div className="bg-white/80 p-2 rounded-lg border border-emerald-100">
                              <span className="text-muted-foreground block text-[10px]">Berkas</span>
                              <span className="font-mono font-medium truncate block" title={presentationArtifact.filename}>
                                {presentationArtifact.filename}
                              </span>
                            </div>
                            <div className="bg-white/80 p-2 rounded-lg border border-emerald-100">
                              <span className="text-muted-foreground block text-[10px]">Jumlah Slide</span>
                              <span className="font-semibold text-foreground">
                                {presentationArtifact.slideCount} Slide
                              </span>
                            </div>
                            <div className="bg-white/80 p-2 rounded-lg border border-emerald-100">
                              <span className="text-muted-foreground block text-[10px]">Ukuran File</span>
                              <span className="font-semibold text-foreground">
                                {(presentationArtifact.byteSize / 1024).toFixed(1)} KB
                              </span>
                            </div>
                            <div className="bg-white/80 p-2 rounded-lg border border-emerald-100">
                              <span className="text-muted-foreground block text-[10px]">Media Tersemat</span>
                              <span className="font-semibold text-emerald-800">
                                {presentationArtifact.renderMetadata?.embeddedIllustrationCount ?? 0} Ilustrasi
                              </span>
                            </div>
                            <div className="bg-white/80 p-2 rounded-lg border border-emerald-100">
                              <span className="text-muted-foreground block text-[10px]">Integritas SHA-256</span>
                              <span className="font-mono text-[10px] text-muted-foreground truncate block" title={presentationArtifact.fileHash}>
                                {presentationArtifact.fileHash.slice(0, 10)}...
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {/* PPT-1F: FINAL QUALITY & SECURITY GATE CARD */}
                      {presentationArtifact ? (
                        <div
                          className={`rounded-xl border p-4 space-y-3 text-xs transition-all ${
                            presentationQualityEvaluation?.status === "passed"
                              ? "border-emerald-500/40 bg-emerald-50/20"
                              : presentationQualityEvaluation?.status === "failed"
                              ? "border-rose-500/40 bg-rose-50/20"
                              : "border-amber-500/40 bg-amber-50/15"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-border/60">
                            <div className="flex items-center gap-2">
                              <ShieldCheck
                                className={`h-4 w-4 shrink-0 ${
                                  presentationQualityEvaluation?.status === "passed"
                                    ? "text-emerald-600"
                                    : presentationQualityEvaluation?.status === "failed"
                                    ? "text-rose-600"
                                    : "text-amber-600"
                                }`}
                              />
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-foreground text-xs">
                                    Gerbang Mutu & Keamanan Akhir (PPT-1F Quality Gate)
                                  </span>
                                  {presentationQualityEvaluation?.status === "passed" ? (
                                    <Badge className="bg-emerald-600 text-white text-[10px] gap-1">
                                      <CheckCircle2 className="h-3 w-3" />
                                      PPTX Ready (PASS)
                                    </Badge>
                                  ) : presentationQualityEvaluation?.status === "failed" ? (
                                    <Badge className="bg-rose-600 text-white text-[10px] gap-1">
                                      <AlertCircle className="h-3 w-3" />
                                      PPTX Validation Failed
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-amber-700 border-amber-300 text-[10px] gap-1">
                                      <Clock className="h-3 w-3" />
                                      Menunggu Validasi Mutu
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  Validasi deterministik struktur OOXML, integritas materi, persetujuan ilustrasi, dan verifikasi versi sebelum unduhan diizinkan.
                                </p>
                              </div>
                            </div>

                            {presentationQualityEvaluation?.evaluatedAt ? (
                              <span className="text-[10px] text-muted-foreground font-mono self-end sm:self-auto">
                                Divalidasi: {new Date(presentationQualityEvaluation.evaluatedAt).toLocaleString("id-ID")}
                              </span>
                            ) : null}
                          </div>

                          {presentationQualityError ? (
                            <Alert variant="destructive" className="py-2 text-xs">
                              <AlertCircle className="h-3.5 w-3.5" />
                              <AlertDescription>{presentationQualityError}</AlertDescription>
                            </Alert>
                          ) : null}

                          {/* FINDINGS / REASONS IF FAILED */}
                          {presentationQualityEvaluation?.status === "failed" &&
                          presentationQualityEvaluation.findings.length > 0 ? (
                            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200/80 space-y-2">
                              <span className="font-semibold text-rose-800 text-[11px] block">
                                Temuan Validasi yang Memblokir Unduhan ({presentationQualityEvaluation.findings.length} Catatan):
                              </span>
                              <ul className="space-y-1 text-rose-700 text-[11px]">
                                {presentationQualityEvaluation.findings.map((f, idx) => (
                                  <li key={idx} className="flex items-start gap-1.5">
                                    <span className="font-mono text-[10px] bg-rose-200 text-rose-900 px-1 py-0.2 rounded shrink-0">
                                      {f.code}
                                    </span>
                                    <span>
                                      {f.slideNumber ? `[Slide #${f.slideNumber}] ` : ""}
                                      {f.description}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {/* ACTION BUTTONS */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() =>
                                  void evaluatePresentationQuality(presentationArtifact.id, true)
                                }
                                disabled={evaluatingPresentationQuality}
                                className={`h-8 gap-1.5 text-xs ${
                                  presentationQualityEvaluation?.status === "passed"
                                    ? "bg-slate-700 hover:bg-slate-800 text-white"
                                    : "bg-indigo-600 hover:bg-indigo-700 text-white"
                                }`}
                              >
                                <RefreshCw
                                  className={`h-3.5 w-3.5 ${
                                    evaluatingPresentationQuality ? "animate-spin" : ""
                                  }`}
                                />
                                {evaluatingPresentationQuality
                                  ? "Memvalidasi Mutu..."
                                  : presentationQualityEvaluation
                                  ? "Validasi Ulang Mutu (Re-check)"
                                  : "Jalankan Quality Gate (PPT-1F)"}
                              </Button>

                              {presentationQualityEvaluation?.status === "passed" ? (
                                <Button
                                  size="sm"
                                  onClick={() =>
                                    void downloadApprovedPresentationPptx(presentationArtifact.id)
                                  }
                                  className="h-8 gap-1.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                                >
                                  <Download className="h-3.5 w-3.5" />
                                  Unduh File PPTX Nyata
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ) : null}

                      {/* INVARIANT REMINDER */}
                      <Alert className="border-indigo-500/20 bg-indigo-50/20 py-2">
                        <Info className="h-3.5 w-3.5 text-indigo-600" />
                        <AlertDescription className="text-[11px] text-indigo-800">
                          <strong>Invarian PPT-1C, PPT-1D, & PPT-1F:</strong> Dokumen PowerPoint (.pptx) asli dihasilkan menggunakan engine perender OpenXML sejati dengan media ilustrasi terverifikasi, persetujuan guru yang sah, dan validasi mutu menyeluruh sebelum dapat didistribusikan.
                        </AlertDescription>
                      </Alert>
                    </div>
                  ) : null}

                  {showSpecPreview ? (
                    <pre className="mt-2 p-3 rounded-lg bg-slate-950 text-slate-100 text-[10px] font-mono overflow-x-auto max-h-60 border">
                      {JSON.stringify(specification, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                  <Lock className="mx-auto h-6 w-6 text-muted-foreground/60 mb-2" />
                  <p className="font-medium text-foreground">Otorisasi Generasi PPT Terkunci</p>
                  <p className="mt-1">
                    Harap setujui rencana slide pada Langkah 4 terlebih dahulu agar spesifikasi otorisasi dapat diterbitkan.
                  </p>
                  <Button
                    disabled
                    variant="outline"
                    size="sm"
                    className="mt-3 cursor-not-allowed opacity-60 text-xs"
                  >
                    Siapkan Spesifikasi PPT (Terkunci)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
