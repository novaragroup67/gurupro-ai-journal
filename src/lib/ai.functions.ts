import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const MODEL = "google/gemini-3.7-flash";
const ENDPOINT = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function askAi(system: string, user: string): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("Layanan AI belum siap. Coba lagi beberapa saat.");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (res.status === 429) throw new Error("Permintaan AI terlalu banyak. Tunggu sebentar lalu coba lagi.");
  if (res.status === 402) throw new Error("Kuota AI habis. Tambahkan kredit untuk melanjutkan.");
  if (!res.ok) throw new Error(`AI gagal merespons (status ${res.status}). Coba lagi.`);

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI tidak memberikan hasil. Coba lagi.");
  return content;
}

function parseJson<T>(raw: string): T {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = cleaned.search(/[[{]/);
  const text = start > 0 ? cleaned.slice(start) : cleaned;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Hasil AI tidak dapat dibaca. Coba generate ulang.");
  }
}

export interface ModulAiSection {
  judul: string;
  poin: string[];
  isi: string;
}

export interface ModulAiResult {
  judul: string;
  ringkasan: string;
  tujuan: string[];
  sections: ModulAiSection[];
  kesimpulan: string;
  istilah: string[];
  catatanKeterbatasan?: string;
}

const MODUL_SYSTEM = `Anda perancang modul ajar SMK Indonesia. Tugas Anda menyusun modul HANYA dari materi sumber yang diberikan.
Aturan wajib:
- Semua isi harus berdasar pada sumber. Jangan menambahkan fakta, angka, atau contoh yang tidak didukung sumber.
- Pertahankan istilah penting/teknis yang muncul pada sumber (jangan diganti sinonim).
- Jika sumber tidak cukup untuk suatu bagian, tulis apa adanya dan jelaskan pada "catatanKeterbatasan". Jangan mengarang.
- Bahasa Indonesia formal, jelas, dan siap dipakai guru.
Balas HANYA JSON dengan bentuk:
{"judul":string,"ringkasan":string,"tujuan":[string],"sections":[{"judul":string,"poin":[string],"isi":string}],"kesimpulan":string,"istilah":[string],"catatanKeterbatasan":string}
Buat 3-6 sections. Setiap section: 2-5 poin kunci dan "isi" penjelasan 2-5 paragraf pendek (pakai \\n antar paragraf). Sertakan contoh hanya bila ada di sumber.`;

export const generateModulAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: {
      sumberTipe: string;
      sumberJudul?: string;
      sumberUrl?: string;
      konten: string;
      topik?: string;
      mapel?: string;
      kelas?: string;
    }) => {
      const konten = String(input?.konten ?? "").trim();
      if (konten.length < 80) {
        throw new Error("Sumber terlalu sedikit. Tambahkan materi atau gunakan sumber lain agar AI tidak mengarang.");
      }
      return { ...input, konten: konten.slice(0, 16000) };
    },
  )
  .handler(async ({ data }): Promise<ModulAiResult> => {
    const meta = [
      `Jenis sumber: ${data.sumberTipe}`,
      data.sumberJudul ? `Judul sumber: ${data.sumberJudul}` : "",
      data.sumberUrl ? `URL sumber: ${data.sumberUrl}` : "",
      data.topik ? `Topik yang diminta guru: ${data.topik}` : "",
      data.mapel ? `Mata pelajaran: ${data.mapel}` : "",
      data.kelas ? `Kelas: ${data.kelas}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const raw = await askAi(
      MODUL_SYSTEM,
      `${meta}\n\n=== ISI SUMBER (satu-satunya rujukan) ===\n${data.konten}`,
    );
    const result = parseJson<ModulAiResult>(raw);
    if (!result.sections?.length) throw new Error("AI belum menghasilkan bab modul. Coba generate ulang.");
    return {
      judul: result.judul || data.topik || data.sumberJudul || "Modul Ajar",
      ringkasan: result.ringkasan ?? "",
      tujuan: result.tujuan ?? [],
      sections: result.sections.map((s) => ({
        judul: s.judul ?? "Bagian",
        poin: Array.isArray(s.poin) ? s.poin : [],
        isi: s.isi ?? "",
      })),
      kesimpulan: result.kesimpulan ?? "",
      istilah: result.istilah ?? [],
      ...(result.catatanKeterbatasan ? { catatanKeterbatasan: result.catatanKeterbatasan } : {}),
    };
  });

export interface SoalAi {
  pertanyaan: string;
  jenis: "Pilihan Ganda" | "Esai";
  opsi: string[];
  kunci: string;
}

const SOAL_SYSTEM = `Anda guru SMK Indonesia yang menulis soal evaluasi.
Aturan wajib:
- Soal harus berdasar pada materi sumber yang diberikan (jika ada). Jangan keluar dari materi tersebut.
- Tidak boleh ada soal yang sama atau mirip (hindari duplikasi).
- Sesuaikan kedalaman dengan tingkat kesulitan yang diminta.
- Pilihan Ganda: tepat 4 opsi berbeda dan masuk akal, "kunci" berisi salah satu huruf A/B/C/D.
- Esai: "opsi" kosong dan "kunci" berisi rubrik jawaban ideal yang ringkas.
- Bahasa Indonesia baku dan jelas.
Balas HANYA JSON: {"soal":[{"pertanyaan":string,"jenis":"Pilihan Ganda"|"Esai","opsi":[string],"kunci":string}]}`;

export const generateSoalAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    topik: string;
    jumlah: number;
    tingkat: string;
    jenis: string;
    materi?: string;
  }) => {
    const topik = String(input?.topik ?? "").trim();
    if (!topik) throw new Error("Pilih modul sumber atau tulis topik/materi terlebih dahulu.");
    return {
      topik,
      jumlah: Math.max(1, Math.min(20, Number(input.jumlah) || 5)),
      tingkat: String(input.tingkat ?? "Sedang"),
      jenis: String(input.jenis ?? "Pilihan Ganda"),
      materi: String(input.materi ?? "").slice(0, 14000),
    };
  })
  .handler(async ({ data }): Promise<SoalAi[]> => {
    const raw = await askAi(
      SOAL_SYSTEM,
      [
        `Topik: ${data.topik}`,
        `Jumlah soal: ${data.jumlah}`,
        `Tingkat kesulitan: ${data.tingkat}`,
        `Jenis soal: ${data.jenis}`,
        data.materi
          ? `\n=== MATERI MODUL SUMBER (wajib jadi acuan) ===\n${data.materi}`
          : "\n(Tidak ada modul sumber: gunakan topik di atas secara umum namun tetap akurat.)",
      ].join("\n"),
    );
    const parsed = parseJson<{ soal?: SoalAi[] }>(raw);
    const list = (parsed.soal ?? []).slice(0, data.jumlah);
    if (!list.length) throw new Error("AI belum menghasilkan soal. Coba generate ulang.");
    return list.map((s) => ({
      pertanyaan: s.pertanyaan ?? "",
      jenis: s.jenis === "Esai" ? "Esai" : "Pilihan Ganda",
      opsi: s.jenis === "Esai" ? [] : (s.opsi ?? []).slice(0, 4),
      kunci: s.kunci ?? "",
    }));
  });

export const reviseSoalAi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { soal: SoalAi; instruksi: string; materi?: string }) => {
    if (!input?.soal?.pertanyaan) throw new Error("Soal tidak valid.");
    if (!String(input?.instruksi ?? "").trim()) throw new Error("Tulis instruksi revisi terlebih dahulu.");
    return { soal: input.soal, instruksi: input.instruksi, materi: String(input.materi ?? "").slice(0, 8000) };
  })
  .handler(async ({ data }): Promise<SoalAi> => {
    const raw = await askAi(
      `${SOAL_SYSTEM}\nUntuk revisi, balas HANYA JSON satu soal: {"pertanyaan":string,"jenis":"Pilihan Ganda"|"Esai","opsi":[string],"kunci":string}`,
      [
        `Instruksi guru: ${data.instruksi}`,
        `Soal saat ini: ${JSON.stringify(data.soal)}`,
        data.materi ? `\n=== MATERI SUMBER ===\n${data.materi}` : "",
      ].join("\n"),
    );
    const s = parseJson<SoalAi>(raw);
    return {
      pertanyaan: s.pertanyaan || data.soal.pertanyaan,
      jenis: s.jenis === "Esai" ? "Esai" : "Pilihan Ganda",
      opsi: s.jenis === "Esai" ? [] : (s.opsi ?? []).slice(0, 4),
      kunci: s.kunci || data.soal.kunci,
    };
  });
