import { createLocalStore, uid } from "./local-store";
import type { PaketSoal, Soal } from "./soal-types";

function q(pertanyaan: string, opsi: string[], kunci: string): Soal {
  return { id: uid(), pertanyaan, jenis: opsi.length ? "Pilihan Ganda" : "Esai", opsi, kunci };
}

function seed(): PaketSoal[] {
  const now = new Date().toISOString();
  return [
    {
      id: "paket-spl",
      judul: "Sistem Persamaan Linear",
      topik: "Sistem Persamaan Linear Dua Variabel",
      modulId: "spl-1",
      status: "Draft",
      kelas: [],
      soal: Array.from({ length: 10 }, (_, i) =>
        q(
          `Selesaikan sistem persamaan linear nomor ${i + 1} dengan metode paling efisien.`,
          ["Metode substitusi", "Metode eliminasi", "Metode grafik", "Metode coba-coba"],
          "A",
        ),
      ),
      createdAt: now,
    },
    {
      id: "paket-trigono",
      judul: "Trigonometri — Bab 2",
      topik: "Perbandingan Trigonometri",
      modulId: "trigono-1",
      status: "Terbit",
      kelas: ["X IPA 3", "XI IPA 1"],
      soal: Array.from({ length: 15 }, (_, i) =>
        q(
          `Tentukan nilai perbandingan trigonometri pada kasus nomor ${i + 1}.`,
          ["sin θ", "cos θ", "tan θ", "cot θ"],
          "B",
        ),
      ),
      createdAt: now,
    },
    {
      id: "paket-turunan",
      judul: "Turunan Fungsi",
      topik: "Turunan Fungsi Aljabar",
      modulId: "turunan-1",
      status: "Draft",
      kelas: [],
      soal: Array.from({ length: 8 }, (_, i) =>
        q(`Tentukan turunan pertama fungsi nomor ${i + 1}.`, [], "Uraikan langkah aturan pangkat dan hasil akhirnya."),
      ),
      createdAt: now,
    },
  ];
}

const store = createLocalStore<PaketSoal>("gurupro.soal", seed);

export const usePaketSoal = store.useItems;

export function addPaket(data: Omit<PaketSoal, "id" | "createdAt">) {
  const paket: PaketSoal = { ...data, id: uid(), createdAt: new Date().toISOString() };
  store.set([paket, ...store.get()]);
  return paket;
}

export function updatePaket(id: string, patch: Partial<PaketSoal>) {
  store.set(store.get().map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

export function deletePaket(id: string) {
  store.set(store.get().filter((p) => p.id !== id));
}

export function publishPaket(id: string) {
  updatePaket(id, { status: "Terbit" });
}

export function duplicatePaket(id: string) {
  const found = store.get().find((p) => p.id === id);
  if (!found) return;
  store.set([
    { ...found, id: uid(), judul: `${found.judul} (Salinan)`, status: "Draft", kelas: [], createdAt: new Date().toISOString() },
    ...store.get(),
  ]);
}

export function terbitkanSebagaiTugas(id: string, kelas: string[]) {
  const found = store.get().find((p) => p.id === id);
  if (!found) return;
  const merged = Array.from(new Set([...found.kelas, ...kelas]));
  updatePaket(id, { kelas: merged });
}
