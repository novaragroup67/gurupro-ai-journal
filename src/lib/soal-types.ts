export type JenisSoal = "Pilihan Ganda" | "Esai";
export type SoalStatus = "Draft" | "Terbit";
export type Tingkat = "Mudah" | "Sedang" | "Sulit";

export interface Soal {
  id: string;
  pertanyaan: string;
  jenis: JenisSoal;
  opsi: string[];
  kunci: string;
  penjelasan?: string;
  tingkat?: Tingkat;
  tujuanPembelajaranId?: string;
  evidenceIds?: string[];
  teacherEdited?: boolean;
}

export interface PaketSoal {
  id: string;
  judul: string;
  topik: string;
  modulId?: string | undefined;
  status: SoalStatus;
  kelas: string[];
  soal: Soal[];
  createdAt: string;
  updatedAt?: string | undefined;
  isArchived?: boolean | undefined;
  archivedAt?: string | null | undefined;
  archivedBy?: string | null | undefined;
  ai_metadata?: Record<string, unknown> | null | undefined;
  teacherEdited?: boolean | undefined;
  publishedAt?: string | undefined;
  publishedBy?: string | undefined;
}

export const JENIS_SOAL: JenisSoal[] = ["Pilihan Ganda", "Esai"];
export const TINGKAT: Tingkat[] = ["Mudah", "Sedang", "Sulit"];
