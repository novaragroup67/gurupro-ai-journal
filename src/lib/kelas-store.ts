import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Kelas {
  id: string;
  namaKelas: string;
  tingkat: string;
  mapel: string;
  tahunAjaran: string;
  guruId: string;
  kodeKelas: string;
  createdAt: string;
}

export interface AnggotaKelas {
  id: string;
  kelasId: string;
  siswaId: string;
  siswaEmail: string;
  siswaNama: string;
  siswaNisn: string;
  status: "menunggu" | "aktif" | "ditolak";
  jenis: "akun-baru" | "tambah-kelas";
  diajukan: string;
}

export type AnggotaItem = AnggotaKelas & {
  namaKelas: string;
  mapel: string;
  tingkat: string;
};

// Local cache for synchronous UI rendering with useSyncExternalStore
let cachedKelasList: Kelas[] = [];
let cachedAnggotaList: AnggotaKelas[] = [];
const listeners = new Set<() => void>();
const emitChange = () => listeners.forEach((l) => l());

function singkatMapel(mapel: string): string {
  const map: Record<string, string> = {
    matematika: "MTK",
    fisika: "FIS",
    kimia: "KIM",
    biologi: "BIO",
    bahasaindonesia: "BIN",
    bahasainggris: "BIG",
    informatika: "INF",
    sejarah: "SEJ",
  };
  const normalized = mapel.toLowerCase().replace(/\s+/g, "");
  if (map[normalized]) return map[normalized];
  const words = mapel.trim().split(/\s+/);
  if (words.length >= 2) {
    return words
      .slice(0, 3)
      .map((w) => (w[0] ?? "").toUpperCase())
      .join("");
  }
  return mapel.slice(0, 3).toUpperCase() || "MPL";
}

function randomCodeSegment(length = 4): string {
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateKodeKelas(tingkat: string, mapel: string): string {
  const t = (tingkat.trim().toUpperCase() || "X").replace(/[^A-Z0-9]/g, "");
  const m = singkatMapel(mapel);
  const r = randomCodeSegment(4);
  return `${t}-${m}-${r}`;
}

// Fetch all classes from Supabase
export async function refreshKelasList(): Promise<Kelas[]> {
  try {
    const { data, error } = await supabase
      .from("kelas")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[Kelas] Error fetching classes:", error.message);
      return cachedKelasList;
    }

    cachedKelasList = (data || []).map((row) => ({
      id: row.id,
      namaKelas: row.nama_kelas,
      tingkat: row.tingkat,
      mapel: row.mapel,
      tahunAjaran: row.tahun_ajaran,
      guruId: row.guru_id,
      kodeKelas: row.kode_kelas,
      createdAt: row.created_at,
    }));
    emitChange();
    return cachedKelasList;
  } catch (err) {
    console.error("[Kelas] Unexpected error:", err);
    return cachedKelasList;
  }
}

// Fetch all members from Supabase
export async function refreshAnggotaList(): Promise<AnggotaKelas[]> {
  try {
    const { data, error } = await supabase
      .from("kelas_anggota")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("[Kelas] Error fetching members:", error.message);
      return cachedAnggotaList;
    }

    cachedAnggotaList = (data || []).map((row) => ({
      id: row.id,
      kelasId: row.kelas_id,
      siswaId: row.siswa_id,
      siswaEmail: row.siswa_email,
      siswaNama: row.siswa_nama,
      siswaNisn: row.siswa_nisn,
      status: (row.status as "menunggu" | "aktif" | "ditolak") || "menunggu",
      jenis: (row.jenis as "akun-baru" | "tambah-kelas") || "tambah-kelas",
      diajukan: row.created_at,
    }));
    emitChange();
    return cachedAnggotaList;
  } catch (err) {
    console.error("[Kelas] Unexpected error:", err);
    return cachedAnggotaList;
  }
}

