/**
 * GuruPro AI Foundation (AI-0) — Error Taxonomy & Normalization
 */

export const AI_ERROR_CODES = {
  AUTH_ERROR: "AUTH_ERROR",
  ROLE_FORBIDDEN: "ROLE_FORBIDDEN",
  INVALID_REQUEST: "INVALID_REQUEST",
  SOURCE_VALIDATION_ERROR: "SOURCE_VALIDATION_ERROR",
  SOURCE_FETCH_ERROR: "SOURCE_FETCH_ERROR",
  SOURCE_PARSE_ERROR: "SOURCE_PARSE_ERROR",
  SOURCE_EMPTY: "SOURCE_EMPTY",
  SOURCE_TOO_LARGE: "SOURCE_TOO_LARGE",
  RETRIEVAL_ERROR: "RETRIEVAL_ERROR",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
  GROUNDING_FAILED: "GROUNDING_FAILED",
  AI_PROVIDER_ERROR: "AI_PROVIDER_ERROR",
  AI_TIMEOUT: "AI_TIMEOUT",
  AI_RATE_LIMIT: "AI_RATE_LIMIT",
  AI_OUTPUT_INVALID: "AI_OUTPUT_INVALID",
  PROVIDER_MALFORMED_OUTPUT: "PROVIDER_MALFORMED_OUTPUT",
  AI_GROUNDING_ERROR: "AI_GROUNDING_ERROR",
  PERSISTENCE_ERROR: "PERSISTENCE_ERROR",
  UNSUPPORTED_FACTUAL_CLAIM: "UNSUPPORTED_FACTUAL_CLAIM",
  SOURCE_CONFLICT: "SOURCE_CONFLICT",
  PEDAGOGICAL_VALIDATION_FAILED: "PEDAGOGICAL_VALIDATION_FAILED",
  QUALITY_VALIDATION_FAILED: "QUALITY_VALIDATION_FAILED",
  QUESTION_SCHEMA_INVALID: "QUESTION_SCHEMA_INVALID",
  QUESTION_TYPE_UNSUPPORTED: "QUESTION_TYPE_UNSUPPORTED",
  ANSWER_KEY_INVALID: "ANSWER_KEY_INVALID",
  QUESTION_GROUNDING_FAILED: "QUESTION_GROUNDING_FAILED",
  QUESTION_GENERATION_FAILED: "QUESTION_GENERATION_FAILED",
  QUESTION_COUNT_MISMATCH: "QUESTION_COUNT_MISMATCH",
  QUESTION_QUALITY_VALIDATION_FAILED: "QUESTION_QUALITY_VALIDATION_FAILED",
  QUESTION_QUALITY_UNCERTAIN: "QUESTION_QUALITY_UNCERTAIN",
  PLAN_NOT_FOUND: "PLAN_NOT_FOUND",
  PLAN_NOT_APPROVED: "PLAN_NOT_APPROVED",
  STALE_APPROVAL: "STALE_APPROVAL",
  INVALID_OUTLINE: "INVALID_OUTLINE",
  INVALID_STYLE: "INVALID_STYLE",
  INVALID_PARAMETERS: "INVALID_PARAMETERS",
  MISSING_GROUNDING: "MISSING_GROUNDING",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  GENERATION_FAILED: "GENERATION_FAILED",
  PRESENTATION_GENERATION_FAILED: "PRESENTATION_GENERATION_FAILED",
  PRESENTATION_VALIDATION_FAILED: "PRESENTATION_VALIDATION_FAILED",
  PRESENTATION_GROUNDING_FAILED: "PRESENTATION_GROUNDING_FAILED",
  PRESENTATION_SEMANTIC_REJECTED: "PRESENTATION_SEMANTIC_REJECTED",
  PRESENTATION_REVISION_FAILED: "PRESENTATION_REVISION_FAILED",
  PRESENTATION_STALE_REQUEST: "PRESENTATION_STALE_REQUEST",
  PRESENTATION_INVALID_OUTPUT: "PRESENTATION_INVALID_OUTPUT",
} as const;

export type AiErrorCode = (typeof AI_ERROR_CODES)[keyof typeof AI_ERROR_CODES];

