import { supabase } from "@/integrations/supabase/client";

export interface PenugasanColumnItem {
  id: string;
  judul: string;
  deadline: string | null;
  status: "draft" | "published" | "closed";
}

export interface SiswaPenugasanNilai {
  pengumpulanId?: string;
  statusPengumpulan: "draft" | "submitted" | "belum_mengumpulkan";
  statusPenilaian: "belum_dinilai" | "perlu_penilaian_manual" | "dinilai" | null;
  nilaiAkhir: number | null;
  nilaiPg: number | null;
  nilaiEssay: number | null;
  catatanGuru: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
}

export interface SiswaRekapRow {
  siswaId: string;
  siswaNama: string;
  siswaNisn: string;
  nilaiPerTugas: Record<string, SiswaPenugasanNilai>;
  rataRata: number | null; // null jika belum ada nilai yang dinilai
  totalTugasDinilai: number;
  totalTugasSelesai: number;
}

export interface KelasRekapData {
  kelasId: string;
  namaKelas: string;
  tingkat: string;
  mapel: string;
  tahunAjaran: string;
  guruId: string;
  daftarPenugasan: PenugasanColumnItem[];
  siswaRows: SiswaRekapRow[];
  totalSiswa: number;
  totalSubmissionsDinilai: number;
  rataRataKelas: number | null; // null jika belum ada nilai yang dinilai
}

export interface SiswaRiwayatNilaiItem {
  pengumpulanId: string;
  penugasanId: string;
  penugasanJudul: string;
  kelasId: string;
  kelasNama: string;
  kelasMapel: string;
  statusPengumpulan: "draft" | "submitted";
  submittedAt: string | null;
  statusPenilaian: "belum_dinilai" | "perlu_penilaian_manual" | "dinilai";
  nilaiPg: number | null;
  nilaiEssay: number | null;
  nilaiAkhir: number | null;
  catatanGuru: string | null;
  gradedAt: string | null;
}

/**
 * Mendapatkan ID pengguna yang sedang login saat ini.
 */
export async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const id = data.user?.id;
  if (!id) throw new Error("Sesi tidak valid. Silakan login kembali.");
  return id;
}

/**
 * Menghitung rata-rata nilai siswa dari nilai-nilai tugas yang sudah selesai dinilai.
 * Tugas yang belum dinilai (null/undefined/NaN) secara tegas diabaikan.
 * Nilai 0 dihitung sebagai skor sah.
 * Menghasilkan null jika tidak ada tugas yang selesai dinilai sama sekali.
 */
export function calculateStudentAverage(scores: (number | null | undefined)[]): number | null {
  const validScores = scores.filter(
    (s): s is number => typeof s === "number" && !isNaN(s) && s !== null,
  );
  if (validScores.length === 0) return null;
  const sum = validScores.reduce((acc, curr) => acc + curr, 0);
  return Math.round((sum / validScores.length) * 10) / 10;
}

/**
 * Menghitung rata-rata kelas dari kumpulan rata-rata siswa yang memiliki nilai sah.
 * Menghasilkan null jika belum ada satupun siswa yang memiliki nilai sah.
 */
export function calculateClassAverage(
  studentAverages: (number | null | undefined)[],
): number | null {
  const valid = studentAverages.filter(
    (a): a is number => typeof a === "number" && !isNaN(a) && a !== null,
  );
  if (valid.length === 0) return null;
  const sum = valid.reduce((acc, curr) => acc + curr, 0);
  return Math.round((sum / valid.length) * 10) / 10;
}

/**
 * Format representasi nilai untuk antarmuka pengguna:
 * - Menampilkan angka dengan presisi yang rapi
 * - Menampilkan "—" jika nilai null (belum dinilai)
 */
export function formatNilai(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) {
    return "—";
  }
  return Number.isInteger(val) ? String(val) : val.toFixed(1);
}

/**
 * Mengambil data rekapitulasi nilai untuk suatu kelas secara komprehensif.
 * Memvalidasi hak kepemilikan guru agar tidak dapat mengakses kelas guru lain.
 */