// Create new class in Supabase
export async function buatKelas(data: {
  namaKelas: string;
  tingkat: string;
  mapel: string;
  tahunAjaran: string;
  guruId: string;
}): Promise<Kelas> {
  const kode = generateKodeKelas(data.tingkat, data.mapel);

  const { data: inserted, error } = await supabase
    .from("kelas")
    .insert({
      nama_kelas: data.namaKelas.trim(),
      tingkat: data.tingkat.trim(),
      mapel: data.mapel.trim(),
      tahun_ajaran: data.tahunAjaran.trim(),
      guru_id: data.guruId,
      kode_kelas: kode,
    })
    .select()
    .single();

  if (error || !inserted) {
    throw new Error(error?.message || "Gagal membuat kelas di database.");
  }

  const newKelas: Kelas = {
    id: inserted.id,
    namaKelas: inserted.nama_kelas,
    tingkat: inserted.tingkat,
    mapel: inserted.mapel,
    tahunAjaran: inserted.tahun_ajaran,
    guruId: inserted.guru_id,
    kodeKelas: inserted.kode_kelas,
    createdAt: inserted.created_at,
  };

  cachedKelasList = [newKelas, ...cachedKelasList.filter((k) => k.id !== newKelas.id)];
  emitChange();
  return newKelas;
}

// Regenerate class code in Supabase
export async function perbaruiKodeKelas(id: string): Promise<Kelas | null> {
  const target = cachedKelasList.find((k) => k.id === id);
  if (!target) return null;

  const newKode = generateKodeKelas(target.tingkat, target.mapel);

  const { data: updated, error } = await supabase
    .from("kelas")
    .update({ kode_kelas: newKode })
    .eq("id", id)
    .select()
    .single();

  if (error || !updated) {
    throw new Error(error?.message || "Gagal memperbarui kode kelas.");
  }

  const updatedKelas: Kelas = {
    id: updated.id,
    namaKelas: updated.nama_kelas,
    tingkat: updated.tingkat,
    mapel: updated.mapel,
    tahunAjaran: updated.tahun_ajaran,
    guruId: updated.guru_id,
    kodeKelas: updated.kode_kelas,
    createdAt: updated.created_at,
  };

  cachedKelasList = cachedKelasList.map((k) => (k.id === id ? updatedKelas : k));
  emitChange();
  return updatedKelas;
}

export async function getKelasByKode(kodeKelas: string): Promise<Kelas | null> {
  const cleanKode = kodeKelas.trim().toUpperCase();
  const { data, error } = await supabase
    .from("kelas")
    .select("*")
    .ilike("kode_kelas", cleanKode)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    namaKelas: data.nama_kelas,
    tingkat: data.tingkat,
    mapel: data.mapel,
    tahunAjaran: data.tahun_ajaran,
    guruId: data.guru_id,
    kodeKelas: data.kode_kelas,
    createdAt: data.created_at,
  };
}

export async function getKelasById(id: string): Promise<Kelas | null> {
  const cached = cachedKelasList.find((k) => k.id === id);
  if (cached) return cached;

  try {
    const { data, error } = await supabase.from("kelas").select("*").eq("id", id).maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      namaKelas: data.nama_kelas,
      tingkat: data.tingkat,
      mapel: data.mapel,
      tahunAjaran: data.tahun_ajaran,
      guruId: data.guru_id,
      kodeKelas: data.kode_kelas,
      createdAt: data.created_at,
    };
  } catch {
    return null;
  }
}