const USER_MESSAGES: Record<AiErrorCode, string> = {
  AUTH_ERROR: "Sesi login Anda tidak valid atau telah berakhir. Silakan masuk kembali.",
  ROLE_FORBIDDEN: "Operasi AI ini hanya diizinkan untuk peran Guru terverifikasi.",
  INVALID_REQUEST: "Format permintaan AI tidak valid atau parameter wajib belum terisi.",
  SOURCE_VALIDATION_ERROR: "Format sumber materi tidak valid atau mengandung protokol berbahaya.",
  SOURCE_FETCH_ERROR: "Gagal membaca tautan sumber. Periksa apakah link dapat diakses publik.",
  SOURCE_PARSE_ERROR: "Konten sumber tidak dapat diekstrak atau format tidak terbaca.",
  SOURCE_EMPTY: "Isi materi sumber terlalu sedikit atau kosong. Masukkan materi yang memadai.",
  SOURCE_TOO_LARGE: "Ukuran konten sumber melebihi batas maksimal (maksimal 2MB).",
  RETRIEVAL_ERROR: "Gagal mengambil potongan konteks materi sumber yang sesuai.",
  INSUFFICIENT_EVIDENCE: "Materi sumber yang dipilih tidak mencakup bukti yang memadai untuk topik pembelajaran yang diminta.",
  GROUNDING_FAILED: "Validasi grounding gagal. Output AI merujuk pada bukti yang tidak valid atau di luar materi sumber.",
  AI_PROVIDER_ERROR: "Layanan penyedia AI sedang mengalami kendala. Silakan coba kembali sesaat lagi.",
  AI_TIMEOUT: "Permintaan AI melebihi batas waktu maksimal. Gunakan materi yang lebih ringkas.",
  AI_RATE_LIMIT: "Frekuensi permintaan AI melebihi batas wajar. Mohon tunggu sejenak.",
  AI_OUTPUT_INVALID: "Hasil respons AI tidak memenuhi skema format yang diharapkan.",
  PROVIDER_MALFORMED_OUTPUT: "Keluaran penyedia AI tidak memenuhi struktur JSON atau skema kanonikal yang diharapkan.",
  AI_GROUNDING_ERROR: "Fakta yang diminta tidak ditemukan di dalam materi sumber acuan.",
  PERSISTENCE_ERROR: "Terjadi kesalahan saat menyimpan snapshot data sumber ke basis data.",
  UNSUPPORTED_FACTUAL_CLAIM: "Draf Modul Ajar memuat klaim atau data teknis yang tidak didukung oleh materi sumber.",
  SOURCE_CONFLICT: "Draf Modul Ajar memuat data yang saling bertentangan antar-sumber rujukan tanpa catatan klarifikasi.",
  PEDAGOGICAL_VALIDATION_FAILED: "Draf Modul Ajar tidak memenuhi standar pedagogis atau urutan fase pembelajaran yang konsisten.",
  QUALITY_VALIDATION_FAILED: "Draf Modul Ajar gagal memenuhi kriteria penjaminan mutu dan grounding AI-2D.",
  QUESTION_SCHEMA_INVALID: "Skema butir soal tidak valid atau tidak memenuhi kontrak kanonikal yang ditentukan.",
  QUESTION_TYPE_UNSUPPORTED: "Jenis soal tidak didukung oleh sistem (hanya Pilihan Ganda dan Esai yang didukung).",
  ANSWER_KEY_INVALID: "Kunci jawaban soal tidak valid atau tidak merujuk pada opsi yang tersedia.",
  QUESTION_GROUNDING_FAILED: "Butir soal atau kunci jawaban merujuk pada bukti yang tidak valid atau di luar materi sumber.",
  QUESTION_GENERATION_FAILED: "Gagal menghasilkan butir soal yang memenuhi standar kanonikal.",
  QUESTION_COUNT_MISMATCH: "Jumlah butir soal yang dihasilkan AI tidak sesuai dengan target yang diminta.",
  QUESTION_QUALITY_VALIDATION_FAILED: "Paket butir soal gagal memenuhi standar mutu semantik, ketepatan kunci, atau grounding materi sumber.",
  QUESTION_QUALITY_UNCERTAIN: "Sistem validasi tidak dapat memastikan kebenaran kunci jawaban berdasarkan materi sumber yang tersedia.",
  PLAN_NOT_FOUND: "Rencana generasi materi ajar tidak ditemukan.",
  PLAN_NOT_APPROVED: "Rencana generasi belum disetujui oleh guru. Harap setujui rencana terlebih dahulu.",
  STALE_APPROVAL: "Persetujuan rencana generasi telah usang karena outline atau gaya visual telah diubah setelah persetujuan.",
  INVALID_OUTLINE: "Struktur outline generasi materi tidak valid atau tidak memenuhi skema kanonikal.",
  INVALID_STYLE: "Gaya visual yang dipilih tidak terdaftar dalam katalog atau tidak sesuai dengan target generasi.",
  INVALID_PARAMETERS: "Parameter generasi gambar (resolusi, rasio aspek, atau jumlah gambar) tidak valid.",
  MISSING_GROUNDING: "Konteks atau bukti materi rujukan tidak ditemukan untuk menyusun permintaan generasi.",
  PROVIDER_UNAVAILABLE: "Layanan penyedia AI gambar saat ini tidak tersedia atau dalam pemeliharaan.",
  GENERATION_FAILED: "Proses pembuatan generasi visual gagal dijalankan.",
  PRESENTATION_GENERATION_FAILED: "Proses pembuatan konten presentasi pembelajaran AI gagal dijalankan.",
  PRESENTATION_VALIDATION_FAILED: "Validasi deterministik struktur konten presentasi gagal.",
  PRESENTATION_GROUNDING_FAILED: "Konten slide presentasi memuat klaim atau nilai fakta yang tidak didukung bukti materi rujukan.",
  PRESENTATION_SEMANTIC_REJECTED: "Evaluasi mutu semantik menolak konten presentasi karena ketidaksesuaian pedagogis atau outline yang fatal.",
  PRESENTATION_REVISION_FAILED: "Proses perbaikan konten presentasi (bounded retry) gagal menghasilkan konten yang valid.",
  PRESENTATION_STALE_REQUEST: "Permintaan generasi presentasi telah kedaluwarsa atau tidak sesuai dengan versi aktif outline.",
  PRESENTATION_INVALID_OUTPUT: "Respons penyedia AI untuk presentasi tidak sesuai dengan struktur JSON terstruktur kanonikal.",
};

