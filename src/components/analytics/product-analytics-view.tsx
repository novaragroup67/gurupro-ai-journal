/**
 * GuruPro OPS-2: Product Analytics & Real-User Feedback Dashboard View
 *
 * Visualizes adoption, feature usage, conversion funnels, AI reliability,
 * and user feedback distribution with time window controls (Hari Ini, 7 Hari, 30 Hari).
 */

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock,
  Layers,
  MessageSquareHeart,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  Users,
} from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getAggregatedProductMetrics,
  type AnalyticsTimeWindow,
  type FunnelStage,
  type ProductAnalyticsReport,
} from "@/lib/analytics/aggregation-service";
import { updateUserFeedbackStatus, type FeedbackStatus } from "@/lib/analytics/feedback-service";

export function ProductAnalyticsView() {
  const [timeWindow, setTimeWindow] = useState<AnalyticsTimeWindow>("last_7_days");
  const [report, setReport] = useState<ProductAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingFbId, setUpdatingFbId] = useState<string | null>(null);

  const loadMetrics = useCallback(async (w: AnalyticsTimeWindow = timeWindow) => {
    setLoading(true);
    try {
      const data = await getAggregatedProductMetrics(w);
      setReport(data);
    } catch {
      toast.error("Gagal memuat analitik produk.");
    } finally {
      setLoading(false);
    }
  }, [timeWindow]);

  useEffect(() => {
    void loadMetrics(timeWindow);
  }, [loadMetrics, timeWindow]);

  const handleStatusChange = async (feedbackId: string, nextStatus: FeedbackStatus) => {
    setUpdatingFbId(feedbackId);
    try {
      const res = await updateUserFeedbackStatus(feedbackId, nextStatus, undefined, "admin");
      if (res.ok) {
        toast.success(res.message);
        await loadMetrics(timeWindow);
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("Gagal memperbarui status.");
    } finally {
      setUpdatingFbId(null);
    }
  };

  const getCategoryBadge = (cat: string) => {
    switch (cat) {
      case "bug":
        return <Badge variant="destructive" className="text-[10px]">Bug</Badge>;
      case "ai_output":
        return <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-700">Output AI</Badge>;
      case "performance":
        return <Badge variant="secondary" className="text-[10px] bg-amber-100 text-amber-700">Kinerja</Badge>;
      case "usability":
        return <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700">UX / Alur</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">Saran</Badge>;
    }
  };

  const getStatusBadge = (st: string) => {
    switch (st) {
      case "new":
        return <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600">Baru</Badge>;
      case "triaged":
        return <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700">Ditinjau</Badge>;
      case "in_progress":
        return <Badge variant="secondary" className="text-[10px] bg-purple-100 text-purple-700">Dikerjakan</Badge>;
      case "resolved":
        return <Badge variant="default" className="text-[10px] bg-emerald-600">Selesai</Badge>;
      case "closed":
        return <Badge variant="outline" className="text-[10px] text-muted-foreground">Ditutup</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{st}</Badge>;
    }
  };

  const renderFunnelCards = (title: string, stages: FunnelStage[]) => {
    return (
      <div className="space-y-2 rounded-lg border bg-card p-3 shadow-xs">
        <h4 className="text-xs font-semibold text-foreground flex items-center justify-between">
          <span>{title}</span>
          <span className="text-[10px] font-normal text-muted-foreground">
            Konversi Akhir: {stages.length > 0 ? `${stages[stages.length - 1].conversionRate}%` : "0%"}
          </span>
        </h4>
        <div className="space-y-2 pt-1">
          {stages.map((st, i) => (
            <div key={st.name} className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-muted-foreground">{i + 1}. {st.name}</span>
                <span className="font-semibold text-foreground">{st.count} ({st.conversionRate}%)</span>
              </div>
              <Progress value={st.conversionRate} className="h-1.5" />
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div>
          <h3 className="text-base font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Analitik Produk & Real-User Feedback (OPS-2)
          </h3>
          <p className="text-xs text-muted-foreground">
            Wawasan terukur mengenai adopsi fitur, konversi alur pengguna, keandalan AI, dan masukan pengguna riil.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={timeWindow} onValueChange={(v) => setTimeWindow(v as AnalyticsTimeWindow)}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hari Ini</SelectItem>
              <SelectItem value="last_7_days">7 Hari Terakhir</SelectItem>
              <SelectItem value="last_30_days">30 Hari Terakhir</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => loadMetrics(timeWindow)}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Segarkan
          </Button>
        </div>
      </div>

      {loading && !report ? (
        <div className="py-16 text-center text-xs text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
          Memuat data analitik produksi...
        </div>
      ) : report ? (
        <>
          {/* Overview Key Metrics Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="shadow-xs">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs">Pengguna Aktif</span>
                  <Users className="h-4 w-4 text-blue-500" />
                </div>
                <div className="text-xl font-bold text-foreground">
                  {report.adoption.activeTeachers + report.adoption.activeStudents}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {report.adoption.activeTeachers} Guru • {report.adoption.activeStudents} Siswa
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-xs">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs">Aktivitas Terukur</span>
                  <Activity className="h-4 w-4 text-emerald-500" />
                </div>
                <div className="text-xl font-bold text-foreground">
                  {report.adoption.totalEvents}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Event tercatat non-blocking
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-xs">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs">Keandalan AI</span>
                  <Bot className="h-4 w-4 text-purple-500" />
                </div>
                <div className="text-xl font-bold text-foreground">
                  {report.aiReliability.successRate}%
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {report.aiReliability.failoverCount} Failover • {report.aiReliability.safetyBlockedCount} Safe Block
                </p>
              </CardContent>
            </Card>

            <Card className="shadow-xs">
              <CardContent className="p-4 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs">Umpan Balik Pengguna</span>
                  <MessageSquareHeart className="h-4 w-4 text-rose-500" />
                </div>
                <div className="text-xl font-bold text-foreground">
                  {report.feedback.total}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {report.feedback.unresolvedCount} Perlu ditindaklanjuti
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Workflow Conversion Funnels */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <TrendingUp className="h-4 w-4 text-primary" />
              Corong Konversi Alur Kerja (Workflow Funnels)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {renderFunnelCards("Modul Ajar AI", report.funnels.modulAjar)}
              {renderFunnelCards("Generator Soal", report.funnels.generatorSoal)}
              {renderFunnelCards("Penugasan Siswa", report.funnels.penugasan)}
              {renderFunnelCards("Penilaian & Rekap", report.funnels.penilaian)}
              {renderFunnelCards("Presentasi PPTX", report.funnels.presentation)}
            </div>
          </div>

          {/* Feature Usage & AI Reliability Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Feature Usage Distribution */}
            <Card className="shadow-xs">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs font-bold flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-blue-500" />
                  Distribusi Penggunaan Fitur
                </CardTitle>
                <CardDescription className="text-[11px]">
                  Proporsi aktivitas pengguna pada setiap modul pembelajaran.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-1 space-y-2">
                {Object.keys(report.featureUsage).length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Belum ada aktivitas fitur pada jendela ini.</p>
                ) : (
                  Object.entries(report.featureUsage).map(([f, count]) => {
                    const pct = Math.round((count / (report.adoption.totalEvents || 1)) * 100);
                    return (
                      <div key={f} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="capitalize text-muted-foreground">{f.replace(/_/g, " ")}</span>
                          <span className="font-semibold text-foreground">{count} ({pct}%)</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>

            {/* AI Provider Health & Distribution */}
            <Card className="shadow-xs">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-xs font-bold flex items-center gap-1.5">
                  <Bot className="h-4 w-4 text-purple-500" />
                  Metrik & Keandalan Dwi-Penyedia AI
                </CardTitle>
                <CardDescription className="text-[11px]">
                  Distribusi eksekusi Google Gemini vs. OpenAI fallback & mitigasi keselamatan.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-1 space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border p-2.5 bg-muted/30">
                    <span className="text-[11px] text-muted-foreground">Primer: Google Gemini</span>
                    <p className="font-bold text-sm text-foreground mt-0.5">{report.aiReliability.providerBreakdown.gemini} Panggilan</p>
                  </div>
                  <div className="rounded border p-2.5 bg-muted/30">
                    <span className="text-[11px] text-muted-foreground">Fallback: OpenAI</span>
                    <p className="font-bold text-sm text-foreground mt-0.5">{report.aiReliability.providerBreakdown.openai} Failover</p>
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <span className="text-muted-foreground">Tingkat Keberhasilan Generasi AI</span>
                  <div className="flex items-center gap-2">
                    <Progress value={report.aiReliability.successRate} className="h-2 flex-1" />
                    <span className="font-bold text-foreground text-xs">{report.aiReliability.successRate}%</span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t">
                  <span>Fail-Closed Safety Block: <strong className="text-foreground">{report.aiReliability.safetyBlockedCount}</strong></span>
                  <span>Total Generasi: <strong className="text-foreground">{report.aiReliability.totalGenerations}</strong></span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* User Feedback Management Table */}
          <Card className="shadow-xs">
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-xs font-bold flex items-center gap-1.5">
                  <MessageSquareHeart className="h-4 w-4 text-rose-500" />
                  Umpan Balik Pengguna Terbaru ({report.feedback.total})
                </CardTitle>
                <CardDescription className="text-[11px]">
                  Masukan langsung dari Guru dan Siswa beserta status penanganan.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {report.feedback.recent.length === 0 ? (
                <p className="text-xs text-muted-foreground py-8 text-center">
                  Belum ada umpan balik yang masuk pada periode ini.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="text-[11px]">
                      <TableHead>Kategori</TableHead>
                      <TableHead>Fitur</TableHead>
                      <TableHead>Pesan Masukan</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Waktu</TableHead>
                      <TableHead className="text-right">Tindakan</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="text-xs">
                    {report.feedback.recent.map((fb) => (
                      <TableRow key={fb.id}>
                        <TableCell>{getCategoryBadge(fb.category)}</TableCell>
                        <TableCell className="capitalize font-medium text-foreground">{fb.feature.replace(/_/g, " ")}</TableCell>
                        <TableCell className="max-w-[280px] truncate text-muted-foreground" title={fb.message}>
                          {fb.message}
                          {fb.correlationId ? (
                            <span className="block text-[10px] font-mono text-muted-foreground">Ref: {fb.correlationId}</span>
                          ) : null}
                        </TableCell>
                        <TableCell>{getStatusBadge(fb.status)}</TableCell>
                        <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(fb.createdAt).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Select
                            value={fb.status}
                            onValueChange={(val) => handleStatusChange(fb.id, val as FeedbackStatus)}
                            disabled={updatingFbId === fb.id}
                          >
                            <SelectTrigger className="h-7 w-24 text-[10px] ml-auto">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">Baru</SelectItem>
                              <SelectItem value="triaged">Ditinjau</SelectItem>
                              <SelectItem value="in_progress">Dikerjakan</SelectItem>
                              <SelectItem value="resolved">Selesai</SelectItem>
                              <SelectItem value="closed">Ditutup</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