export async function getKelasByGuru(guruId: string): Promise<Kelas[]> {
  try {
    const { data, error } = await supabase
      .from("kelas")
      .select("*")
      .eq("guru_id", guruId)
      .order("created_at", { ascending: false });

    if (error || !data) {
      return cachedKelasList.filter((k) => k.guruId === guruId);
    }

    const list: Kelas[] = data.map((row) => ({
      id: row.id,
      namaKelas: row.nama_kelas,
      tingkat: row.tingkat,
      mapel: row.mapel,
      tahunAjaran: row.tahun_ajaran,
      guruId: row.guru_id,
      kodeKelas: row.kode_kelas,
      createdAt: row.created_at,
    }));

    const otherKelas = cachedKelasList.filter((k) => k.guruId !== guruId);
    cachedKelasList = [...list, ...otherKelas];
    emitChange();

    return list;
  } catch {
    return cachedKelasList.filter((k) => k.guruId === guruId);
  }
}

export async function getAnggotaByKelas(kelasId: string): Promise<AnggotaKelas[]> {
  try {
    const { data, error } = await supabase
      .from("kelas_anggota")
      .select("*")
      .eq("kelas_id", kelasId)
      .order("created_at", { ascending: false });

    if (error || !data) {
      return cachedAnggotaList.filter((a) => a.kelasId === kelasId);
    }

    const list: AnggotaKelas[] = data.map((row) => ({
      id: row.id,
      kelasId: row.kelas_id,
      siswaId: row.siswa_id,
      siswaEmail: row.siswa_email,
      siswaNama: row.siswa_nama,
      siswaNisn: row.siswa_nisn,
      status: (row.status as "menunggu" | "aktif" | "ditolak") || "menunggu",
      jenis: (row.jenis as "akun-baru" | "tambah-kelas") || "tambah-kelas",
      diajukan: row.created_at,
    }));

    const otherAnggota = cachedAnggotaList.filter((a) => a.kelasId !== kelasId);
    cachedAnggotaList = [...list, ...otherAnggota];
    emitChange();

    return list;
  } catch {
    return cachedAnggotaList.filter((a) => a.kelasId === kelasId);
  }
}

export async function ajukanGabung(data: {
  kodeKelas: string;
  siswaId: string;
  siswaEmail: string;
  siswaNama: string;
  siswaNisn: string;
  jenis?: "akun-baru" | "tambah-kelas";
}): Promise<
  | { ok: true; kelas: Kelas }
  | { ok: false; reason: "invalid-code" | "already-member" | "error"; message: string }
> {
  try {
    // 1. Validasi kode kelas di database Supabase
    const cleanKode = data.kodeKelas.trim().toUpperCase();
    const { data: kelasRow, error: kelasError } = await supabase
      .from("kelas")
      .select("*")
      .ilike("kode_kelas", cleanKode)
      .maybeSingle();

    if (kelasError || !kelasRow) {
      return {
        ok: false,
        reason: "invalid-code",
        message: "Kode kelas tidak valid atau tidak ditemukan. Periksa kembali kode dari gurumu.",
      };
    }

    // 2. Cegah duplikasi keanggotaan / permohonan kelas
    const { data: existing, error: checkError } = await supabase
      .from("kelas_anggota")
      .select("*")
      .eq("kelas_id", kelasRow.id)
      .eq("siswa_id", data.siswaId)
      .maybeSingle();

    if (checkError && checkError.code !== "PGRST116") {
      console.warn("[Kelas] Duplicate check warning:", checkError.message);
    }

    if (existing) {
      const statusText =
        existing.status === "aktif"
          ? "Anda sudah menjadi anggota kelas ini."
          : existing.status === "menunggu"
            ? "Permintaan bergabung sedang menunggu verifikasi guru."
            : "Permintaan Anda sebelumnya telah ditolak oleh guru.";

      return {
        ok: false,
        reason: "already-member",
        message: `Tidak dapat mengajukan kembali: ${statusText}`,
      };
    }

    // 3. Masukkan record baru ke tabel kelas_anggota
    const { data: inserted, error: insertError } = await supabase
      .from("kelas_anggota")
      .insert({
        kelas_id: kelasRow.id,
        siswa_id: data.siswaId,
        status: "menunggu",
        jenis: data.jenis || "tambah-kelas",
        siswa_email: data.siswaEmail.trim().toLowerCase(),
        siswa_nama: data.siswaNama.trim(),
        siswa_nisn: data.siswaNisn.trim(),
      })
      .select()
      .single();

    if (insertError || !inserted) {
      return {
        ok: false,
        reason: "error",
        message: insertError?.message || "Gagal mengajukan permintaan gabung kelas.",
      };
    }

    const targetKelas: Kelas = {
      id: kelasRow.id,
      namaKelas: kelasRow.nama_kelas,
      tingkat: kelasRow.tingkat,
      mapel: kelasRow.mapel,
      tahunAjaran: kelasRow.tahun_ajaran,
      guruId: kelasRow.guru_id,
      kodeKelas: kelasRow.kode_kelas,
      createdAt: kelasRow.created_at,
    };

    // Refresh cache
    await refreshAnggotaList();

    return { ok: true, kelas: targetKelas };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memproses permintaan.";
    return { ok: false, reason: "error", message: msg };
  }
}

