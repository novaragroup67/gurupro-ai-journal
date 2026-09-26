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
      case "INVALID_REQUEST":
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
