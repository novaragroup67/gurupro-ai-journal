import { CalendarClock } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import {
  KELAS,
  KONDISI_KELAS,
  MATA_PELAJARAN,
  METODE,
  type JournalDraft,
} from "@/lib/journal-types";

export type JournalErrors = Partial<Record<keyof JournalDraft, string>>;

export const REQUIRED_FIELDS: Array<keyof JournalDraft> = [
  "mataPelajaran",
  "kelas",
  "tanggal",
  "materi",
  "tujuan",
];

export function validateJournal(draft: JournalDraft): JournalErrors {
  const labels: Record<string, string> = {
    mataPelajaran: "Mata pelajaran wajib dipilih.",
    kelas: "Kelas wajib dipilih.",
    tanggal: "Tanggal wajib diisi.",
    materi: "Materi / topik wajib diisi.",
    tujuan: "Tujuan pembelajaran wajib diisi.",
  };
  const errors: JournalErrors = {};
  REQUIRED_FIELDS.forEach((field) => {
    if (!String(draft[field] ?? "").trim()) errors[field] = labels[field] ?? "Wajib diisi.";
  });
  return errors;
}

function FieldError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return <p className="text-xs font-medium text-destructive">{message}</p>;
}

interface Props {
  draft: JournalDraft;
  errors: JournalErrors;
  onChange: (patch: Partial<JournalDraft>) => void;
  showAiSections?: boolean;
}

export function JournalForm({ draft, errors, onChange, showAiSections = false }: Props) {
  const invalid = (key: keyof JournalDraft) =>
    cn(errors[key] && "border-destructive ring-destructive/20 focus-visible:ring-destructive/30");

  return (
    <div className="grid gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-primary" />
            Identitas Pembelajaran
          </CardTitle>
          <CardDescription>Data dasar kegiatan mengajar Anda.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>
              Mata Pelajaran <span className="text-destructive">*</span>
            </Label>
            <Select
              value={draft.mataPelajaran}
              onValueChange={(v) => onChange({ mataPelajaran: v })}
            >
              <SelectTrigger className={cn("w-full", invalid("mataPelajaran"))}>
                <SelectValue placeholder="Pilih mata pelajaran" />
              </SelectTrigger>
              <SelectContent>
                {MATA_PELAJARAN.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={errors.mataPelajaran} />
          </div>

          <div className="grid gap-2">
            <Label>
              Kelas <span className="text-destructive">*</span>
            </Label>
            <Select value={draft.kelas} onValueChange={(v) => onChange({ kelas: v })}>
              <SelectTrigger className={cn("w-full", invalid("kelas"))}>
                <SelectValue placeholder="Pilih kelas" />
              </SelectTrigger>
              <SelectContent>
                {KELAS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={errors.kelas} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tanggal">
              Tanggal <span className="text-destructive">*</span>
            </Label>
            <Input
              id="tanggal"
              type="date"
              value={draft.tanggal}
              onChange={(e) => onChange({ tanggal: e.target.value })}
              className={invalid("tanggal")}
            />
            <FieldError message={errors.tanggal} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="jam">Jam Pelajaran</Label>
            <Input
              id="jam"
              placeholder="Contoh: 07:30 - 09:00"
              value={draft.jam}
              onChange={(e) => onChange({ jam: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Isi Pembelajaran</CardTitle>
          <CardDescription>Materi, tujuan, metode, dan aktivitas di kelas.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="materi">
              Materi / Topik <span className="text-destructive">*</span>
            </Label>
            <Input
              id="materi"
              placeholder="Contoh: Konsep Database Relasional"
              value={draft.materi}
              onChange={(e) => onChange({ materi: e.target.value })}
              className={invalid("materi")}
            />
            <FieldError message={errors.materi} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tujuan">
              Tujuan Pembelajaran <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="tujuan"
              rows={3}
              placeholder="Peserta didik mampu ..."
              value={draft.tujuan}
              onChange={(e) => onChange({ tujuan: e.target.value })}
              className={invalid("tujuan")}
            />
            <FieldError message={errors.tujuan} />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Metode Pembelajaran</Label>
              <Select
                value={draft.metode}
                onValueChange={(v) => onChange({ metode: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih metode" />
                </SelectTrigger>
                <SelectContent>
                  {METODE.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Kondisi Kelas</Label>
              <Select
                value={draft.kondisiKelas}
                onValueChange={(v) => onChange({ kondisiKelas: v })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih kondisi kelas" />
                </SelectTrigger>
                <SelectContent>
                  {KONDISI_KELAS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="aktivitas">Aktivitas Pembelajaran</Label>
            <Textarea
              id="aktivitas"
              rows={5}
              placeholder="Pendahuluan, kegiatan inti, penutup ..."
              value={draft.aktivitas}
              onChange={(e) => onChange({ aktivitas: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>

      {showAiSections ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evaluasi & Refleksi</CardTitle>
            <CardDescription>Bagian hasil susunan GuruPro AI, bisa Anda sesuaikan.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <Label htmlFor="partisipasi">Partisipasi Siswa</Label>
              <Textarea
                id="partisipasi"
                rows={3}
                value={draft.partisipasi}
                onChange={(e) => onChange({ partisipasi: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="penilaian">Penilaian</Label>
              <Textarea
                id="penilaian"
                rows={3}
                value={draft.penilaian}
                onChange={(e) => onChange({ penilaian: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="refleksi">Refleksi Guru</Label>
              <Textarea
                id="refleksi"
                rows={3}
                value={draft.refleksi}
                onChange={(e) => onChange({ refleksi: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="tindakLanjut">Tindak Lanjut</Label>
              <Textarea
                id="tindakLanjut"
                rows={3}
                value={draft.tindakLanjut}
                onChange={(e) => onChange({ tindakLanjut: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Catatan Guru</CardTitle>
          <CardDescription>Hal penting yang perlu diingat untuk pertemuan berikutnya.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            id="catatan"
            rows={3}
            placeholder="Catatan tambahan ..."
            value={draft.catatan}
            onChange={(e) => onChange({ catatan: e.target.value })}
          />
        </CardContent>
      </Card>
    </div>
  );
}
