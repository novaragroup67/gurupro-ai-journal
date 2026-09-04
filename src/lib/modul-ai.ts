import { uid } from "./cloud-store";
import type { Modul, ModulSection, Slide, SumberTipe } from "./modul-types";

const KEYWORD_MAP: Array<{ match: RegExp; konteks: string; contoh: string }> = [
  { match: /(persamaan|linear|aljabar|matematika)/i, konteks: "pemecahan masalah kuantitatif", contoh: "menyelesaikan sistem persamaan dua variabel dari kasus belanja koperasi sekolah" },
  { match: /(trigonometri|sudut|sinus|cosinus)/i, konteks: "perbandingan sudut dan sisi", contoh: "mengukur tinggi tiang bendera memakai perbandingan trigonometri" },
  { match: /(turunan|limit|integral|kalkulus)/i, konteks: "laju perubahan fungsi", contoh: "menghitung kecepatan sesaat dari grafik posisi terhadap waktu" },
  { match: /(database|basis data|sql|query)/i, konteks: "pengelolaan data terstruktur", contoh: "merancang tabel siswa lalu menampilkan datanya dengan query SELECT" },
  { match: /(web|html|css|javascript)/i, konteks: "pengembangan antarmuka web", contoh: "membuat halaman profil sekolah yang responsif" },
  { match: /(jaringan|network|ip|router)/i, konteks: "komunikasi antarperangkat", contoh: "mengonfigurasi pengalamatan IP pada dua PC dalam satu switch" },
  { match: /(biologi|sel|ekosistem)/i, konteks: "sistem kehidupan", contoh: "mengamati komponen ekosistem di lingkungan sekolah" },
  { match: /(sejarah|kemerdekaan|kerajaan)/i, konteks: "hubungan sebab-akibat peristiwa", contoh: "menyusun garis waktu peristiwa penting beserta dampaknya" },
];

function konteksOf(topik: string) {
  const found = KEYWORD_MAP.find((k) => k.match.test(topik));
  return found ?? {
    konteks: "konsep dasar dan penerapannya",
    contoh: `menerapkan konsep ${topik.toLowerCase() || "materi ini"} pada situasi nyata di sekitar siswa`,
  };
}

export interface GenerateModulInput {
  sumberTipe: SumberTipe;
  sumberInput: string;
  topik: string;
}

const BAB_TEMPLATE = [
  { judul: (t: string) => `Pengantar ${t}`, poin: (t: string, k: string) => [`Definisi dan cakupan ${t}`, `Mengapa ${t} penting dipelajari`, `Kaitan ${t} dengan ${k}`] },
  { judul: (t: string) => `Konsep Inti ${t}`, poin: (t: string) => [`Istilah kunci pada ${t}`, `Langkah kerja/prosedur utama`, `Kesalahan umum yang perlu dihindari`] },
  { judul: (t: string) => `Penerapan ${t}`, poin: (_t: string, _k: string, c: string) => [`Studi kasus: ${c}`, "Latihan terbimbing bersama guru", "Latihan mandiri berjenjang"] },
  { judul: (t: string) => `Evaluasi & Refleksi ${t}`, poin: (t: string) => [`Rangkuman capaian pembelajaran ${t}`, "Soal evaluasi ketercapaian", "Refleksi & rencana tindak lanjut"] },
];

function paragraf(bab: string, poin: string[], topik: string, konteks: string) {
  return [
    `${bab} membahas ${topik.toLowerCase()} dengan penekanan pada ${konteks}. Bagian ini disusun agar siswa bergerak dari pemahaman konsep menuju penerapan nyata.`,
    ...poin.map((p, i) => `${i + 1}. ${p}. Guru memandu diskusi singkat, siswa mencatat temuan, lalu hasilnya dibahas bersama.`),
    `Di akhir bagian ini siswa diminta menyimpulkan ${topik.toLowerCase()} dengan bahasa sendiri sebagai bukti pemahaman.`,
  ].join("\n\n");
}

function sumberLabel(tipe: SumberTipe, input: string) {
  const trimmed = input.trim().slice(0, 120);
  switch (tipe) {
    case "CP / ATP":
      return `Diturunkan dari capaian pembelajaran: "${trimmed}"`;
    case "eBook / Dokumen":
      return `Diringkas dari dokumen: ${trimmed || "dokumen terunggah"}`;
    case "Link Luar":
      return `Dirujuk dari tautan: ${trimmed}`;
    default:
      return `Disusun dari catatan guru: "${trimmed}"`;
  }
}

