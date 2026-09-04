import { uid } from "./cloud-store";
import type { JenisSoal, Soal, Tingkat } from "./soal-types";

const STEM_MUDAH = [
  (t: string) => `Apa yang dimaksud dengan ${t}?`,
  (t: string) => `Sebutkan satu contoh penerapan ${t} dalam kehidupan sehari-hari.`,
  (t: string) => `Manakah pernyataan yang benar tentang ${t}?`,
];

const STEM_SEDANG = [
  (t: string) => `Jelaskan langkah-langkah menyelesaikan persoalan ${t}.`,
  (t: string) => `Bandingkan dua pendekatan yang biasa dipakai pada ${t}.`,
  (t: string) => `Mengapa ${t} penting dikuasai sebelum melanjutkan materi berikutnya?`,
];

const STEM_SULIT = [
  (t: string) => `Analisis kasus berikut dan tentukan penyelesaian paling efisien menggunakan ${t}.`,
  (t: string) => `Evaluasi kesalahan pada penyelesaian ${t} berikut, lalu perbaiki dengan alasan.`,
  (t: string) => `Rancang persoalan baru bertema ${t} beserta penyelesaiannya.`,
];

function stems(tingkat: Tingkat) {
  if (tingkat === "Mudah") return STEM_MUDAH;
  if (tingkat === "Sulit") return STEM_SULIT;
  return STEM_SEDANG;
}

function opsiFor(topik: string, i: number, tingkat: Tingkat) {
  const base = [
    `Konsep utama ${topik} diterapkan dengan langkah yang tepat`,
    `${topik} hanya berlaku pada kasus khusus tanpa syarat`,
    `Penyelesaian ${topik} tidak memerlukan pemeriksaan hasil`,
    `${topik} tidak berkaitan dengan materi sebelumnya`,
  ];
  const rotate = (i + (tingkat === "Sulit" ? 2 : 1)) % 4;
  return base.slice(rotate).concat(base.slice(0, rotate));
}

export interface GenerateSoalInput {
  topik: string;
  jumlah: number;
  tingkat: Tingkat;
  jenis: JenisSoal;
  konteks?: string;
}

export function generateSoal(input: GenerateSoalInput): Soal[] {
  const topik = input.topik.trim() || "materi ajar";
  const list = stems(input.tingkat);
  return Array.from({ length: Math.max(1, Math.min(20, input.jumlah)) }, (_, i) => {
    const stem = list[i % list.length] as (t: string) => string;
    const pertanyaan = `${stem(topik)}${input.konteks ? ` (mengacu pada ${input.konteks})` : ""}`;
    if (input.jenis === "Esai") {
      return {
        id: uid(),
        pertanyaan,
        jenis: "Esai" as JenisSoal,
        opsi: [],
        kunci: `Jawaban ideal memuat: definisi ${topik}, langkah penyelesaian yang benar, serta contoh penerapan. Tingkat ${input.tingkat}.`,
      };
    }
    const opsi = opsiFor(topik, i, input.tingkat);
    return {
      id: uid(),
      pertanyaan,
      jenis: "Pilihan Ganda" as JenisSoal,
      opsi,
      kunci: opsi.findIndex((o) => o.startsWith(`Konsep utama`)) === 0 ? "A" : String.fromCharCode(65 + opsi.findIndex((o) => o.startsWith("Konsep utama"))),
    };
  });
}

export const INSTRUKSI_AI = [
  "Buat lebih mudah",
  "Buat lebih sulit",
  "Ganti angka",
  "Ubah bentuk pertanyaan",
];

export function reviseSoalWithAi(soal: Soal, instruksi: string): Soal {
  const ins = instruksi.toLowerCase();
  let pertanyaan = soal.pertanyaan;
  let kunci = soal.kunci;
  let opsi = [...soal.opsi];

  if (/mudah/.test(ins)) {
    pertanyaan = pertanyaan.replace(/^Analisis|^Evaluasi|^Rancang/, "Jelaskan secara sederhana") + " (versi lebih mudah)";
  } else if (/sulit|susah/.test(ins)) {
    pertanyaan = `Analisis lebih mendalam: ${pertanyaan.replace(/\s*\(versi lebih mudah\)/, "")} Sertakan alasan tiap langkah.`;
  } else if (/angka|nilai/.test(ins)) {
    const n = 2 + Math.floor(Math.random() * 18);
    const m = 3 + Math.floor(Math.random() * 24);
    pertanyaan = `${pertanyaan.replace(/\s*\(angka: [^)]*\)/, "")} (angka: gunakan ${n} dan ${m})`;
    kunci = soal.jenis === "Esai" ? `${kunci} Gunakan angka ${n} dan ${m}.` : kunci;
  } else if (/bentuk|ubah/.test(ins)) {
    if (soal.jenis === "Pilihan Ganda") {
      opsi = [];
      kunci = `Jawaban uraian: ${soal.opsi[0] ?? "uraikan konsep utama"}.`;
      return { ...soal, jenis: "Esai", pertanyaan: pertanyaan.replace(/^Manakah[^?]*\?/, "Uraikan"), opsi, kunci };
    }
    const baru = opsiFor(soal.pertanyaan.split(" ").slice(-2).join(" "), 1, "Sedang");
    return { ...soal, jenis: "Pilihan Ganda", opsi: baru, kunci: "A", pertanyaan };
  } else {
    pertanyaan = `${pertanyaan} (revisi AI: ${instruksi})`;
  }

  return { ...soal, pertanyaan, kunci, opsi };
}