export class AiServiceError extends Error {
  public readonly code: AiErrorCode;
  public readonly statusCode: number;
  public readonly isRetryable: boolean;
  public readonly userMessage: string;
  public readonly details?: unknown;

  constructor(code: AiErrorCode, customMessage?: string, details?: unknown) {
    const defaultMsg = USER_MESSAGES[code] || "Terjadi kesalahan pada layanan AI.";
    const message = customMessage || defaultMsg;
    super(message);
    this.name = "AiServiceError";
    this.code = code;
    this.userMessage = message;
    this.details = details;

    switch (code) {
      case "AUTH_ERROR":
        this.statusCode = 401;
        this.isRetryable = false;
        break;
      case "ROLE_FORBIDDEN":
        this.statusCode = 403;
        this.isRetryable = false;
        break;
      case "PLAN_NOT_FOUND":
        this.statusCode = 404;
        this.isRetryable = false;
        break;
      case "STALE_APPROVAL":
        this.statusCode = 409;
        this.isRetryable = false;
        break;
      case "INVALID_REQUEST":
      case "INVALID_PARAMETERS":
      case "SOURCE_VALIDATION_ERROR":
      case "SOURCE_EMPTY":
      case "SOURCE_TOO_LARGE":
        this.statusCode = 400;
        this.isRetryable = false;
        break;
      case "SOURCE_FETCH_ERROR":
      case "SOURCE_PARSE_ERROR":
      case "RETRIEVAL_ERROR":
      case "INSUFFICIENT_EVIDENCE":
      case "GROUNDING_FAILED":
      case "PROVIDER_MALFORMED_OUTPUT":
      case "PERSISTENCE_ERROR":
      case "AI_OUTPUT_INVALID":
      case "AI_GROUNDING_ERROR":
      case "UNSUPPORTED_FACTUAL_CLAIM":
      case "SOURCE_CONFLICT":
      case "PEDAGOGICAL_VALIDATION_FAILED":
      case "QUALITY_VALIDATION_FAILED":
      case "QUESTION_SCHEMA_INVALID":
      case "QUESTION_TYPE_UNSUPPORTED":
      case "ANSWER_KEY_INVALID":
      case "QUESTION_GROUNDING_FAILED":
      case "QUESTION_GENERATION_FAILED":
      case "QUESTION_COUNT_MISMATCH":
      case "QUESTION_QUALITY_VALIDATION_FAILED":
      case "QUESTION_QUALITY_UNCERTAIN":
      case "PLAN_NOT_APPROVED":
      case "INVALID_OUTLINE":
      case "INVALID_STYLE":
      case "MISSING_GROUNDING":
        this.statusCode = 422;
        this.isRetryable = false;
        break;
      case "AI_RATE_LIMIT":
        this.statusCode = 429;
        this.isRetryable = true;
        break;
      case "AI_TIMEOUT":
        this.statusCode = 504;
        this.isRetryable = true;
        break;
      case "PROVIDER_UNAVAILABLE":
        this.statusCode = 503;
        this.isRetryable = true;
        break;
      case "GENERATION_FAILED":
      case "AI_PROVIDER_ERROR":
      default:
        this.statusCode = 502;
        this.isRetryable = true;
        break;
    }
  }

