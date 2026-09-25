import { supabase } from "@/integrations/supabase/client";

export interface PenugasanColumnItem {
  id: string;
  judul: string;
  deadline: string | null;
  status: "draft" | "published" | "closed";
  kkm: number;
  remedialEnabled: boolean;
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
  // KKM & Remedial fields
  kkm: number;
  nilaiMurni: number | null;
  nilaiRemedial: number | null;
  nilaiAktif: number | null;
  remedialPengumpulanId?: string | null;
  statusRemedial?: "tidak_ada" | "belum_mengambil" | "draft" | "submitted" | "dinilai" | null;
  catatanRemedial?: string | null;
  isTuntas?: boolean;
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
  // KKM & Remedial
  kkm: number;
  remedialEnabled: boolean;
  nilaiMurni: number | null;
  nilaiRemedial: number | null;
  nilaiAktif: number | null;
  remedialPengumpulanId?: string | null;
  statusRemedial?: "tidak_ada" | "belum_mengambil" | "draft" | "submitted" | "dinilai" | null;
  isTuntas: boolean;
  catatanRemedial?: string | null;
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
  if (!Array.isArray(scores)) return null;
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
  if (!Array.isArray(studentAverages)) return null;
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
  const userId = await currentUserId();

  // 1. Ambil info kelas dan pastikan kelas milik guru ini
  const { data: kelas, error: kelasErr } = await supabase
    .from("kelas")
    .select("id, nama_kelas, tingkat, mapel, tahun_ajaran, guru_id")
    .eq("id", kelasId)
    .maybeSingle();

  if (kelasErr) {
    console.warn("[RekapStore] Kelas query error:", kelasErr.message);
    throw new Error(`Gagal memuat data kelas: ${kelasErr.message}`);
  }

  if (!kelas) {
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
    throw new Error(`Gagal memuat anggota kelas: ${anggotaErr.message}`);
  }

  const safeAnggotaList = Array.isArray(anggotaList) ? anggotaList : [];
  const activeStudents = safeAnggotaList.map((a) => ({
    siswaId: a.siswa_id,
    siswaNama: a.siswa_nama || "Siswa",
    siswaNisn: a.siswa_nisn || "",
  }));

  // 3. Ambil seluruh penugasan untuk kelas ini (published & closed)
  const { data: tugasList, error: tugasErr } = await supabase
    .from("penugasan")
    .select("id, judul, deadline, status, created_at, kkm, remedial_enabled")
    .eq("kelas_id", kelasId)
    .eq("is_archived", false)
    .in("status", ["published", "closed"])
    .order("created_at", { ascending: true });

  if (tugasErr) {
    console.warn("[RekapStore] Gagal memuat penugasan kelas:", tugasErr.message);
    throw new Error(`Gagal memuat penugasan kelas: ${tugasErr.message}`);
  }

  const safeTugasList = Array.isArray(tugasList) ? tugasList : [];
  const daftarPenugasan: PenugasanColumnItem[] = safeTugasList.map((t) => ({
    id: t.id,
    judul: t.judul,
    deadline: t.deadline,
    status: t.status as "draft" | "published" | "closed",
    kkm: Number((t as any).kkm ?? 75),
    remedialEnabled: Boolean((t as any).remedial_enabled),
  }));

  const assignmentIds = daftarPenugasan.map((p) => p.id);

  // 4. Ambil seluruh pengumpulan (utama & remedial) untuk penugasan-penugasan kelas ini
  let pengumpulanMap: Record<string, any> = {};
  let remedialMap: Record<string, any> = {};

