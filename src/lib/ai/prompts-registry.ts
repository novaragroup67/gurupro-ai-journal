/**
 * GuruPro AI Foundation (AI-0) — Central Prompt & Template Registry
 *
 * All AI feature invocations must trace back to an explicit prompt version.
 */

export interface RegisteredPrompt {
  version: string;
  feature: string;
  description: string;
  systemPrompt: string;
  buildUserPrompt: (context: Record<string, any>) => string;
}

export const PROMPT_REGISTRY: Record<string, RegisteredPrompt> = {
  modul_ajar_grounded_v1: {
    version: "modul_ajar_grounded_v1",
    feature: "modul_ajar",
    description: "Perancang Modul Ajar SMK Kurikulum Merdeka dengan grounding ketat terhadap sumber.",
    systemPrompt: `Anda adalah Asisten Ahli Perancang Modul Ajar Kurikulum Merdeka untuk SMK di Indonesia.
Tugas Anda menyusun Modul Ajar yang 100% grounded berdasarkan fakta materi sumber yang diberikan.

ATURAN UTAMA:
1. Dasarkan seluruh konsep dan terminologi pada fakta materi sumber di dalam tag <SOURCE_MATERIAL_UNTRUSTED_DATA>.
2. JANGAN mengarang fakta yang tidak ada di dalam materi sumber. Jika suatu konsep penting tidak dijelaskan, nyatakan keterbatasan tersebut pada "catatanKeterbatasan".
3. Balas HANYA JSON murni yang valid sesuai skema yang diminta.`,
    buildUserPrompt: (ctx) => `Materi Sumber:
<SOURCE_MATERIAL_UNTRUSTED_DATA>
${ctx.sourceContent || ""}
</SOURCE_MATERIAL_UNTRUSTED_DATA>

Topik: ${ctx.topik || "Materi Kejuruan"}
Mata Pelajaran: ${ctx.mapel || "Umum"}
Kelas: ${ctx.kelas || "Fase E/F"}

Susun modul ajar lengkap dalam format JSON yang valid.`,
  },

  soal_grounded_v1: {
    version: "soal_grounded_v1",
    feature: "generator_soal",
    description: "Generator Soal Evaluasi SMK dengan grounding fakta terhadap modul sumber.",
    systemPrompt: `Anda adalah Asisten AI Ahli Evaluasi Pembelajaran SMK di Indonesia.
Tugas Anda membuat bank soal asesmen yang akurat dan grounded mengacu pada materi sumber.

ATURAN:
1. Pertanyaan harus menguji pemahaman fakta dan prosedur dari materi sumber.
2. Setiap opsi pilihan ganda harus unik, masuk akal, dan memiliki tepat satu kunci jawaban benar.
3. Balas HANYA JSON murni yang valid: {"soal": [{"pertanyaan": string, "jenis": "Pilihan Ganda" | "Esai", "opsi": string[], "kunci": string}]}`,
    buildUserPrompt: (ctx) => `Materi Sumber:
<SOURCE_MATERIAL_UNTRUSTED_DATA>
${ctx.sourceContent || ""}
</SOURCE_MATERIAL_UNTRUSTED_DATA>

Topik: ${ctx.topik}
Jumlah: ${ctx.jumlah || 5}
Tingkat Kesulitan: ${ctx.tingkat || "Sedang"}
Jenis Soal: ${ctx.jenis || "Pilihan Ganda"}`,
  },

  grounding_verify_v1: {
    version: "grounding_verify_v1",
    feature: "grounding_verify",
    description: "Pemeriksa ketercukupan fakta dan grounding klaim terhadap sumber.",
    systemPrompt: `Anda adalah verifikator fakta akademik.
Tugas Anda menentukan apakah suatu klaim didukung oleh materi sumber.
Pilihan status: "SUPPORTED", "INFERRED", atau "NOT_FOUND".
Jangan berasumsi. Jika fakta tidak tertulis di dalam sumber, status WAJIB "NOT_FOUND".`,
    buildUserPrompt: (ctx) => `Materi Sumber:
${ctx.sourceContent}

Klaim / Pertanyaan yang diverifikasi:
${ctx.claim}`,
  },

  ai_foundation_benchmark_v1: {
    version: "ai_foundation_benchmark_v1",
    feature: "ai_foundation_test",
    description: "Template pengujian verifikasi benchmark infrastruktur AI-0.",
    systemPrompt: `Anda adalah asisten AI uji infrastruktur GuruPro. Berikan respons terstruktur JSON yang valid.`,
    buildUserPrompt: (ctx) => `Uji benchmark: ${ctx.query}`,
  },
};

export function getRegisteredPrompt(version: string): RegisteredPrompt {
  const found = PROMPT_REGISTRY[version];
  if (!found) {
    throw new Error(`Versi template AI "${version}" tidak terdaftar di prompt registry.`);
  }
  return found;
}
