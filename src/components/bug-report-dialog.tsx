import { useRouterState } from "@tanstack/react-router";
import { AlertCircle, Bug, CheckCircle2, Loader2, Send } from "lucide-react";
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
import { submitBugReport, type BugPriority } from "@/lib/bug-report-store";

interface BugReportDialogProps {
  children?: React.ReactNode;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary";
  triggerSize?: "default" | "sm" | "lg" | "icon";
  triggerClassName?: string;
  triggerLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function BugReportDialog({
  children,
  triggerVariant = "outline",
  triggerSize = "sm",
  triggerClassName,
  triggerLabel = "Laporkan Masalah",
  open: externalOpen,
  onOpenChange: setExternalOpen,
}: BugReportDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = externalOpen !== undefined;
  const isOpen = isControlled ? externalOpen : internalOpen;
  const setIsOpen = isControlled ? (setExternalOpen ?? (() => {})) : setInternalOpen;

  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<BugPriority>("sedang");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setPriority("sedang");
    setErrorMsg("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanDesc = description.trim();

    if (!cleanTitle) {
      setErrorMsg("Mohon masukkan judul atau ringkasan kendala.");
      return;
    }

    if (!cleanDesc) {
      setErrorMsg("Mohon jelaskan detail kendala atau langkah terjadinya.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");

    try {
      const res = await submitBugReport({
        title: cleanTitle,
        description: cleanDesc,
        route: currentPath,
        priority,
      });

      if (!res.ok) {
        setErrorMsg(res.message);
        toast.error(res.message);
        return;
      }

      toast.success(res.message, {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />,
      });
      resetForm();
      setIsOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat mengirim laporan.";
      setErrorMsg(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {children ? (
        <DialogTrigger asChild>{children}</DialogTrigger>
      ) : (
        <DialogTrigger asChild>
          <Button
            variant={triggerVariant}
            size={triggerSize}
            className={triggerClassName}
          >
            <Bug className="h-3.5 w-3.5 mr-1.5 text-amber-600" />
            {triggerLabel}
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-100 text-amber-800">
                <Bug className="h-4 w-4" />
              </span>
              <div>
                <DialogTitle className="font-display text-navy">Laporkan Masalah / Kendala</DialogTitle>
                <DialogDescription className="text-xs">
                  Sampaikan kendala sistem atau masukan langsung kepada tim Administrator GuruPro.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid gap-4 py-4 text-sm">
            {errorMsg && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="bug-title" className="text-xs font-semibold">
                Judul Masalah <span className="text-destructive">*</span>
              </Label>
              <Input
                id="bug-title"
                placeholder="Contoh: Tombol simpan nilai tidak merespons"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setErrorMsg("");
                }}
                disabled={submitting}
                maxLength={120}
                autoFocus
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="bug-priority" className="text-xs font-semibold">
                  Tingkat Urgensi
                </Label>
                <Select
                  value={priority}
                  onValueChange={(val) => setPriority(val as BugPriority)}
                  disabled={submitting}
                >
                  <SelectTrigger id="bug-priority" className="h-9 text-xs">
                    <SelectValue placeholder="Pilih urgensi" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rendah" className="text-xs">
                      🟢 Rendah (Masukan tampilan / saran)
                    </SelectItem>
                    <SelectItem value="sedang" className="text-xs">
                      🟡 Sedang (Fitur minor terganggu)
                    </SelectItem>
                    <SelectItem value="tinggi" className="text-xs">
                      🟠 Tinggi (Fitur utama terkendala)
                    </SelectItem>
                    <SelectItem value="kritis" className="text-xs">
                      🔴 Kritis (Tidak bisa mengajar / mengumpulkan)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="bug-route" className="text-xs font-semibold">
                  Halaman Terkait
                </Label>
                <Input
                  id="bug-route"
                  value={currentPath}
                  disabled
                  readOnly
                  className="h-9 font-mono text-xs bg-muted text-muted-foreground"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="bug-description" className="text-xs font-semibold">
                Penjelasan Kendala <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="bug-description"
                rows={4}
                placeholder="Jelaskan apa yang Anda lakukan, apa yang terjadi, atau pesan error yang muncul..."
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setErrorMsg("");
                }}
                disabled={submitting}
                maxLength={1000}
                className="text-xs resize-none"
              />
              <p className="text-[11px] text-muted-foreground text-right">
                {description.length}/1000 karakter
              </p>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => {
                resetForm();
                setIsOpen(false);
              }}
            >
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={submitting} className="gap-1.5">
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              {submitting ? "Mengirim Laporan…" : "Kirim Laporan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