export async function getKelasRekapData(kelasId: string): Promise<KelasRekapData | null> {
  try {
    const userId = await currentUserId();

    // 1. Ambil info kelas dan pastikan kelas milik guru ini
    const { data: kelas, error: kelasErr } = await supabase
      .from("kelas")
      .select("id, nama_kelas, tingkat, mapel, tahun_ajaran, guru_id")
      .eq("id", kelasId)
      .maybeSingle();

    if (kelasErr || !kelas) {
      console.warn("[RekapStore] Kelas tidak ditemukan:", kelasErr?.message);
      return null;
    }

    // Teacher isolation check
    if (kelas.guru_id && kelas.guru_id !== userId) {
      console.warn("[RekapStore] Akses diblokir: bukan pemilik kelas");
      return null;
    }

    // 2. Ambil siswa aktif kelas
    const { data: anggotaList, error: anggotaErr } = await supabase
      .from("kelas_anggota")
      .select("id, siswa_id, siswa_nama, siswa_nisn, status")
      .eq("kelas_id", kelasId)
      .eq("status", "aktif")
      .order("siswa_nama", { ascending: true });

    if (anggotaErr) {
      console.warn("[RekapStore] Gagal memuat anggota kelas:", anggotaErr.message);
    }

    const activeStudents = (anggotaList || []).map((a) => ({
      siswaId: a.siswa_id,
      siswaNama: a.siswa_nama || "Siswa",
      siswaNisn: a.siswa_nisn || "",
    }));

    // 3. Ambil seluruh penugasan untuk kelas ini (published & closed)
    const { data: tugasList, error: tugasErr } = await supabase
      .from("penugasan")
      .select("id, judul, deadline, status, created_at")
      .eq("kelas_id", kelasId)
      .in("status", ["published", "closed"])
      .order("created_at", { ascending: true });

    if (tugasErr) {
      console.warn("[RekapStore] Gagal memuat penugasan kelas:", tugasErr.message);
    }

    const daftarPenugasan: PenugasanColumnItem[] = (tugasList || []).map((t) => ({
      id: t.id,
      judul: t.judul,
      deadline: t.deadline,
      status: t.status as "draft" | "published" | "closed",
    }));

    const assignmentIds = daftarPenugasan.map((p) => p.id);

    // 4. Ambil seluruh pengumpulan untuk penugasan-penugasan kelas ini
    let pengumpulanMap: Record<string, any> = {};
    if (assignmentIds.length > 0) {
      const { data: submissions, error: subErr } = await supabase
        .from("penugasan_pengumpulan")
        .select(
          "id, penugasan_id, siswa_id, status, submitted_at, nilai_pg, nilai_essay, nilai_akhir, status_penilaian, catatan_guru, graded_at",
        )
        .in("penugasan_id", assignmentIds);

      if (subErr) {
        console.warn("[RekapStore] Gagal memuat pengumpulan:", subErr.message);
      } else if (submissions) {
        for (const sub of submissions) {
          // Key gabungan: `${penugasan_id}:${siswa_id}`
          const key = `${sub.penugasan_id}:${sub.siswa_id}`;
          pengumpulanMap[key] = sub;
        }
      }
    }

    // 5. Bangun baris data per siswa
    let totalSubmissionsDinilai = 0;
    const siswaRows: SiswaRekapRow[] = activeStudents.map((siswa) => {
      const nilaiPerTugas: Record<string, SiswaPenugasanNilai> = {};
      const gradedScores: (number | null)[] = [];
      let totalTugasDinilai = 0;
      let totalTugasSelesai = 0;

      for (const tugas of daftarPenugasan) {
        const sub = pengumpulanMap[`${tugas.id}:${siswa.siswaId}`];
        if (sub) {
          const isGraded = sub.status_penilaian === "dinilai" && sub.nilai_akhir !== null;
          const nilaiAkhirNum = isGraded ? Number(sub.nilai_akhir) : null;

          if (isGraded) {
            gradedScores.push(nilaiAkhirNum);
            totalTugasDinilai++;
            totalSubmissionsDinilai++;
          }

          if (sub.status === "submitted") {
            totalTugasSelesai++;
          }

          nilaiPerTugas[tugas.id] = {
            pengumpulanId: sub.id,
            statusPengumpulan: sub.status as "draft" | "submitted",
            statusPenilaian: sub.status_penilaian || "belum_dinilai",
            nilaiAkhir: nilaiAkhirNum,
            nilaiPg: sub.nilai_pg !== null ? Number(sub.nilai_pg) : null,
            nilaiEssay: sub.nilai_essay !== null ? Number(sub.nilai_essay) : null,
            catatanGuru: sub.catatan_guru || null,
            submittedAt: sub.submitted_at,
            gradedAt: sub.graded_at,
          };
        } else {
          // Siswa belum memulai/mengumpulkan tugas ini
          nilaiPerTugas[tugas.id] = {
            statusPengumpulan: "belum_mengumpulkan",
            statusPenilaian: null,
            nilaiAkhir: null,
            nilaiPg: null,
            nilaiEssay: null,
            catatanGuru: null,
            submittedAt: null,
            gradedAt: null,
          };
        }
      }

      const rataRata = calculateStudentAverage(gradedScores);

      return {
        siswaId: siswa.siswaId,
        siswaNama: siswa.siswaNama,
        siswaNisn: siswa.siswaNisn,
        nilaiPerTugas,
        rataRata,
        totalTugasDinilai,
        totalTugasSelesai,
      };
    });

    // 6. Hitung rata-rata kelas
    const allStudentAverages = siswaRows.map((s) => s.rataRata);
    const rataRataKelas = calculateClassAverage(allStudentAverages);

    return {
      kelasId: kelas.id,
      namaKelas: kelas.nama_kelas,
      tingkat: kelas.tingkat,
      mapel: kelas.mapel,
      tahunAjaran: kelas.tahun_ajaran,
      guruId: kelas.guru_id,
      daftarPenugasan,
      siswaRows,
      totalSiswa: activeStudents.length,
      totalSubmissionsDinilai,
      rataRataKelas,
    };
  } catch (err) {
    console.error("[RekapStore] Error getKelasRekapData:", err);
    return null;
  }
}

