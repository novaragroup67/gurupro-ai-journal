import { createLocalStore, uid } from "./local-store";
import { buatIlustrasi } from "./modul-ai";
import type { Modul, ModulSection } from "./modul-types";

function seedSection(judul: string, poin: string[], isi: string): ModulSection {
  return { id: uid(), judul, poin, isi };
}

function seed(): Modul[] {
  const now = new Date().toISOString();
  return [
    {
      id: "spl-1",
      judul: "Modul Ajar: Sistem Persamaan Linear",
      kelas: "XI IPA 1",
      mapel: "Matematika",
      status: "Terbit",
      sumberTipe: "CP / ATP",
      sumberInput: "Peserta didik dapat menyelesaikan sistem persamaan linear dua variabel.",
      ringkasan:
        "Modul menuntun siswa memahami sistem persamaan linear dua variabel melalui pemecahan masalah kuantitatif, ditutup dengan studi kasus belanja koperasi sekolah.",
      sections: [
        seedSection("Pengantar Sistem Persamaan Linear", [
          "Definisi persamaan linear dua variabel",
          "Bentuk umum dan ciri-cirinya",
          "Contoh kasus sehari-hari",
        ], "Bagian ini memperkenalkan bentuk umum ax + by = c dan situasi nyata yang bisa dimodelkan dengan dua variabel."),
        seedSection("Konsep Inti Penyelesaian", [
          "Metode substitusi",
          "Metode eliminasi",
          "Metode grafik",
        ], "Siswa membandingkan tiga metode penyelesaian dan memilih metode paling efisien untuk setiap kasus."),
        seedSection("Penerapan Sistem Persamaan Linear", [
          "Studi kasus: belanja koperasi sekolah",
          "Latihan terbimbing",
          "Latihan mandiri berjenjang",
        ], "Siswa memodelkan transaksi koperasi menjadi sistem persamaan lalu menyelesaikannya."),
      ],
      slides: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "turunan-1",
      judul: "Modul Ajar: Turunan Fungsi",
      kelas: "XI IPA 2",
      mapel: "Matematika",
      status: "Draft",
      sumberTipe: "Teks",
      sumberInput: "Turunan fungsi aljabar dan penerapannya pada laju perubahan.",
      ringkasan: "Draf modul turunan fungsi: konsep limit, aturan turunan, dan penerapan laju perubahan.",
      sections: [
        seedSection("Pengantar Turunan Fungsi", ["Gagasan laju perubahan", "Hubungan limit dan turunan"], "Turunan dipahami sebagai laju perubahan sesaat suatu fungsi."),
        seedSection("Aturan Turunan", ["Aturan pangkat", "Aturan hasil kali", "Aturan rantai"], "Siswa berlatih menurunkan fungsi aljabar dengan tiga aturan dasar."),
      ],
      slides: [],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "trigono-1",
      judul: "Modul Ajar: Trigonometri Dasar",
      kelas: "X IPA 3",
      mapel: "Matematika",
      status: "Terbit",
      sumberTipe: "eBook / Dokumen",
      sumberInput: "Buku Matematika Kelas X Bab Trigonometri",
      ringkasan: "Modul trigonometri dasar: perbandingan sudut dan sisi serta pengukuran tinggi objek.",
      sections: [
        seedSection("Pengantar Trigonometri", ["Sudut dan satuannya", "Perbandingan sisi segitiga"], "Bagian ini memperkenalkan sinus, cosinus, dan tangen pada segitiga siku-siku."),
        seedSection("Penerapan Trigonometri", ["Mengukur tinggi tiang bendera", "Latihan soal kontekstual"], "Siswa mengukur tinggi objek di sekolah memakai sudut elevasi."),
      ],
      slides: [],
      createdAt: now,
      updatedAt: now,
    },
  ];
}

const store = createLocalStore<Modul>("gurupro.modul", seed);

export const useModuls = store.useItems;

export function addModul(data: Omit<Modul, "id" | "createdAt" | "updatedAt">) {
  const now = new Date().toISOString();
  const modul: Modul = { ...data, id: uid(), createdAt: now, updatedAt: now };
  store.set([modul, ...store.get()]);
  return modul;
}

export function saveModul(modul: Modul) {
  const exists = store.get().some((m) => m.id === modul.id);
  const next = { ...modul, updatedAt: new Date().toISOString() };
  store.set(exists ? store.get().map((m) => (m.id === modul.id ? next : m)) : [next, ...store.get()]);
  return next;
}

export function deleteModul(id: string) {
  store.set(store.get().filter((m) => m.id !== id));
}

export function publishModul(id: string) {
  store.set(
    store.get().map((m) =>
      m.id === id ? { ...m, status: "Terbit" as const, updatedAt: new Date().toISOString() } : m,
    ),
  );
}

export function setIlustrasi(modulId: string, sectionId: string, ilustrasi: string | undefined) {
  store.set(
    store.get().map((m) =>
      m.id === modulId
        ? {
            ...m,
            sections: m.sections.map((s) => (s.id === sectionId ? { ...s, ilustrasi } : s)),
            updatedAt: new Date().toISOString(),
          }
        : m,
    ),
  );
}

export function generateSemuaIlustrasi(modulId: string) {
  store.set(
    store.get().map((m) =>
      m.id === modulId
        ? {
            ...m,
            sections: m.sections.map((s) => ({ ...s, ilustrasi: buatIlustrasi(s.judul, s.poin) })),
            updatedAt: new Date().toISOString(),
          }
        : m,
    ),
  );
}

export function setSlides(modulId: string, slides: Modul["slides"]) {
  store.set(
    store.get().map((m) => (m.id === modulId ? { ...m, slides, updatedAt: new Date().toISOString() } : m)),
  );
}
