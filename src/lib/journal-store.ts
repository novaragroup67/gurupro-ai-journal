import { useCallback, useSyncExternalStore } from "react";

import type { Journal, JournalDraft } from "./journal-types";

const STORAGE_KEY = "gurupro.journals.v1";

const SEED: Journal[] = [
  {
    id: "seed-1",
    tanggal: isoDaysAgo(1),
    jam: "07:30 - 09:00",
    mataPelajaran: "Basis Data",
    kelas: "XI RPL 1",
    materi: "Konsep Database Relasional",
    tujuan:
      "Peserta didik mampu menjelaskan konsep database relasional serta mengidentifikasi tabel, relasi, dan primary key.",
    metode: "Project Based Learning",
    aktivitas:
      "Pendahuluan: apersepsi tentang penyimpanan data sekolah. Inti: siswa memetakan entitas dan relasi pada studi kasus perpustakaan, lalu menyusun ERD sederhana. Penutup: presentasi hasil kelompok dan penguatan konsep.",
    partisipasi:
      "28 dari 32 siswa aktif berdiskusi, 4 siswa masih perlu pendampingan saat menentukan primary key.",
    kondisiKelas: "Kondusif",
    penilaian: "Penilaian proses melalui observasi kerja kelompok dan produk ERD.",
    refleksi:
      "Penggunaan studi kasus nyata membuat siswa lebih cepat memahami relasi antar tabel.",
    tindakLanjut: "Pertemuan berikutnya melanjutkan normalisasi tabel hingga bentuk 3NF.",
    catatan: "Perlu menyiapkan lembar kerja ERD tambahan untuk kelompok yang lambat.",
    source: "AI",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    id: "seed-2",
    tanggal: isoDaysAgo(2),
    jam: "09:15 - 10:45",
    mataPelajaran: "Pemrograman Web",
    kelas: "XI RPL 2",
    materi: "Layouting dengan Flexbox",
    tujuan: "Peserta didik mampu membuat layout halaman web responsif menggunakan Flexbox.",
    metode: "Praktikum Terbimbing",
    aktivitas:
      "Demonstrasi properti flex-direction dan justify-content, dilanjutkan praktik membuat kartu produk responsif.",
    partisipasi: "Siswa antusias, 90% menyelesaikan latihan praktik tepat waktu.",
    kondisiKelas: "Sangat kondusif",
    penilaian: "Penilaian keterampilan dari hasil praktik layout.",
    refleksi: "Latihan bertahap membantu siswa memahami perbedaan main axis dan cross axis.",
    tindakLanjut: "Melanjutkan ke CSS Grid dan media query.",
    catatan: "Dua unit komputer perlu perbaikan.",
    source: "Manual",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    id: "seed-3",
    tanggal: isoDaysAgo(4),
    jam: "13:00 - 14:30",
    mataPelajaran: "Jaringan Komputer",
    kelas: "XI TKJ 1",
    materi: "Pengalamatan IP dan Subnetting",
    tujuan: "Peserta didik mampu menghitung subnet mask dan menentukan rentang host.",
    metode: "Problem Based Learning",
    aktivitas:
      "Siswa memecahkan kasus pembagian jaringan laboratorium sekolah menjadi beberapa subnet.",
    partisipasi: "Diskusi kelompok berjalan baik, sebagian siswa masih keliru pada perhitungan biner.",
    kondisiKelas: "Cukup kondusif",
    penilaian: "Kuis singkat 5 soal subnetting.",
    refleksi: "Perlu lebih banyak latihan konversi biner sebelum masuk subnetting lanjutan.",
    tindakLanjut: "Memberikan latihan mandiri konversi biner-desimal.",
    catatan: "Tiga siswa izin mengikuti lomba.",
    source: "AI",
    createdAt: new Date(Date.now() - 4 * 86400000).toISOString(),
  },
];

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

let journals: Journal[] = SEED;
let hydrated = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(journals));
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Journal[];
      if (Array.isArray(parsed)) journals = parsed;
    } else {
      persist();
    }
  } catch {
    journals = SEED;
  }
  emit();
}

function subscribe(listener: () => void) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return journals;
}

function getServerSnapshot() {
  return SEED;
}

function sortJournals(list: Journal[]) {
  return [...list].sort((a, b) => (a.tanggal < b.tanggal ? 1 : a.tanggal > b.tanggal ? -1 : 0));
}

export function addJournal(draft: JournalDraft): Journal {
  const journal: Journal = {
    ...draft,
    id: `jr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
  };
  journals = [journal, ...journals];
  persist();
  emit();
  return journal;
}

export function updateJournal(id: string, patch: Partial<JournalDraft>) {
  journals = journals.map((j) => (j.id === id ? { ...j, ...patch } : j));
  persist();
  emit();
}

export function deleteJournal(id: string) {
  journals = journals.filter((j) => j.id !== id);
  persist();
  emit();
}

export function useJournals() {
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return sortJournals(list);
}

export function useJournal(id: string) {
  const list = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useCallback(() => list.find((j) => j.id === id), [list, id])();
}