/**
 * Mengambil riwayat nilai mandiri siswa yang sedang login.
 * Murni hanya membaca hasil pengumpulan milik siswa sendiri (isolasi data siswa).
 */
export async function getSiswaRiwayatNilai(siswaIdParam?: string): Promise<SiswaRiwayatNilaiItem[]> {
  try {
    const userId = siswaIdParam || (await currentUserId());

    const { data, error } = await supabase
      .from("penugasan_pengumpulan")
      .select(
        `
        id,
        penugasan_id,
        status,
        submitted_at,
        nilai_pg,
        nilai_essay,
        nilai_akhir,
        status_penilaian,
        catatan_guru,
        graded_at,
        penugasan:penugasan_id (
          id,
          judul,
          kelas_id,
          kelas:kelas_id (
            id,
            nama_kelas,
            mapel
          )
        )
      `,
      )
      .eq("siswa_id", userId)
      .order("submitted_at", { ascending: false });

    if (error) {
      console.warn("[RekapStore] Gagal memuat riwayat nilai siswa:", error.message);
      return [];
    }

    return (data || []).map((row: any) => {
      const penugasan = row.penugasan;
      const kelas = penugasan?.kelas;

      return {
        pengumpulanId: row.id,
        penugasanId: row.penugasan_id,
        penugasanJudul: penugasan?.judul || "Tugas",
        kelasId: penugasan?.kelas_id || "",
        kelasNama: kelas?.nama_kelas || "Kelas",
        kelasMapel: kelas?.mapel || "Mata Pelajaran",
        statusPengumpulan: row.status as "draft" | "submitted",
        submittedAt: row.submitted_at,
        statusPenilaian: (row.status_penilaian as any) || "belum_dinilai",
        nilaiPg: row.nilai_pg !== null ? Number(row.nilai_pg) : null,
        nilaiEssay: row.nilai_essay !== null ? Number(row.nilai_essay) : null,
        nilaiAkhir: row.nilai_akhir !== null ? Number(row.nilai_akhir) : null,
        catatanGuru: row.catatan_guru || null,
        gradedAt: row.graded_at,
      };
    });
  } catch (err) {
    console.error("[RekapStore] Error getSiswaRiwayatNilai:", err);
    return [];
  }
}
