export type JenisSoal = "Pilihan Ganda" | "Esai";
export type SoalStatus = "Draft" | "Terbit";
export type Tingkat = "Mudah" | "Sedang" | "Sulit";

export interface Soal {
  id: string;
  pertanyaan: string;
  jenis: JenisSoal;
  opsi: string[];
  kunci: string;
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
}

export const JENIS_SOAL: JenisSoal[] = ["Pilihan Ganda", "Esai"];
export const TINGKAT: Tingkat[] = ["Mudah", "Sedang", "Sulit"];
