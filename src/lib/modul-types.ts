export type SumberTipe = "CP / ATP" | "eBook / Dokumen" | "Teks" | "Link Luar";
export type ModulStatus = "Draft" | "Terbit";

export interface ModulSection {
  id: string;
  judul: string;
  poin: string[];
  isi: string;
  ilustrasi?: string | undefined;
}

export interface Slide {
  id: string;
  judul: string;
  bullets: string[];
  ilustrasi: string;
}

export interface Modul {
  id: string;
  judul: string;
  kelas: string;
  kelasId?: string;
  mapel: string;
  status: ModulStatus;
  sumberTipe: SumberTipe;
  sumberInput: string;
  sumberUrl?: string | undefined;
  sumberJudul?: string | undefined;
  sumberKutipan?: string | undefined;
  ringkasan: string;
  sections: ModulSection[];
  slides: Slide[];
  createdAt: string;
  updatedAt: string;
  isArchived?: boolean;
  archivedAt?: string | null;
  archivedBy?: string | null;
}

export const SUMBER_TIPE: SumberTipe[] = ["CP / ATP", "eBook / Dokumen", "Teks", "Link Luar"];

export function formatTanggal(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