  public toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      isRetryable: this.isRetryable,
    };
  }
}

/**
 * Sanitizes any raw exception into a canonical AiServiceError
 * with zero secret leakage.
 */
export function normalizeAiError(err: unknown): AiServiceError {
  if (err instanceof AiServiceError) {
    return err;
  }

  const rawMsg = err instanceof Error ? err.message : String(err);
  const lower = rawMsg.toLowerCase();

  // Strip potential keys or credentials from raw error messages
  const sanitizedMsg = rawMsg
    .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]{8,}/gi, "$1[REDACTED]")
    .replace(/(api[-_]?key[:=]\s*)[a-zA-Z0-9_\-\.]{8,}/gi, "$1[REDACTED]")
    .replace(/(ai:key:)[a-zA-Z0-9_\-\.]{8,}/gi, "$1[REDACTED]");

  if (lower.includes("timeout") || lower.includes("aborted") || lower.includes("abort")) {
    return new AiServiceError(AI_ERROR_CODES.AI_TIMEOUT, undefined, sanitizedMsg);
  }
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("terlalu banyak")) {
    return new AiServiceError(AI_ERROR_CODES.AI_RATE_LIMIT, undefined, sanitizedMsg);
  }
  if (lower.includes("unauthorized") || lower.includes("401") || lower.includes("api key tidak valid")) {
    return new AiServiceError(AI_ERROR_CODES.AUTH_ERROR, undefined, sanitizedMsg);
  }
  if (lower.includes("forbidden") || lower.includes("403") || lower.includes("peran guru")) {
    return new AiServiceError(AI_ERROR_CODES.ROLE_FORBIDDEN, undefined, sanitizedMsg);
  }
  if (lower.includes("ssrf") || lower.includes("internal/lokal") || lower.includes("private ip")) {
    return new AiServiceError(AI_ERROR_CODES.SOURCE_VALIDATION_ERROR, "Tautan internal atau alamat lokal diblokir untuk keamanan.");
  }
  if (lower.includes("terlalu sedikit") || lower.includes("kosong")) {
    return new AiServiceError(AI_ERROR_CODES.SOURCE_EMPTY, undefined, sanitizedMsg);
  }
  if (lower.includes("terlalu besar") || lower.includes("2mb")) {
    return new AiServiceError(AI_ERROR_CODES.SOURCE_TOO_LARGE, undefined, sanitizedMsg);
  }
  if (lower.includes("tipe konten") || lower.includes("tidak didukung") || lower.includes("unsupported") || lower.includes("parse") || lower.includes("bukan teks") || lower.includes("tidak terbaca") || lower.includes("unreadable")) {
    return new AiServiceError(AI_ERROR_CODES.SOURCE_PARSE_ERROR, undefined, sanitizedMsg);
  }
  if (lower.includes("grounding") || lower.includes("fakta tidak ditemukan")) {
    return new AiServiceError(AI_ERROR_CODES.AI_GROUNDING_ERROR, undefined, sanitizedMsg);
  }
  if (lower.includes("json") || lower.includes("schema tidak valid") || lower.includes("output tidak valid")) {
    return new AiServiceError(AI_ERROR_CODES.AI_OUTPUT_INVALID, undefined, sanitizedMsg);
  }
  if (lower.includes("fetch") || lower.includes("gagal diakses") || lower.includes("domain")) {
    return new AiServiceError(AI_ERROR_CODES.SOURCE_FETCH_ERROR, undefined, sanitizedMsg);
  }

  return new AiServiceError(AI_ERROR_CODES.AI_PROVIDER_ERROR, undefined, sanitizedMsg);
}