  if (assignmentIds.length > 0) {
    const [subRes, remRes] = await Promise.all([
      supabase
        .from("penugasan_pengumpulan")
        .select(
          "id, penugasan_id, siswa_id, status, submitted_at, nilai_pg, nilai_essay, nilai_akhir, status_penilaian, catatan_guru, graded_at",
        )
        .in("penugasan_id", assignmentIds),
      supabase
        .from("penugasan_remedial_pengumpulan")
        .select(
          "id, penugasan_id, siswa_id, original_pengumpulan_id, nilai_murni, status, submitted_at, nilai_pg, nilai_essay, nilai_akhir, status_penilaian, catatan_guru, graded_at",
        )
        .in("penugasan_id", assignmentIds),
    ]);

    if (subRes.error) {
      console.warn("[RekapStore] Gagal memuat pengumpulan:", subRes.error.message);
      throw new Error(`Gagal memuat pengumpulan siswa: ${subRes.error.message}`);
    } else if (Array.isArray(subRes.data)) {
      for (const sub of subRes.data) {
        if (sub && sub.penugasan_id && sub.siswa_id) {
          const key = `${sub.penugasan_id}:${sub.siswa_id}`;
          pengumpulanMap[key] = sub;
        }
      }
    }

    if (Array.isArray(remRes.data)) {
      for (const rem of remRes.data) {
        if (rem && rem.penugasan_id && rem.siswa_id) {
          const key = `${rem.penugasan_id}:${rem.siswa_id}`;
          remedialMap[key] = rem;
        }
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
      const rem = remedialMap[`${tugas.id}:${siswa.siswaId}`];

      if (sub) {
        const isGraded = sub.status_penilaian === "dinilai" && sub.nilai_akhir !== null;
        // Prioritaskan historical snapshot nilai_murni dari remedial jika ada
        const nilaiMurni = (rem && rem.nilai_murni !== null && rem.nilai_murni !== undefined)
          ? Number(rem.nilai_murni)
          : (isGraded ? Number(sub.nilai_akhir) : null);

        const isRemGraded = rem && rem.status_penilaian === "dinilai" && rem.nilai_akhir !== null;
        const nilaiRemedial = isRemGraded ? Number(rem.nilai_akhir) : null;

        // Nilai Aktif (Nilai Akhir): mengikuti aturan Max principle: max(Nilai Murni, Nilai Remedial)
        const nilaiAktif = (nilaiRemedial !== null && nilaiMurni !== null)
          ? Math.max(nilaiMurni, nilaiRemedial)
          : (nilaiRemedial !== null ? nilaiRemedial : nilaiMurni);

        let statusRemedial: SiswaPenugasanNilai["statusRemedial"] = "tidak_ada";
        if (tugas.remedialEnabled) {
          if (!rem) {
            statusRemedial = (nilaiMurni !== null && nilaiMurni < tugas.kkm && sub.status_penilaian === "dinilai")
              ? "belum_mengambil"
              : "tidak_ada";
          } else if (rem.status === "draft") {
            statusRemedial = "draft";
          } else if (rem.status_penilaian === "dinilai") {
            statusRemedial = "dinilai";
          } else {
            statusRemedial = "submitted";
          }
        }

        const isTuntas = nilaiAktif !== null ? nilaiAktif >= tugas.kkm : false;

        if (nilaiAktif !== null) {
          gradedScores.push(nilaiAktif);
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
          nilaiAkhir: nilaiAktif,
          nilaiPg: sub.nilai_pg !== null ? Number(sub.nilai_pg) : null,
          nilaiEssay: sub.nilai_essay !== null ? Number(sub.nilai_essay) : null,
          catatanGuru: sub.catatan_guru || null,
          submittedAt: sub.submitted_at,
          gradedAt: sub.graded_at,
          kkm: tugas.kkm,
          nilaiMurni,
          nilaiRemedial,
          nilaiAktif,
          remedialPengumpulanId: rem?.id || null,
          statusRemedial,
          catatanRemedial: rem?.catatan_guru || null,
          isTuntas,
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
          kkm: tugas.kkm,
          nilaiMurni: null,
          nilaiRemedial: null,
          nilaiAktif: null,
          statusRemedial: tugas.remedialEnabled ? "tidak_ada" : null,
          isTuntas: false,
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
  const allStudentAverages = (siswaRows || []).map((s) => s.rataRata);
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
}

/**
 * Mengambil riwayat nilai mandiri siswa yang sedang login.
 * Murni hanya membaca hasil pengumpulan milik siswa sendiri (isolasi data siswa).
 */
export async function getSiswaRiwayatNilai(siswaIdParam?: string): Promise<SiswaRiwayatNilaiItem[]> {
  const userId = siswaIdParam || (await currentUserId());

  const [subRes, remRes] = await Promise.all([
    supabase
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
          kkm,
          remedial_enabled,
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
      .order("submitted_at", { ascending: false }),
    supabase
      .from("penugasan_remedial_pengumpulan")
      .select("*")
      .eq("siswa_id", userId),
  ]);

  if (subRes.error) {
    console.warn("[RekapStore] Gagal memuat riwayat nilai siswa:", subRes.error.message);
    throw new Error(`Gagal memuat riwayat nilai siswa: ${subRes.error.message}`);
  }

  const remedialByPenugasan: Record<string, any> = {};
  if (Array.isArray(remRes.data)) {
    for (const rem of remRes.data) {
      remedialByPenugasan[rem.penugasan_id] = rem;
    }
  }

  const safeData = Array.isArray(subRes.data) ? subRes.data : [];
  return safeData.map((row: any) => {
    const penugasan = row?.penugasan;
    const kelas = penugasan?.kelas;
    const kkm = Number(penugasan?.kkm ?? 75);
    const remedialEnabled = Boolean(penugasan?.remedial_enabled);

    const nilaiMurni = row.nilai_akhir !== null ? Number(row.nilai_akhir) : null;
    const rem = remedialByPenugasan[row.penugasan_id];
    const nilaiRemedial =
      rem && rem.status_penilaian === "dinilai" && rem.nilai_akhir !== null
        ? Number(rem.nilai_akhir)
        : null;
    const nilaiAktif = nilaiRemedial !== null ? nilaiRemedial : nilaiMurni;

    let statusRemedial: SiswaRiwayatNilaiItem["statusRemedial"] = "tidak_ada";
    if (remedialEnabled) {
      if (!rem) {
        statusRemedial =
          nilaiMurni !== null && nilaiMurni < kkm && row.status_penilaian === "dinilai"
            ? "belum_mengambil"
            : "tidak_ada";
      } else if (rem.status === "draft") {
        statusRemedial = "draft";
      } else if (rem.status_penilaian === "dinilai") {
        statusRemedial = "dinilai";
      } else {
        statusRemedial = "submitted";
      }
    }

    const isTuntas = nilaiAktif !== null ? nilaiAktif >= kkm : false;

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
      nilaiAkhir: nilaiAktif,
      catatanGuru: row.catatan_guru || null,
      gradedAt: row.graded_at,
      kkm,
      remedialEnabled,
      nilaiMurni,
      nilaiRemedial,
      nilaiAktif,
      remedialPengumpulanId: rem?.id || null,
      statusRemedial,
      isTuntas,
      catatanRemedial: rem?.catatan_guru || null,
    };
  });
}
