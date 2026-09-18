import { supabase } from "@/integrations/supabase/client";

export interface SanitizedSoal {
  id: string;
  pertanyaan: string;
  jenis: "Pilihan Ganda" | "Esai";
  opsi: string[];
}

export interface PenugasanPengumpulan {
  id: string;
  penugasanId: string;
  siswaId: string;
  status: "draft" | "submitted";
  submittedAt: string | null;
  nilaiPg: number | null;
  nilaiEssay: number | null;
  nilaiAkhir: number | null;
  statusPenilaian: "belum_dinilai" | "perlu_penilaian_manual" | "dinilai";
  catatanGuru: string | null;
  gradedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PenugasanJawaban {
  id: string;
  pengumpulanId: string;
  soalId: string;
  jawaban: string | null;
  isCorrect: boolean | null;
  skor: number | null;
  catatan: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherSubmissionItem {
  id: string;
  penugasanId: string;
  siswaId: string;
  siswaNama: string;
  siswaNisn: string;
  siswaEmail: string;
  status: "draft" | "submitted";
  submittedAt: string | null;
  nilaiPg: number | null;
  nilaiEssay: number | null;
  nilaiAkhir: number | null;
  statusPenilaian: "belum_dinilai" | "perlu_penilaian_manual" | "dinilai";
  catatanGuru: string | null;
  gradedAt: string | null;
  createdAt: string;
  jawabanCount: number;
  jawabanList: PenugasanJawaban[];
}

export async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("Sesi tidak valid. Silakan login kembali.");
  return id;
}

/**
 * Mengambil data pengumpulan milik siswa yang sedang login untuk penugasan tertentu.
 */
export async function getMySubmission(penugasanId: string): Promise<PenugasanPengumpulan | null> {
  try {
    const userId = await currentUserId();

    const { data, error } = await supabase
      .from("penugasan_pengumpulan")
      .select("*")
      .eq("penugasan_id", penugasanId)
      .eq("siswa_id", userId)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.warn("[Pengumpulan] Gagal memuat data pengumpulan:", error.message);
      return null;
    }

    if (!data) return null;

    return {
      id: data.id,
      penugasanId: data.penugasan_id,
      siswaId: data.siswa_id,
      status: data.status as "draft" | "submitted",
      submittedAt: data.submitted_at,
      nilaiPg: data.nilai_pg !== null ? Number(data.nilai_pg) : null,
      nilaiEssay: data.nilai_essay !== null ? Number(data.nilai_essay) : null,
      nilaiAkhir: data.nilai_akhir !== null ? Number(data.nilai_akhir) : null,
      statusPenilaian: (data.status_penilaian as any) || "belum_dinilai",
      catatanGuru: data.catatan_guru,
      gradedAt: data.graded_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
  } catch (err) {
    console.error("[Pengumpulan] Error getMySubmission:", err);
    return null;
  }
}

/**
 * Membuat record draf pengumpulan baru untuk siswa yang sedang login.
 */
export async function createDraftSubmission(
  penugasanId: string,
): Promise<{ ok: true; submission: PenugasanPengumpulan } | { ok: false; message: string }> {
  try {
    const userId = await currentUserId();

    // 1. Cek apakah sudah ada pengumpulan sebelumnya
    const existing = await getMySubmission(penugasanId);
    if (existing) {
      return { ok: true, submission: existing };
    }

    // 2. Insert draf pengumpulan baru
    const { data, error } = await supabase
      .from("penugasan_pengumpulan")
      .insert({
        penugasan_id: penugasanId,
        siswa_id: userId,
        status: "draft",
      })
      .select()
      .single();

    if (error) {
      // Jika error karena deadline lewat atau RLS
      return {
        ok: false,
        message:
          error.message ||
          "Gagal memulai pengerjaan tugas. Periksa apakah tenggat waktu telah berakhir.",
      };
    }

    return {
      ok: true,
      submission: {
        id: data.id,
        penugasanId: data.penugasan_id,
        siswaId: data.siswa_id,
        status: data.status as "draft" | "submitted",
        submittedAt: data.submitted_at,
        nilaiPg: data.nilai_pg !== null ? Number(data.nilai_pg) : null,
        nilaiEssay: data.nilai_essay !== null ? Number(data.nilai_essay) : null,
        nilaiAkhir: data.nilai_akhir !== null ? Number(data.nilai_akhir) : null,
        statusPenilaian: (data.status_penilaian as any) || "belum_dinilai",
        catatanGuru: data.catatan_guru,
        gradedAt: data.graded_at,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal memulai tugas.";
    return { ok: false, message: msg };
  }
}

/**
 * Mengambil butir soal dari paket_soal untuk siswa secara aman (kunci jawaban dibuang).
 */
export async function getSoalForSiswa(penugasanId: string): Promise<SanitizedSoal[]> {
  try {
    // Coba panggil RPC khusus sanitasi soal
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_penugasan_soal_for_siswa", {
      _penugasan_id: penugasanId,
    });

    if (!rpcError && rpcData && Array.isArray(rpcData)) {
      return rpcData.map((s: any) => ({
        id: String(s.id),
        pertanyaan: String(s.pertanyaan || ""),
        jenis: s.jenis === "Esai" ? "Esai" : "Pilihan Ganda",
        opsi: Array.isArray(s.opsi) ? s.opsi.map(String) : [],
      }));
    }

    // Fallback bila RPC gagal: ambil lewat penugasan join paket_soal dan sanitasi lokal
    const { data: pData, error: pError } = await supabase
      .from("penugasan")
      .select(
        `
        id,
        paket_soal:paket_soal_id (
          id,
          soal
        )
      `,
      )
      .eq("id", penugasanId)
      .single();

    if (pError || !pData) return [];

    const rawSoal = (pData as any).paket_soal?.soal;
    if (!Array.isArray(rawSoal)) return [];

    return rawSoal.map((s: any) => ({
      id: String(s.id),
      pertanyaan: String(s.pertanyaan || ""),
      jenis: s.jenis === "Esai" ? "Esai" : "Pilihan Ganda",
      opsi: Array.isArray(s.opsi) ? s.opsi.map(String) : [],
    }));
  } catch (err) {
    console.error("[Pengumpulan] Error getSoalForSiswa:", err);
    return [];
  }
}

/**
 * Mengambil daftar jawaban yang sudah tersimpan untuk pengumpulan tertentu.
 */
export async function getMyAnswers(pengumpulanId: string): Promise<PenugasanJawaban[]> {
  try {
    const { data, error } = await supabase
      .from("penugasan_jawaban")
      .select("*")
      .eq("pengumpulan_id", pengumpulanId);

    if (error) {
      console.warn("[Pengumpulan] Gagal memuat jawaban:", error.message);
      return [];
    }

    return (data || []).map((row) => ({
      id: row.id,
      pengumpulanId: row.pengumpulan_id,
      soalId: row.soal_id,
      jawaban: row.jawaban,
      isCorrect: row.is_correct ?? null,
      skor: row.skor !== null ? Number(row.skor) : null,
      catatan: row.catatan ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    console.error("[Pengumpulan] Error getMyAnswers:", err);
    return [];
  }
}

/**
 * Menyimpan satu jawaban siswa (upsert) ke database Supabase.
 */
export async function saveAnswer(
  pengumpulanId: string,
  soalId: string,
  jawaban: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const cleanJawaban = jawaban ? jawaban.trim() : null;

    const { error } = await supabase.from("penugasan_jawaban").upsert(
      {
        pengumpulan_id: pengumpulanId,
        soal_id: soalId,
        jawaban: cleanJawaban,
      },
      { onConflict: "pengumpulan_id, soal_id" },
    );

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal menyimpan jawaban.";
    return { ok: false, message: msg };
  }
}

/**
 * Menyimpan banyak jawaban siswa sekaligus.
 */
export async function saveAnswers(
  pengumpulanId: string,
  answers: Record<string, string>,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const rows = Object.entries(answers).map(([soalId, ans]) => ({
      pengumpulan_id: pengumpulanId,
      soal_id: soalId,
      jawaban: ans ? ans.trim() : null,
    }));

    if (rows.length === 0) return { ok: true };

    const { error } = await supabase.from("penugasan_jawaban").upsert(rows, {
      onConflict: "pengumpulan_id, soal_id",
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal menyimpan jawaban.";
    return { ok: false, message: msg };
  }
}

/**
 * Mengirimkan (submit) penugasan siswa secara final.
 */
export async function submitAssignment(
  pengumpulanId: string,
): Promise<{ ok: true; submittedAt: string } | { ok: false; message: string }> {
  try {
    // Pengumpulan WAJIB melalui RPC atomik submit_penugasan (fail-closed, tanpa bypass client)
    const { data: rpcData, error: rpcError } = await supabase.rpc("submit_penugasan", {
      _pengumpulan_id: pengumpulanId,
    });

    if (rpcError) {
      return { ok: false, message: rpcError.message };
    }

    if (rpcData && typeof rpcData === "object") {
      const res = rpcData as any;
      if (res.ok) {
        return { ok: true, submittedAt: res.submitted_at || new Date().toISOString() };
      }
      return { ok: false, message: res.message || "Gagal mengumpulkan tugas." };
    }

    return { ok: false, message: "Respon server tidak valid saat pengumpulan tugas." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal mengumpulkan tugas.";
    return { ok: false, message: msg };
  }
}

/**
 * Mengambil seluruh pengumpulan siswa untuk penugasan tertentu (Hanya Guru).
 */
export async function getTeacherSubmissions(penugasanId: string): Promise<TeacherSubmissionItem[]> {
  try {
    await currentUserId();

    const { data, error } = await supabase
      .from("penugasan_pengumpulan")
      .select(
        `
        id,
        penugasan_id,
        siswa_id,
        status,
        submitted_at,
        nilai_pg,
        nilai_essay,
        nilai_akhir,
        status_penilaian,
        catatan_guru,
        graded_at,
        created_at,
        profile:siswa_id (
          id,
          nama,
          email,
          nisn
        ),
        jawaban:penugasan_jawaban (
          id,
          pengumpulan_id,
          soal_id,
          jawaban,
          is_correct,
          skor,
          catatan,
          created_at,
          updated_at
        )
      `,
      )
      .eq("penugasan_id", penugasanId)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[Pengumpulan] Gagal memuat pengumpulan guru:", error.message);
      return [];
    }

    return (data || []).map((row: any) => {
      const profile = row.profile;
      const jawabanList = Array.isArray(row.jawaban) ? row.jawaban : [];

      return {
        id: row.id,
        penugasanId: row.penugasan_id,
        siswaId: row.siswa_id,
        siswaNama: profile?.nama || "Siswa",
        siswaNisn: profile?.nisn || "",
        siswaEmail: profile?.email || "",
        status: row.status as "draft" | "submitted",
        submittedAt: row.submitted_at,
        nilaiPg: row.nilai_pg !== null ? Number(row.nilai_pg) : null,
        nilaiEssay: row.nilai_essay !== null ? Number(row.nilai_essay) : null,
        nilaiAkhir: row.nilai_akhir !== null ? Number(row.nilai_akhir) : null,
        statusPenilaian: (row.status_penilaian as any) || "belum_dinilai",
        catatanGuru: row.catatan_guru,
        gradedAt: row.graded_at,
        createdAt: row.created_at,
        jawabanCount: jawabanList.length,
        jawabanList: jawabanList.map((j: any) => ({
          id: j.id,
          pengumpulanId: j.pengumpulan_id,
          soalId: j.soal_id,
          jawaban: j.jawaban,
          isCorrect: j.is_correct ?? null,
          skor: j.skor !== null ? Number(j.skor) : null,
          catatan: j.catatan ?? null,
          createdAt: j.created_at,
          updatedAt: j.updated_at,
        })),
      };
    });
  } catch (err) {
    console.error("[Pengumpulan] Error getTeacherSubmissions:", err);
    return [];
  }
}

/**
 * Menyimpan penilaian dari guru untuk tugas siswa (nilai esai & umpan balik).
 */
export async function gradeSubmission(
  pengumpulanId: string,
  input: {
    nilaiEssay: number;
    catatanGuru?: string;
    detailJawaban?: Array<{ soalId: string; skor: number; catatan?: string }>;
  },
): Promise<
  { ok: true; nilaiAkhir: number; statusPenilaian: string } | { ok: false; message: string }
> {
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc("simpan_penilaian_guru", {
      _pengumpulan_id: pengumpulanId,
      _nilai_essay: input.nilaiEssay,
      _catatan_guru: input.catatanGuru || "",
      _detail_jawaban: (input.detailJawaban || []).map((d) => ({
        soal_id: d.soalId,
        skor: d.skor,
        catatan: d.catatan || null,
      })),
    });

    if (!rpcError && rpcData && typeof rpcData === "object") {
      const res = rpcData as any;
      if (res.ok) {
        return {
          ok: true,
          nilaiAkhir: Number(res.nilai_akhir),
          statusPenilaian: String(res.status_penilaian || "dinilai"),
        };
      }
    }

    if (rpcError) {
      return { ok: false, message: rpcError.message };
    }

    return { ok: true, nilaiAkhir: input.nilaiEssay, statusPenilaian: "dinilai" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Gagal menyimpan penilaian.";
    return { ok: false, message: msg };
  }
}

/**
 * Mengambil paket soal lengkap termasuk kunci jawaban untuk keperluan penilaian guru.
 */
export async function getTeacherPaketSoal(paketSoalId: string) {
  try {
    const { data, error } = await supabase
      .from("paket_soal")
      .select("id, judul, soal")
      .eq("id", paketSoalId)
      .single();

    if (error || !data) return null;

    return {
      id: data.id,
      judul: data.judul,
      soal: Array.isArray(data.soal) ? (data.soal as any[]) : [],
    };
  } catch {
    return null;
  }
}

/**
 * Mengambil ringkasan pengumpulan untuk semua penugasan guru.
 */
export async function getTeacherSubmissionsSummary(): Promise<{
  totalSubmitted: number;
  perluDinilai: number;
  sudahDinilai: number;
  submissionsPerPenugasan: Record<string, { submitted: number; perluDinilai: number; dinilai: number }>;
}> {
  try {
    const { data, error } = await supabase
      .from("penugasan_pengumpulan")
      .select("id, penugasan_id, status, status_penilaian");

    if (error) {
      console.warn("[Pengumpulan] Gagal memuat ringkasan pengumpulan guru:", error.message);
      return { totalSubmitted: 0, perluDinilai: 0, sudahDinilai: 0, submissionsPerPenugasan: {} };
    }

    let totalSubmitted = 0;
    let perluDinilai = 0;
    let sudahDinilai = 0;
    const submissionsPerPenugasan: Record<string, { submitted: number; perluDinilai: number; dinilai: number }> = {};

    for (const row of data || []) {
      const pid = row.penugasan_id;
      if (!submissionsPerPenugasan[pid]) {
        submissionsPerPenugasan[pid] = { submitted: 0, perluDinilai: 0, dinilai: 0 };
      }
      if (row.status === "submitted") {
        totalSubmitted++;
        submissionsPerPenugasan[pid].submitted++;
        if (row.status_penilaian === "dinilai") {
          sudahDinilai++;
          submissionsPerPenugasan[pid].dinilai++;
        } else {
          perluDinilai++;
          submissionsPerPenugasan[pid].perluDinilai++;
        }
      }
    }

    return { totalSubmitted, perluDinilai, sudahDinilai, submissionsPerPenugasan };
  } catch (err) {
    console.error("[Pengumpulan] Error getTeacherSubmissionsSummary:", err);
    return { totalSubmitted: 0, perluDinilai: 0, sudahDinilai: 0, submissionsPerPenugasan: {} };
  }
}

/**
 * Mengambil semua submission siswa yang sudah dinilai milik siswa yang sedang login.
 */
export async function getMyGradedSubmissions(): Promise<Array<{
  penugasanId: string;
  nilaiAkhir: number | null;
  nilaiPg: number | null;
  nilaiEssay: number | null;
  catatanGuru: string | null;
  gradedAt: string | null;
}>> {
  try {
    const userId = await currentUserId();
    const { data, error } = await supabase
      .from("penugasan_pengumpulan")
      .select("penugasan_id, nilai_akhir, nilai_pg, nilai_essay, catatan_guru, graded_at")
      .eq("siswa_id", userId)
      .eq("status_penilaian", "dinilai")
      .order("graded_at", { ascending: false });

    if (error) {
      console.warn("[Pengumpulan] Gagal memuat pengumpulan dinilai siswa:", error.message);
      return [];
    }

    return (data || []).map((row) => ({
      penugasanId: row.penugasan_id,
      nilaiAkhir: row.nilai_akhir !== null ? Number(row.nilai_akhir) : null,
      nilaiPg: row.nilai_pg !== null ? Number(row.nilai_pg) : null,
      nilaiEssay: row.nilai_essay !== null ? Number(row.nilai_essay) : null,
      catatanGuru: row.catatan_guru,
      gradedAt: row.graded_at,
    }));
  } catch (err) {
    console.error("[Pengumpulan] Error getMyGradedSubmissions:", err);
    return [];
  }
}

