export type JournalSource = "AI" | "Manual";

export interface Journal {
  id: string;
  tanggal: string; // yyyy-mm-dd
  jam: string;
  mataPelajaran: string;
  kelas: string;
  materi: string;
  tujuan: string;
  metode: string;
  aktivitas: string;
  partisipasi: string;
  kondisiKelas: string;
  penilaian: string;
  refleksi: string;
  tindakLanjut: string;
  catatan: string;
  source: JournalSource;
  createdAt: string;
}

export type JournalDraft = Omit<Journal, "id" | "createdAt">;

export const MATA_PELAJARAN = [
  "Basis Data",
  "Pemrograman Web",
  "Pemrograman Berorientasi Objek",
  "Jaringan Komputer",
  "Matematika",
  "Bahasa Indonesia",
  "Bahasa Inggris",
  "Projek IPAS",
  "Kewirausahaan",
];

export const KELAS = [
  "X RPL 1",
  "X RPL 2",
  "XI RPL 1",
  "XI RPL 2",
  "XI TKJ 1",
  "XII RPL 1",
  "XII TKJ 2",
];

export const METODE = [
  "Ceramah Interaktif",
  "Diskusi Kelompok",
  "Project Based Learning",
  "Problem Based Learning",
  "Praktikum Terbimbing",
  "Demonstrasi",
];

export const KONDISI_KELAS = [
  "Sangat kondusif",
  "Kondusif",
  "Cukup kondusif",
  "Kurang kondusif",
];

export function emptyDraft(): JournalDraft {
  return {
    tanggal: new Date().toISOString().slice(0, 10),
    jam: "",
    mataPelajaran: "",
    kelas: "",
    materi: "",
    tujuan: "",
    metode: "",
    aktivitas: "",
    partisipasi: "",
    kondisiKelas: "",
    penilaian: "",
    refleksi: "",
    tindakLanjut: "",
    catatan: "",
    source: "Manual",
  };
}

export function formatTanggal(value: string) {
  const date = new Date(value + "T00:00:00");
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
