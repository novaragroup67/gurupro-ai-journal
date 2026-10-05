/**
 * GuruPro OPS-2: User Feedback Dialog Component
 *
 * Provides a minimal, non-intrusive feedback modal allowing teachers and students
 * to submit feedback across 5 categories (Bug, Usability, AI Output, Performance, Suggestion)
 * with optional correlation ID tracking.
 */

import { MessageSquareHeart, Loader2, Send, CheckCircle2 } from "lucide-react";
import React, { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  submitUserFeedback,
  type FeedbackCategory,
  type FeedbackPriority,
} from "@/lib/analytics/feedback-service";
import { useAuth } from "@/lib/auth-store";
import { trackProductEvent, PRODUCT_EVENT_NAMES } from "@/lib/analytics/product-events";

interface FeedbackDialogProps {
  children?: React.ReactNode;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary";
  triggerSize?: "default" | "sm" | "lg" | "icon";
  triggerClassName?: string;
  triggerLabel?: string;
  defaultFeature?: string;
  defaultCorrelationId?: string;
}

export function FeedbackDialog({
  children,
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerClassName,
  triggerLabel = "Kirim Feedback",
  defaultFeature = "umum",
  defaultCorrelationId = "",
}: FeedbackDialogProps) {
  const [open, setOpen] = useState(false);
  const { user, profile } = useAuth();

  const [category, setCategory] = useState<FeedbackCategory>("suggestion");
  const [feature, setFeature] = useState(defaultFeature);
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<FeedbackPriority>("sedang");
  const [correlationId, setCorrelationId] = useState(defaultCorrelationId);
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      toast.error("Mohon tuliskan pesan umpan balik Anda.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitUserFeedback({
        category,
        feature,
        message,
        priority,
        correlationId: correlationId.trim() || undefined,
        userId: user?.id,
        role: (profile?.role as any) || "guru",
      });

      if (res.ok) {
        setIsSuccess(true);
        toast.success("Terima kasih! Umpan balik Anda telah dicatat.");

        // Track analytics event asynchronously
        trackProductEvent({
          eventName: "feedback_submitted",
          feature: "feedback",
          actorId: user?.id,
          role: profile?.role,
          correlationId: correlationId.trim() || undefined,
          metadata: { category, feature, priority },
        });

        setTimeout(() => {
          setIsSuccess(false);
          setOpen(false);
          setMessage("");
          setCorrelationId("");
        }, 1500);
      } else {
        toast.error(res.message || "Gagal mengirimkan umpan balik.");
      }
    } catch {
      toast.error("Terjadi kendala jaringan saat mengirim umpan balik.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button
            variant={triggerVariant}
            size={triggerSize}
            className={triggerClassName}
          >
            <MessageSquareHeart className="h-4 w-4 mr-1 text-primary" />
            {triggerLabel}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <MessageSquareHeart className="h-5 w-5 text-primary" />
            Kirim Masukan & Umpan Balik
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Bantu kami menyempurnakan GuruPro. Masukan Anda akan langsung ditinjau oleh tim operasional.
          </DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <div className="py-8 text-center space-y-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto animate-bounce" />
            <h4 className="font-semibold text-sm text-foreground">Umpan Balik Terkirim!</h4>
            <p className="text-xs text-muted-foreground">
              Terima kasih telah berkontribusi membuat GuruPro semakin baik dan stabil.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="category" className="text-xs font-medium">Kategori</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as FeedbackCategory)}>
                  <SelectTrigger id="category" className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="suggestion">💡 Saran Fitur</SelectItem>
                    <SelectItem value="usability">🎯 Kemudahan (UX)</SelectItem>
                    <SelectItem value="ai_output">🤖 Kualitas Output AI</SelectItem>
                    <SelectItem value="performance">⚡ Kinerja / Kecepatan</SelectItem>
                    <SelectItem value="bug">🐛 Laporan Kendala (Bug)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="feature" className="text-xs font-medium">Fitur Terkait</Label>
                <Select value={feature} onValueChange={setFeature}>
                  <SelectTrigger id="feature" className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="modul_ajar">Modul Ajar AI</SelectItem>
                    <SelectItem value="generator_soal">Generator Soal</SelectItem>
                    <SelectItem value="penugasan">Penugasan & Kelas</SelectItem>
                    <SelectItem value="penilaian">Penilaian & Rekap</SelectItem>
                    <SelectItem value="presentation">Presentasi PPTX</SelectItem>
                    <SelectItem value="auth">Akun & Profil</SelectItem>
                    <SelectItem value="umum">Lainnya / Umum</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="message" className="text-xs font-medium">Pesan Masukan / Detail</Label>
              <Textarea
                id="message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ceritakan pengalaman Anda, kendala yang dihadapi, atau ide penyempurnaan..."
                rows={4}
                className="text-xs resize-none"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="priority" className="text-xs font-medium">Tingkat Kepentingan</Label>
                <Select value={priority} onValueChange={(v) => setPriority(v as FeedbackPriority)}>
                  <SelectTrigger id="priority" className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rendah">Rendah (Ide Santai)</SelectItem>
                    <SelectItem value="sedang">Sedang (Bagus Jika Ada)</SelectItem>
                    <SelectItem value="tinggi">Tinggi (Sangat Membantu)</SelectItem>
                    <SelectItem value="kritis">Kritis (Mengganggu Kerja)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cid" className="text-xs font-medium">Kode Referensi / ID (Opsional)</Label>
                <Input
                  id="cid"
                  value={correlationId}
                  onChange={(e) => setCorrelationId(e.target.value)}
                  placeholder="Contoh: req_123 atau ref_abc"
                  className="h-9 text-xs font-mono"
                />
              </div>
            </div>

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="text-xs"
              >
                Batal
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={submitting || !message.trim()}
                className="text-xs gap-1.5"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Mengirim...
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Kirim Masukan
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