export async function setujuiAnggota(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from("kelas_anggota").update({ status: "aktif" }).eq("id", id);

    if (error) {
      console.error("[Kelas] Error approving member:", error.message);
      return false;
    }

    cachedAnggotaList = cachedAnggotaList.map((a) => (a.id === id ? { ...a, status: "aktif" } : a));
    emitChange();
    return true;
  } catch {
    return false;
  }
}

export async function tolakAnggota(id: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("kelas_anggota")
      .update({ status: "ditolak" })
      .eq("id", id);

    if (error) {
      console.error("[Kelas] Error rejecting member:", error.message);
      return false;
    }

    cachedAnggotaList = cachedAnggotaList.map((a) =>
      a.id === id ? { ...a, status: "ditolak" } : a,
    );
    emitChange();
    return true;
  } catch {
    return false;
  }
}

export async function getKelasBySiswa(siswaId: string): Promise<
  Array<{
    anggotaId: string;
    kelasId: string;
    namaKelas: string;
    tingkat: string;
    mapel: string;
    tahunAjaran: string;
    status: "menunggu" | "aktif" | "ditolak";
    diajukan: string;
  }>
> {
  try {
    const { data: anggotaRows, error: aErr } = await supabase
      .from("kelas_anggota")
      .select("*")
      .eq("siswa_id", siswaId)
      .order("created_at", { ascending: false });

    if (aErr || !anggotaRows || anggotaRows.length === 0) return [];

    const kelasIds = Array.from(new Set(anggotaRows.map((a) => a.kelas_id)));
    const { data: kelasRows, error: kErr } = await supabase
      .from("kelas")
      .select("*")
      .in("id", kelasIds);

    if (kErr || !kelasRows) return [];

    const kelasMap = new Map(kelasRows.map((k) => [k.id, k]));

    return anggotaRows.map((a) => {
      const k = kelasMap.get(a.kelas_id);
      return {
        anggotaId: a.id,
        kelasId: a.kelas_id,
        namaKelas: k?.nama_kelas || "Kelas",
        tingkat: k?.tingkat || "-",
        mapel: k?.mapel || "-",
        tahunAjaran: k?.tahun_ajaran || "-",
        status: (a.status as "menunggu" | "aktif" | "ditolak") || "menunggu",
        diajukan: a.created_at,
      };
    });
  } catch {
    return [];
  }
}

export function useKelas() {
  const kelasList = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cachedKelasList,
    () => cachedKelasList,
  );

  const anggotaList = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cachedAnggotaList,
    () => cachedAnggotaList,
  );

  const [loading, setLoading] = useState(cachedKelasList.length === 0);

  useEffect(() => {
    Promise.all([refreshKelasList(), refreshAnggotaList()]).finally(() => {
      setLoading(false);
    });
  }, []);

  return {
    kelasList,
    anggotaList,
    loading,
    refresh: () => Promise.all([refreshKelasList(), refreshAnggotaList()]),
  };
}
