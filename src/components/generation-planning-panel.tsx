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
  IllustrationOutline,
  PresentationOutline,
  PresentationSlide,
  ILLUSTRATION_STYLES_CATALOG,
  PRESENTATION_STYLES_CATALOG,
  GenerationSpecification,
} from "@/lib/ai/generation-planning-contract";
import type { IllustrationGenerationRequest } from "@/lib/ai/illustration-generation-contract";
import { useGenerationPlan } from "@/lib/generation-planning-store";

// ==============================================================================
// 1. ILLUSTRATION PLANNING PANEL
// ==============================================================================

export interface IllustrationPlanningPanelProps {
  moduleId: string;
  sectionId?: string;
  moduleTitle?: string;
}

export function IllustrationPlanningPanel({
  moduleId,
  sectionId,
  moduleTitle,
}: IllustrationPlanningPanelProps) {
  const {
    plan,
    versions,
    loading,
    saving,
    approving,
    preparedRequest,
    preparingRequest,
    availableStyles,
    initPlan,
    saveOutlineEdits,
    selectStyle,
    approvePlan,
    revokeApproval,
    fetchSpecification,
    prepareIllustrationRequest,
  } = useGenerationPlan({
    moduleId,
    targetType: "illustration",
    sectionId,
  });

  // Local editable form state
  const [formOutline, setFormOutline] = useState<IllustrationOutline | null>(null);
  const [specification, setSpecification] = useState<GenerationSpecification | null>(null);
  const [showSpecPreview, setShowSpecPreview] = useState(false);
  const [showReqPreview, setShowReqPreview] = useState(false);

  // Sync form state when plan changes
  useEffect(() => {
    if (plan && plan.outline) {
      setFormOutline(plan.outline as IllustrationOutline);
    }
  }, [plan]);

  // Load specification when approved
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
                    <div
                      key={style.id}
                      onClick={() => handleStyleChange(style.id)}
                      className={`cursor-pointer rounded-xl border p-3.5 transition-all text-left relative flex flex-col justify-between ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                          : "border-border/70 hover:border-primary/40 hover:bg-muted/30"
                      }`}
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
                    </div>
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
              {isApproved && specification ? (
                <div className="grid gap-3">
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

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSpecPreview(!showSpecPreview)}
                        className="text-xs gap-1.5"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {showSpecPreview ? "Tutup Inspeksi Spek" : "Inspeksi Spesifikasi (JSON)"}
                      </Button>

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
                        disabled
                        variant="secondary"
                        className="opacity-70 cursor-not-allowed text-xs gap-1.5"
                        title="Fitur generasi gambar AI langsung (VIS-1B) belum diaktifkan pada tahap VIS-1A."
                      >
                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                        Generate Gambar Nyata
                        <Badge variant="outline" className="ml-1 text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                          VIS-1B Segera Hadir
                        </Badge>
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
    availableStyles,
    initPlan,
    saveOutlineEdits,
    selectStyle,
    approvePlan,
    revokeApproval,
    addSlide,
    removeSlide,
    reorderSlides,
    updateSlide,
    fetchSpecification,
  } = useGenerationPlan({
    moduleId,
    targetType: "presentation",
  });

  const [formOutline, setFormOutline] = useState<PresentationOutline | null>(null);
  const [specification, setSpecification] = useState<GenerationSpecification | null>(null);
  const [showSpecPreview, setShowSpecPreview] = useState(false);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);

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
                      <Badge variant="outline" className="font-mono text-xs">
                        Slide {activeSlideIndex + 1} dari {formOutline.slides.length}
                      </Badge>
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
                    <div
                      key={style.id}
                      onClick={() => handleStyleChange(style.id)}
                      className={`cursor-pointer rounded-xl border p-3.5 transition-all text-left relative flex flex-col justify-between ${
                        isSelected
                          ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary"
                          : "border-border/70 hover:border-primary/40 hover:bg-muted/30"
                      }`}
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
                    </div>
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

          {/* STEP 5: PPT GENERATION AUTHORIZATION & SPEC PREVIEW */}
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
                      Otorisasi Generasi Presentasi AI
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Spesifikasi kompilasi PPTX siap diterbitkan setelah persetujuan rencana valid.
                    </p>
                  </div>
                </div>
                {isApproved ? (
                  <Badge className="bg-primary text-primary-foreground text-xs gap-1">
                    <Lock className="h-3 w-3" />
                    Siap untuk Generasi PPTX
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
                <div className="grid gap-3">
                  <div className="rounded-xl border p-4 bg-muted/10 grid gap-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-muted-foreground">ID Otorisasi:</span>
                      <span className="font-mono font-semibold text-foreground">
                        {specification.authorizationId}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Format Layout Target:</span>
                      <span className="font-medium text-foreground">
                        Widescreen 16:9 ({specification.outlineSnapshot.slides?.length || formOutline.slides.length} Slide)
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Gaya Presentasi Terpilih:</span>
                      <span className="font-medium text-foreground">
                        {specification.styleSnapshot.styleName} (v{specification.styleSnapshot.styleVersion})
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSpecPreview(!showSpecPreview)}
                      className="text-xs gap-1.5"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {showSpecPreview ? "Tutup Inspeksi JSON" : "Inspeksi Spesifikasi Lengkap (JSON)"}
                    </Button>

                    <div className="flex items-center gap-2">
                      <Button
                        disabled
                        variant="secondary"
                        className="opacity-70 cursor-not-allowed text-xs gap-1.5"
                        title="Fitur kompilasi file PPTX otomatis (PPT-1) belum diaktifkan pada tahap GEN-0."
                      >
                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                        Generate PPTX Nyata
                        <Badge variant="outline" className="ml-1 text-[10px] bg-amber-50 text-amber-700 border-amber-200">
                          PPT-1 Segera Hadir
                        </Badge>
                      </Button>
                    </div>
                  </div>

                  {showSpecPreview ? (
                    <pre className="mt-2 p-3 rounded-lg bg-slate-950 text-slate-100 text-[10px] font-mono overflow-x-auto max-h-60 border">
                      {JSON.stringify(specification, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">
                  <Lock className="mx-auto h-6 w-6 text-muted-foreground/60 mb-2" />
                  <p className="font-medium text-foreground">Otorisasi Generasi PPTX Terkunci</p>
                  <p className="mt-1">
                    Harap setujui rencana slide pada Langkah 4 terlebih dahulu agar spesifikasi otorisasi dapat diterbitkan.
                  </p>
                  <Button
                    disabled
                    variant="outline"
                    size="sm"
                    className="mt-3 cursor-not-allowed opacity-60 text-xs"
                  >
                    Generate PPTX Nyata (Terkunci)
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