export function extractTopik(input: string) {
  const clean = input.replace(/https?:\/\/\S*/g, " ").replace(/[\n\r]+/g, " ").trim();
  const words = clean.split(/\s+/).filter((w) => w.length > 3 && !/^(untuk|dengan|dalam|yang|pada|siswa|kelas|materi|modul|tentang)$/i.test(w));
  const picked = words.slice(0, 4).join(" ");
  return (picked || "Materi Ajar").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function generateModul(input: GenerateModulInput): Omit<Modul, "id" | "createdAt" | "updatedAt"> {
  const topik = (input.topik.trim() || extractTopik(input.sumberInput)).trim();
  const { konteks, contoh } = konteksOf(topik + " " + input.sumberInput);

  const sections: ModulSection[] = BAB_TEMPLATE.map((bab) => {
    const judul = bab.judul(topik);
    const poin = bab.poin(topik, konteks, contoh);
    return { id: uid(), judul, poin, isi: paragraf(judul, poin, topik, konteks) };
  });

  return {
    judul: `Modul Ajar: ${topik}`,
    kelas: "",
    mapel: "",
    status: "Draft",
    sumberTipe: input.sumberTipe,
    sumberInput: input.sumberInput,
    ringkasan: `${sumberLabel(input.sumberTipe, input.sumberInput)}. Modul ini menuntun siswa memahami ${topik.toLowerCase()} melalui ${konteks}, ditutup dengan contoh penerapan: ${contoh}.`,
    sections,
    slides: [],
  };
}

export function reviseModulWithAi(modul: Modul, instruksi: string): Modul {
  const ins = instruksi.toLowerCase();
  const tweak = (text: string) => {
    if (/sederhana|mudah|ringkas/.test(ins))
      return text.replace(/\n\n/g, "\n\n").split("\n\n").slice(0, 3).join("\n\n") + "\n\nCatatan AI: bahasa disederhanakan agar mudah dipahami siswa.";
    if (/detail|lengkap|dalam|perluas/.test(ins))
      return text + `\n\nPenjelasan tambahan (AI): bagian ini diperluas dengan contoh bertingkat, pertanyaan pemandu, serta latihan tambahan untuk siswa yang butuh penguatan.`;
    if (/praktik|proyek|aktivitas/.test(ins))
      return text + `\n\nAktivitas praktik (AI): siswa bekerja dalam kelompok 3-4 orang menyelesaikan tugas terapan, lalu mempresentasikan hasilnya 5 menit.`;
    return text + `\n\nRevisi AI sesuai instruksi "${instruksi}".`;
  };

  return {
    ...modul,
    sections: modul.sections.map((s) => ({ ...s, isi: tweak(s.isi) })),
    ringkasan: `${modul.ringkasan} (Direvisi AI: ${instruksi})`,
    updatedAt: new Date().toISOString(),
  };
}

const PALETTES = [
  ["#0D1B3D", "#2563EB", "#60A5FA"],
  ["#0D1B3D", "#FF8A00", "#60A5FA"],
  ["#2563EB", "#60A5FA", "#FF8A00"],
  ["#0D1B3D", "#2563EB", "#FF8A00"],
];

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) % 100000;
  return h;
}

/** Deterministic local "AI" illustration: contextual SVG diagram per sub-heading. */
export function buatIlustrasi(judul: string, poin: string[], nonce = 0) {
  const seed = hash(judul + nonce);
  const palette = PALETTES[seed % PALETTES.length] as string[];
  const shapes: string[] = [];
  const count = 3 + (seed % 3);
  for (let i = 0; i < count; i += 1) {
    const c = palette[(seed + i) % palette.length];
    const x = 40 + i * (520 / count);
    const h = 60 + ((seed >> (i + 1)) % 90);
    if ((seed + i) % 3 === 0) {
      shapes.push(`<circle cx="${x + 40}" cy="${240 - h / 2}" r="${28 + (h % 26)}" fill="${c}" opacity="0.85"/>`);
    } else if ((seed + i) % 3 === 1) {
      shapes.push(`<rect x="${x}" y="${250 - h}" width="72" height="${h}" rx="12" fill="${c}" opacity="0.9"/>`);
    } else {
      shapes.push(`<polygon points="${x},250 ${x + 40},${250 - h} ${x + 80},250" fill="${c}" opacity="0.88"/>`);
    }
  }
  const label = judul.length > 44 ? judul.slice(0, 41) + "…" : judul;
  const sub = (poin[0] ?? "Ilustrasi kontekstual").slice(0, 58);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
<defs><linearGradient id="bg${seed}" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#F4F7FF"/><stop offset="1" stop-color="#E6EDFF"/></linearGradient></defs>
<rect width="640" height="360" fill="url(#bg${seed})"/>
<line x1="40" y1="250" x2="600" y2="250" stroke="#0D1B3D" stroke-opacity="0.25" stroke-width="3"/>
${shapes.join("")}
<text x="40" y="60" font-family="Poppins, Arial, sans-serif" font-size="26" font-weight="700" fill="#0D1B3D">${escapeXml(label)}</text>
<text x="40" y="92" font-family="Inter, Arial, sans-serif" font-size="16" fill="#2563EB">${escapeXml(sub)}</text>
<text x="40" y="320" font-family="Inter, Arial, sans-serif" font-size="13" fill="#0D1B3D" opacity="0.55">Ilustrasi dibuat GuruPro AI (prototipe)</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function escapeXml(text: string) {
  return text.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string,
  );
}

export function buatSlides(modul: Modul): Slide[] {
  const intro: Slide = {
    id: uid(),
    judul: modul.judul,
    bullets: [modul.kelas || "Kelas/mapel diisi di editor", "Disusun otomatis oleh GuruPro AI", `${modul.sections.length} bagian materi`],
    ilustrasi: buatIlustrasi(modul.judul, ["Slide pembuka"]),
  };
  const body = modul.sections.flatMap<Slide>((s) => [
    { id: uid(), judul: s.judul, bullets: s.poin, ilustrasi: s.ilustrasi ?? buatIlustrasi(s.judul, s.poin) },
  ]);
  const closing: Slide = {
    id: uid(),
    judul: "Penutup & Tindak Lanjut",
    bullets: ["Rangkuman poin utama", "Tugas/latihan lanjutan", "Refleksi siswa"],
    ilustrasi: buatIlustrasi("Penutup " + modul.judul, ["Refleksi dan tindak lanjut"]),
  };
  return [intro, ...body, closing];
}
