export interface Notifikasi {
  id: string;
  judul: string;
  detail: string;
  waktu: string;
  tipe: "tugas" | "modul" | "verifikasi";
}

export const NOTIFIKASI: Notifikasi[] = [
  {
    id: "n1",
    judul: "12 tugas baru masuk",
    detail: "Kelas XI IPA 1 — Sistem Persamaan Linear",
    waktu: "5 menit lalu",
    tipe: "tugas",
  },
  {
    id: "n2",
    judul: "Modul berhasil dipublikasikan",
    detail: "Modul Ajar: Trigonometri Dasar kini terbit",
    waktu: "1 jam lalu",
    tipe: "modul",
  },
  {
    id: "n3",
    judul: "3 siswa menunggu verifikasi",
    detail: "Permintaan akun baru dari kelas X IPA 3",
    waktu: "Kemarin",
    tipe: "verifikasi",
  },
];
